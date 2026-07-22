import {
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RectArena } from './arena/RectArena'
import { stepBall, type BallState } from './physics/Ball'

const app = document.getElementById('app')!
const debug = document.getElementById('debug')!

// --- Renderer / scene ---
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x000008)
scene.fog = new Fog(0x000008, 30, 70)

const arena = new RectArena()
scene.add(arena.buildMesh())

// Camera sits just inside our (near, +z) end looking toward theirs (-z).
const camera = new PerspectiveCamera(55, 1, 0.1, 200)
camera.position.set(0, 0, arena.depth / 2 - 2)
camera.lookAt(0, 0, -arena.depth / 2)

// --- Ball ---
const ball: BallState = {
  pos: new Vector3(0, 0, 0),
  vel: new Vector3(6, 9, -22),
  radius: 0.9,
}
const ballMesh = new Mesh(
  new SphereGeometry(ball.radius, 24, 16),
  new MeshBasicMaterial({ color: 0x67e8f9 }),
)
scene.add(ballMesh)

// --- Fixed-timestep loop ---
const HZ = 120
const DT = 1 / HZ
const MAX_FRAME = 0.25
let acc = 0
let last = performance.now() / 1000
let bounceCount = 0

function serve() {
  ball.pos.set(0, 0, 0)
  // Random-ish serve toward the far end (deterministic seed-free for now).
  const ang = (Math.random() - 0.5) * 1.2
  const pitch = (Math.random() - 0.5) * 1.2
  const speed = 22
  ball.vel.set(Math.sin(ang) * speed, Math.sin(pitch) * speed, -Math.abs(Math.cos(ang) * speed))
}

function frame() {
  const now = performance.now() / 1000
  acc += Math.min(now - last, MAX_FRAME)
  last = now

  while (acc >= DT) {
    const r = stepBall(ball, arena, DT)
    if (r.bounces) bounceCount += r.bounces
    if (r.goal) {
      // No paddles yet: just re-serve so we can watch bounces continuously.
      serve()
    }
    acc -= DT
  }

  ballMesh.position.copy(ball.pos)

  debug.textContent =
    `pos ${fmt(ball.pos)}\n` +
    `vel ${fmt(ball.vel)}  |v| ${ball.vel.length().toFixed(1)}\n` +
    `bounces ${bounceCount}`

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function fmt(v: Vector3) {
  return `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`
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
