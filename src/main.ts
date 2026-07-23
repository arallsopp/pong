import {
  CircleGeometry,
  CylinderGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
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
  AI_PAL,
  PLAYER_PAL,
  makeMetalMatcap,
  makePaddleTexture,
  makeShadowTexture,
} from './game/textures'
import {
  AI_MAX_SPEED,
  BALL_R,
  BALL_START_SPEED,
  HALF_L,
  HALF_W,
  MATCH_SECONDS,
  PAD_R,
  RAMP_CAPTURE_R,
  RAMP_COOLDOWN,
  RAMP_RELEASE_BOOST,
  RAMP_SPEED,
  PLAYER_MAX_SPEED,
  clamp,
} from './game/const'
import { buildTable } from './game/table'
import { buildRamp } from './game/ramp'
import { stepBall, type Body } from './game/physics'

const app = document.getElementById('app')!
const scoreEl = document.getElementById('score')!
const bannerEl = document.getElementById('banner')!
const debugEl = document.getElementById('debug')!

// --- Renderer at full display resolution; the 16-bit look comes from the
// nearest-filtered bitmap textures on the geometry, not from downsampling. ---
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x1b2430)

scene.add(buildTable())
const ramp = buildRamp()
scene.add(ramp.group)

// Fixed, steep top-down camera raised high so the portrait table fills the
// screen. Nudge CAM_Y (height) and CAM_Z (tilt/back-off) to reframe.
const CAM_Y = 52
const CAM_Z = 15
const camera = new PerspectiveCamera(44, 1, 0.1, 200)
camera.position.set(0, CAM_Y, CAM_Z)
camera.lookAt(0, 0, 0)

// --- Ball: round, high-res, chrome (matcap so it needs no lights) ---
const ball: Body = { x: 0, z: 0, vx: 0, vz: 0, r: BALL_R }
let ballY = BALL_R // altitude, only leaves BALL_R while on the ramp
const ballMesh = new Mesh(
  new SphereGeometry(BALL_R, 48, 32),
  new MeshMatcapMaterial({ matcap: makeMetalMatcap() }),
)
scene.add(ballMesh)

// Dynamic ball shadow — projects straight down, growing and fading with height.
const ballShadow = new Mesh(
  new CircleGeometry(BALL_R * 1.3, 24),
  new MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
)
ballShadow.rotation.x = -Math.PI / 2
scene.add(ballShadow)

// --- Paddles (flat discs, textured metal) ---
function makePaddle(pal: typeof PLAYER_PAL): Mesh {
  const tex = makePaddleTexture(pal)
  const mats = [
    new MeshBasicMaterial({ color: pal.dark }), // side
    new MeshBasicMaterial({ map: tex }), // top cap
    new MeshBasicMaterial({ map: tex }), // bottom cap
  ]
  return new Mesh(new CylinderGeometry(PAD_R, PAD_R, 0.5, 48), mats)
}
const player: Body = { x: 0, z: HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const ai: Body = { x: 0, z: -HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const playerMesh = makePaddle(PLAYER_PAL)
const aiMesh = makePaddle(AI_PAL)
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

// --- Ramp state ---
let onRamp = false
let rampT = 0 // 0..1 along ramp.curve
let rampDir = 1 // +1 travels t 0→1, -1 travels 1→0
let rampCooldown = 0
const rampLen = ramp.curve.getLength()
const _cp = new Vector3()
const _tan = new Vector3()

function tryEnterRamp(): boolean {
  if (onRamp || rampCooldown > 0) return false
  const dxN = ball.x
  const dzN = ball.z - ramp.entryZ
  const dxF = ball.x
  const dzF = ball.z + ramp.entryZ
  const speed = Math.hypot(ball.vx, ball.vz)
  if (speed < 6) return false
  if (dxN * dxN + dzN * dzN < RAMP_CAPTURE_R * RAMP_CAPTURE_R) {
    onRamp = true
    rampT = 0
    rampDir = 1
    return true
  }
  if (dxF * dxF + dzF * dzF < RAMP_CAPTURE_R * RAMP_CAPTURE_R) {
    onRamp = true
    rampT = 1
    rampDir = -1
    return true
  }
  return false
}

function updateRamp(dt: number) {
  rampT += rampDir * (RAMP_SPEED / rampLen) * dt
  if (rampT <= 0 || rampT >= 1) {
    // Release at the far mouth along the exit tangent (auto accelerator boost).
    const exitT = rampDir > 0 ? 1 : 0
    ramp.curve.getPoint(exitT, _cp)
    ramp.curve.getTangent(exitT, _tan).multiplyScalar(rampDir)
    const dir = new Vector2(_tan.x, _tan.z)
    if (dir.lengthSq() < 1e-6) dir.set(0, rampDir > 0 ? -1 : 1)
    dir.normalize()
    const speed = BALL_START_SPEED * RAMP_RELEASE_BOOST
    ball.x = _cp.x
    ball.z = _cp.z
    ball.vx = dir.x * speed
    ball.vz = dir.y * speed
    ballY = BALL_R
    onRamp = false
    rampCooldown = RAMP_COOLDOWN
    return
  }
  ramp.curve.getPoint(rampT, _cp)
  ball.x = _cp.x
  ball.z = _cp.z
  ballY = _cp.y
}

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
  if (rampCooldown > 0) rampCooldown -= dt

  if (onRamp) {
    updateRamp(dt) // ball is on the rail; 2D physics suspended
    return
  }

  const goal = stepBall(ball, dt, [player, ai])
  if (goal === 'near') {
    scoreAI++
    serve(-1)
  } else if (goal === 'far') {
    scorePlayer++
    serve(1)
  } else {
    tryEnterRamp()
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

  ballMesh.position.set(ball.x, ballY, ball.z)
  // Ball shadow: directly below, growing and fading with altitude.
  const alt = ballY - BALL_R
  ballShadow.position.set(ball.x, 0.05, ball.z)
  const s = 1 + alt * 0.07
  ballShadow.scale.set(s, s, s)
  ;(ballShadow.material as MeshBasicMaterial).opacity = clamp(0.55 - alt * 0.03, 0.12, 0.55)
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
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

requestAnimationFrame(frame)
