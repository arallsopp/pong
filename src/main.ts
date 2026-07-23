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
import { makeMetalMatcap, makeShadowTexture } from './game/textures'
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
import { buildStars } from './game/stars'
import { GUN_R, SHOT_SPEED, DISABLE_SECONDS, makeGunMesh, makeShotMesh } from './game/guns'
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
const stars = buildStars()
scene.add(stars.group)

// 3D perspective view (table reads as a trapezoid, far end narrower). Lower and
// further back than a top-down cam so the ramp loops rise off the table. Nudge
// CAM_Y (height) / CAM_Z (back-off) / the lookAt to reframe.
const CAM_Y = 30
const CAM_Z = 26
const camera = new PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, CAM_Y, CAM_Z)
camera.lookAt(0, 1, -2)

// Shared chrome matcap (needs no lights) for the ball and paddles.
const metalMatcap = makeMetalMatcap()

// --- Ball: round, high-res, chrome ---
const ball: Body = { x: 0, z: 0, vx: 0, vz: 0, r: BALL_R }
let ballY = BALL_R // altitude, only leaves BALL_R while on the ramp
const ballMesh = new Mesh(
  new SphereGeometry(BALL_R, 48, 32),
  new MeshMatcapMaterial({ matcap: metalMatcap }),
)
scene.add(ballMesh)

// Dynamic ball shadow — projects straight down, growing and fading with height.
const ballShadow = new Mesh(
  new CircleGeometry(BALL_R * 1.3, 24),
  new MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
)
ballShadow.rotation.x = -Math.PI / 2
scene.add(ballShadow)

