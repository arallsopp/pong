import {
  CylinderGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  AI_MAX_SPEED,
  BALL_R,
  BALL_START_SPEED,
  HALF_L,
  HALF_W,
  MATCH_SECONDS,
  PAD_R,
  PLAYER_MAX_SPEED,
  clamp,
} from './game/const'
import { buildTable } from './game/table'
import { stepBall, type Body } from './game/physics'

const app = document.getElementById('app')!
const scoreEl = document.getElementById('score')!
const bannerEl = document.getElementById('banner')!
const debugEl = document.getElementById('debug')!

// --- Renderer with a low-res backing store (nearest-upscaled by CSS) ---
const PIXEL_SCALE = 4
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(1)
app.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x1b2430)

scene.add(buildTable())

// Fixed tilted top-down camera, framing the portrait table.
const camera = new PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, 34, HALF_L + 20)
camera.lookAt(0, 0, 1)

// --- Ball ---
const ball: Body = { x: 0, z: 0, vx: 0, vz: 0, r: BALL_R }
const ballMesh = new Mesh(
  new SphereGeometry(BALL_R, 20, 14),
  new MeshBasicMaterial({ color: 0xffe066 }),
)
scene.add(ballMesh)

// --- Paddles (flat discs) ---
function makePaddle(color: number): Mesh {
  return new Mesh(new CylinderGeometry(PAD_R, PAD_R, 0.5, 24), new MeshBasicMaterial({ color }))
}
const player: Body = { x: 0, z: HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const ai: Body = { x: 0, z: -HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const playerMesh = makePaddle(0x4aa3ff)
const aiMesh = makePaddle(0xff7a3c)
scene.add(playerMesh, aiMesh)

// --- Direct touch-drag: raycast pointer to the table plane ---
const raycaster = new Raycaster()
const tablePlane = new Plane(new Vector3(0, 1, 0), 0)
const ndc = new Vector2()
const hitPoint = new Vector3()
let pointerActive = false
let targetX = player.x
let targetZ = player.z

function updatePointer(e: PointerEvent) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (raycaster.ray.intersectPlane(tablePlane, hitPoint)) {
    // Confine to our half (z in [~0, HALF_L]) and inside the side walls.
    targetX = clamp(hitPoint.x, -(HALF_W - PAD_R), HALF_W - PAD_R)
    targetZ = clamp(hitPoint.z, PAD_R * 0.3, HALF_L - PAD_R)
  }
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerActive = true
  updatePointer(e)
})
renderer.domElement.addEventListener('pointermove', (e) => {
  if (pointerActive) updatePointer(e)
})
renderer.domElement.addEventListener('pointerup', () => (pointerActive = false))
renderer.domElement.addEventListener('pointercancel', () => (pointerActive = false))

// --- Match state ---
let scorePlayer = 0
let scoreAI = 0
let timeLeft = MATCH_SECONDS
let over = false

function serve(toward: number) {
  ball.x = 0
  ball.z = 0
  const ang = (Math.random() - 0.5) * 1.0
  ball.vx = Math.sin(ang) * BALL_START_SPEED
  ball.vz = toward * Math.abs(Math.cos(ang) * BALL_START_SPEED)
}
serve(Math.random() < 0.5 ? 1 : -1)

// --- Fixed-timestep loop ---
const HZ = 120
const DT = 1 / HZ
const MAX_FRAME = 0.25
let acc = 0
let last = performance.now() / 1000

function moveBody(b: Body, tx: number, tz: number, maxSpeed: number, dt: number) {
  const step = maxSpeed * dt
  const ox = b.x
  const oz = b.z
  b.x += clamp(tx - b.x, -step, step)
  b.z += clamp(tz - b.z, -step, step)
  b.vx = (b.x - ox) / dt
  b.vz = (b.z - oz) / dt
}

function updateAI(dt: number) {
  // Track the ball's x; advance toward it only when it's in the AI half.
  const tx = clamp(ball.x, -(HALF_W - PAD_R), HALF_W - PAD_R)
  const tz = ball.vz < 0 ? clamp(ball.z, -(HALF_L - PAD_R), -PAD_R * 0.3) : -HALF_L * 0.55
  moveBody(ai, tx, tz, AI_MAX_SPEED, dt)
}

function update(dt: number) {
  moveBody(player, targetX, targetZ, PLAYER_MAX_SPEED, dt)
  updateAI(dt)
  const goal = stepBall(ball, dt, [player, ai])
  if (goal === 'near') {
    scoreAI++
    serve(-1)
  } else if (goal === 'far') {
    scorePlayer++
    serve(1)
  }
}

function frame() {
  const now = performance.now() / 1000
  const frameDt = Math.min(now - last, MAX_FRAME)
  last = now

  if (!over) {
    timeLeft -= frameDt
    if (timeLeft <= 0) {
      timeLeft = 0
      over = true
      bannerEl.style.display = 'flex'
      bannerEl.textContent = `MATCH OVER\nSCORE ${pad(scorePlayer)} TO ${pad(scoreAI)}`
    }
    acc += frameDt
    while (acc >= DT) {
      update(DT)
      acc -= DT
    }
  }

  ballMesh.position.set(ball.x, BALL_R, ball.z)
  playerMesh.position.set(player.x, 0.25, player.z)
  aiMesh.position.set(ai.x, 0.25, ai.z)

  const mm = Math.floor(timeLeft / 60)
  const ss = Math.floor(timeLeft % 60)
  scoreEl.textContent = `${pad(scorePlayer)}   ${mm}:${String(ss).padStart(2, '0')}   ${pad(scoreAI)}`
  debugEl.textContent = `|v| ${Math.hypot(ball.vx, ball.vz).toFixed(0)}`

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function pad(n: number) {
  return String(n).padStart(3, '0')
}

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  // Low internal resolution → nearest-upscaled to the display for pixelation.
  renderer.setSize(Math.ceil(w / PIXEL_SCALE), Math.ceil(h / PIXEL_SCALE), false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

requestAnimationFrame(frame)
