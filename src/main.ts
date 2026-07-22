import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Fog,
  Line,
  LineBasicMaterial,
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
import { predictImpact, stepBall, type BallState } from './physics/Ball'
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

// --- Camera: coupled to the player paddle. Two live-tunable knobs:
//   coupling  = how far the camera moves vs the paddle (spatial, 0..1)
//   tau       = follow lag in seconds (temporal damping; 0 = rigid snap)
// Adjust in-session: [ ] change coupling, - = change tau, R toggles reticle.
const tuning = { coupling: 0.7, tau: 0.07, reticle: true }
const CAM_MARGIN = 1.5 // how close the camera may get to a wall before clamping
const camZ = paddleZ + 2.5
const camera = new PerspectiveCamera(55, 1, 0.1, 200)
const camXY = { x: 0, y: 0 } // damped camera position, eased toward target

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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

// Floor shadow — a spot on the bottom wall directly below the ball. Its z races
// up the floor grid as the ball nears, which is the primary "approach" cue.
const floorY = -arena.hy + 0.05
const shadow = new Mesh(
  new CircleGeometry(ball.radius, 24),
  new MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35 }),
)
shadow.rotation.x = -Math.PI / 2 // lay flat on the floor (normal +y)
scene.add(shadow)

// Drop-line connecting the ball to its shadow — reads the ball's height and,
// together with the shadow, disambiguates depth from vertical position.
const dropGeo = new BufferGeometry()
dropGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
const dropLine = new Line(
  dropGeo,
  new LineBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.6 }),
)
scene.add(dropLine)

// Predicted-impact reticle: where the incoming ball will cross the paddle plane.
const reticle = new Mesh(
  new RingGeometry(0.6, 0.9, 24),
  new MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 }),
)
reticle.visible = false
scene.add(reticle)

// --- Input ---
const stick = new Stick(renderer.domElement)

// Desktop tuning keys so the camera feel can be dialled in live.
window.addEventListener('keydown', (e) => {
  if (e.key === '[') tuning.coupling = Math.max(0, +(tuning.coupling - 0.1).toFixed(2))
  else if (e.key === ']') tuning.coupling = Math.min(1, +(tuning.coupling + 0.1).toFixed(2))
  else if (e.key === '-') tuning.tau = Math.max(0, +(tuning.tau - 0.02).toFixed(2))
  else if (e.key === '=') tuning.tau = +(tuning.tau + 0.02).toFixed(2)
  else if (e.key.toLowerCase() === 'r') tuning.reticle = !tuning.reticle
})

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
  const frameDt = Math.min(now - last, MAX_FRAME)
  acc += frameDt
  last = now
  while (acc >= DT) {
    update(DT)
    acc -= DT
  }

  // Camera target = paddle position scaled by coupling, then clamped to stay a
  // small margin inside the walls. This is independent of the paddle's own
  // (wider) bounds: the paddle can overhang into the corner while the camera
  // gets very close but never crosses the wall and clips the corner geometry.
  const cmx = arena.hx - CAM_MARGIN
  const cmy = arena.hy - CAM_MARGIN
  const targetX = clamp(player.x * tuning.coupling, -cmx, cmx)
  const targetY = clamp(player.y * tuning.coupling, -cmy, cmy)
  const k = tuning.tau > 0 ? 1 - Math.exp(-frameDt / tuning.tau) : 1
  camXY.x += (targetX - camXY.x) * k
  camXY.y += (targetY - camXY.y) * k
  camera.position.set(camXY.x, camXY.y, camZ)
  camera.lookAt(camXY.x, camXY.y, -arena.depth)

  ballMesh.position.copy(ball.pos)
  aiMesh.position.set(ai.x, ai.y, ai.z)

  // Floor shadow tracks the ball's x/z; scale it up as the ball nears the player
  // so approach reads as a growing spot as well as a racing one.
  const nearT = (ball.pos.z + arena.depth / 2) / arena.depth // 0 far … 1 near
  shadow.position.set(ball.pos.x, floorY, ball.pos.z)
  shadow.scale.setScalar(0.7 + nearT * 0.9)
  const dp = dropLine.geometry.getAttribute('position') as Float32BufferAttribute
  dp.setXYZ(0, ball.pos.x, ball.pos.y, ball.pos.z)
  dp.setXYZ(1, ball.pos.x, floorY, ball.pos.z)
  dp.needsUpdate = true

  // Predicted-impact reticle on the player's paddle plane.
  const hit = tuning.reticle ? predictImpact(ball, arena, paddleZ, DT) : null
  if (hit) {
    reticle.position.set(hit.x, hit.y, paddleZ)
    reticle.visible = true
  } else {
    reticle.visible = false
  }

  debug.textContent =
    `you ${scorePlayer} — ${scoreAI} ai\n` +
    `rally hits ${rallyHits}\n` +
    `|v| ${ball.vel.length().toFixed(1)}  z ${ball.pos.z.toFixed(1)}\n` +
    `coupling ${tuning.coupling}  tau ${tuning.tau}  reticle ${tuning.reticle ? 'on' : 'off'}`

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