// --- Paddles: short metal blue-grey cylinders ---
const PADDLE_H = 0.85
function makePaddle(tint: number): Mesh {
  return new Mesh(
    new CylinderGeometry(PAD_R, PAD_R, PADDLE_H, 48),
    new MeshMatcapMaterial({ matcap: metalMatcap, color: tint }),
  )
}
const player: Body = { x: 0, z: HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const ai: Body = { x: 0, z: -HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const playerMesh = makePaddle(0x9fb4cc) // lighter steel-blue (ours, bottom)
const aiMesh = makePaddle(0x7d8ea3) // steel-grey (theirs, top)
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
renderer.domElement.addEventListener('pointerup', () => {
  pointerActive = false
  fireGun() // releasing while the paddle covers a gun fires it
})
renderer.domElement.addEventListener('pointercancel', () => (pointerActive = false))

// --- Match state ---
let scorePlayer = 0
let scoreAI = 0
let timeLeft = MATCH_SECONDS
let over = false

// Tug-of-war multiplier: possession = last paddle to touch the ball.
let possession: 0 | 1 | null = null
let balance = 0 // −2..+2, positive favours us
let wasAtLeftWall = false

// --- Weapons: pick up a gun with the paddle, release to fire ---
interface Gun {
  x: number
  z: number
  mesh: Mesh
}
interface Shot {
  z: number
  mesh: Mesh
}
const guns: Gun[] = []
const shots: Shot[] = []
let gunTimer = 5
let aiDisabled = 0 // seconds the AI paddle stays frozen

// --- Ramp state ---
let onRamp = false
let rampPhase = 0 // 0..1 fraction of the ramp traversed since entry
let rampDir = 1 // +1 enters at tip A (u:0→1), -1 enters at tip A' (u:1→0)
let rampCooldown = 0
const rampLen = ramp.length
const _cp = new Vector3()
const _tan = new Vector3()

function tryEnterRamp() {
  if (onRamp || rampCooldown > 0) return
  const speed = Math.hypot(ball.vx, ball.vz)
  if (speed < 6) return
  const vnx = ball.vx / speed
  const vnz = ball.vz / speed
  for (let i = 0; i < ramp.entryPoints.length; i++) {
    const e = ramp.entryPoints[i]
    const dx = ball.x - e.x
    const dz = ball.z - e.z
    if (dx * dx + dz * dz >= RAMP_CAPTURE_R * RAMP_CAPTURE_R) continue
    // Only capture when the ball is moving roughly parallel INTO the rails at
    // this tip — so a ball crossing the mouth sideways isn't swallowed.
    const sign = i === 0 ? 1 : -1
    ramp.curve.getTangent(i === 0 ? 0 : 1, _tan).multiplyScalar(sign)
    const al = Math.hypot(_tan.x, _tan.z) || 1
    if ((vnx * _tan.x + vnz * _tan.z) / al < 0.7) continue // ~45° tolerance
    onRamp = true
    rampPhase = 0
    rampDir = sign
    return
  }
}

function updateRamp(dt: number) {
  rampPhase += (RAMP_SPEED / rampLen) * dt
  if (rampPhase >= 1) {
    // Reached the far tip: release along the exit tangent with a boost.
    const uEnd = rampDir > 0 ? 1 : 0
    ramp.ride(uEnd, _cp)
    ramp.curve.getTangent(uEnd, _tan).multiplyScalar(rampDir)
    const dir = new Vector2(_tan.x, _tan.z)
    if (dir.lengthSq() < 1e-6) dir.set(0, 1)
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
  const u = rampDir > 0 ? rampPhase : 1 - rampPhase
  ramp.ride(u, _cp)
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
  ballY = BALL_R
  onRamp = false
  possession = null
  rampCooldown = 1.0 // don't let the ramp grab the ball at kickoff
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
  if (aiDisabled > 0) {
    aiDisabled -= dt
    ai.vx = 0
    ai.vz = 0
  } else {
    updateAI(dt)
  }
  if (rampCooldown > 0) rampCooldown -= dt
  updateWeapons(dt)

  if (onRamp) {
    updateRamp(dt) // ball is on the rail; 2D physics suspended
    return
  }

  const res = stepBall(ball, dt, [player, ai])
  if (res.hitIndex === 0) possession = 0
  else if (res.hitIndex === 1) possession = 1

  if (res.goal === 'near') {
    scoreAI += 1 + (balance < 0 ? -balance : 0) // opponent's multiplier
    serve(-1)
    return
  }
  if (res.goal === 'far') {
    scorePlayer += 1 + (balance > 0 ? balance : 0) // our multiplier
    serve(1)
    return
  }

  checkStarHit()
  tryEnterRamp()
}

// Tug-of-war: when the ball (owned by someone) strikes a star on the left wall,
// nudge the balance toward the owner's side.
function checkStarHit() {
  const atLeft = ball.x <= -(HALF_W - BALL_R) + 0.06
  if (atLeft && !wasAtLeftWall && possession !== null) {
    for (const p of stars.positions) {
      if (Math.abs(ball.z - p.z) < 1.7) {
        balance = clamp(balance + (possession === 0 ? 1 : -1), -2, 2)
        stars.setBalance(balance)
        break
      }
    }
  }
  wasAtLeftWall = atLeft
}

function updateWeapons(dt: number) {
  gunTimer -= dt
  if (gunTimer <= 0 && guns.length === 0) {
    spawnGun()
    gunTimer = 7 + Math.random() * 6
  }
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    s.z -= SHOT_SPEED * dt
    s.mesh.position.z = s.z
    if (s.z <= ai.z) {
      aiDisabled = DISABLE_SECONDS
      scene.remove(s.mesh)
      shots.splice(i, 1)
    } else if (s.z < -HALF_L) {
      scene.remove(s.mesh)
      shots.splice(i, 1)
    }
  }
}

function spawnGun() {
  const x = (Math.random() * 2 - 1) * (HALF_W - 2.5)
  const z = 2 + Math.random() * (HALF_L - 4) // our half, reachable by the paddle
  const mesh = makeGunMesh()
  mesh.position.set(x, 0.12, z)
  scene.add(mesh)
  guns.push({ x, z, mesh })
}

function fireGun() {
  const idx = guns.findIndex(
    (g) => (g.x - player.x) ** 2 + (g.z - player.z) ** 2 < (PAD_R + GUN_R) ** 2,
  )
  if (idx < 0) return
  scene.remove(guns[idx].mesh)
  guns.splice(idx, 1)
  const mesh = makeShotMesh()
  mesh.position.set(player.x, 0.5, player.z)
  scene.add(mesh)
  shots.push({ z: player.z, mesh })
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
  playerMesh.position.set(player.x, PADDLE_H / 2, player.z)
  aiMesh.position.set(ai.x, PADDLE_H / 2, ai.z)
  // AI flashes red while disabled by a shot.
  ;(aiMesh.material as MeshMatcapMaterial).color.set(aiDisabled > 0 ? 0xd23b3b : 0x7d8ea3)
  // Highlight a gun the paddle is hovering (ready to fire on release).
  for (const g of guns) {
    const over = (g.x - player.x) ** 2 + (g.z - player.z) ** 2 < (PAD_R + GUN_R) ** 2
    g.mesh.scale.setScalar(over ? 1.3 : 1)
  }

  const mm = Math.floor(timeLeft / 60)
  const ss = Math.floor(timeLeft % 60)
  scoreEl.textContent = `${pad(scorePlayer)}   ${mm}:${String(ss).padStart(2, '0')}   ${pad(scoreAI)}`
  const bal = balance > 0 ? `+${balance} us` : balance < 0 ? `${-balance} them` : 'even'
  debugEl.textContent =
    `|v| ${Math.hypot(ball.vx, ball.vz).toFixed(0)}  mult ${bal}` +
    (aiDisabled > 0 ? `  AI OUT ${aiDisabled.toFixed(1)}` : '') +
    (guns.length ? '  GUN!' : '')

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
