import {
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RectArena } from './arena/RectArena'
import { stepBall, type BallState } from './physics/Ball'
import { Paddle } from './physics/Paddle'
import { Stick } from './input/Stick'

const app = document.getElementById('app')!
const debug = document.getElementById('debug')!

// --- Renderer / scene ---
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x000008)
scene.fog = new Fog(0x000008, 30, 80)

const arena = new RectArena()
scene.add(arena.buildMesh())

// --- Paddles ---
// Near paddle (player) defends the +z end; far paddle (AI) defends -z.
const paddleZ = arena.depth / 2 - 4
const player = new Paddle(paddleZ, 1)
const ai = new Paddle(-paddleZ, -1)

// A faint convex disc for the AI paddle so you can see what you're rallying with.
const aiMesh = new Mesh(
  new RingGeometry(0.2, ai.radius, 32),
  new MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.5 }),
)
scene.add(aiMesh)

// --- Camera: rigidly locked to the player paddle (coupling tunable 0..1) ---
const CAMERA_COUPLING = 1.0
const camZ = paddleZ + 2.5
const camera = new PerspectiveCamera(55, 1, 0.1, 200)

// --- Ball ---
const ball: BallState = {
  pos: new Vector3(0, 0, 0),
  vel: new Vector3(),
  radius: 0.9,
}
const ballMesh = new Mesh(
  new SphereGeometry(ball.radius, 24, 16),
  new MeshBasicMaterial({ color: 0x67e8f9 }),
)
scene.add(ballMesh)

// --- Input ---
const stick = new Stick(renderer.domElement)

// --- Match state ---
let scorePlayer = 0
let scoreAI = 0
let rallyHits = 0

function serve(toward: 1 | -1) {
  // Serve from just in front of the server's paddle toward the other end.
  const fromZ = toward > 0 ? -paddleZ + 2 : paddleZ - 2
  ball.pos.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, fromZ)
  const speed = 20
  const ax = (Math.random() - 0.5) * 0.9
  const ay = (Math.random() - 0.5) * 0.9
  ball.vel.set(Math.sin(ax) * speed, Math.sin(ay) * speed, toward * Math.abs(Math.cos(ax) * speed))
  rallyHits = 0
}
serve(1) // first serve travels toward the player

// --- Fixed-timestep loop ---
const HZ = 120
const DT = 1 / HZ
const MAX_FRAME = 0.25
const PADDLE_SPEED = 34
const AI_SPEED = 22 // deliberately beatable
let acc = 0
let last = performance.now() / 1000

function update(dt: number) {
  // Player paddle target from stick, integrated for an analog feel.
  const tx = player.x + stick.x * PADDLE_SPEED * dt
  const ty = player.y + stick.y * PADDLE_SPEED * dt
  player.moveToward(tx, ty, PADDLE_SPEED, dt, arena)

  // AI tracks the ball's x/y with capped speed (its beatability lever).
  ai.moveToward(ball.pos.x, ball.pos.y, AI_SPEED, dt, arena)

  const r = stepBall(ball, arena, dt, [player, ai])
  if (r.paddleHit) rallyHits++
  if (r.goal === 'near') {
    scoreAI++
    serve(1)
  } else if (r.goal === 'far') {
    scorePlayer++
    serve(-1)
  }
}

function frame() {
  const now = performance.now() / 1000
  acc += Math.min(now - last, MAX_FRAME)
  last = now
  while (acc >= DT) {
    update(DT)
    acc -= DT
  }

  // Rigid camera: translate with the paddle, looking straight down-court.
  camera.position.set(player.x * CAMERA_COUPLING, player.y * CAMERA_COUPLING, camZ)
  camera.lookAt(player.x * CAMERA_COUPLING, player.y * CAMERA_COUPLING, -arena.depth)

  ballMesh.position.copy(ball.pos)
  aiMesh.position.set(ai.x, ai.y, ai.z)

  debug.textContent =
    `you ${scorePlayer} — ${scoreAI} ai\n` +
    `rally hits ${rallyHits}\n` +
    `|v| ${ball.vel.length().toFixed(1)}  z ${ball.pos.z.toFixed(1)}`

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

requestAnimationFrame(frame)
