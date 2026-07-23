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
import { sfx } from './game/sound'

const app = document.getElementById('app')!
const scoreEl = document.getElementById('score')!
const bannerEl = document.getElementById('banner')!
const debugEl = document.getElementById('debug')!
const muteEl = document.getElementById('mute') as HTMLButtonElement

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
// further back than a top-down cam so the ramp loops rise off the table.
// --- Camera framing dials (tune here) ---
const CAM_TARGET = new Vector3(0, 1, -2) // where the camera looks
const CAM_BASE = new Vector3(0, 30, 26) // landscape "resting" position
// On a narrow (portrait) phone the table's width would crop, so we pull the
// camera back proportionally until the full width fits. BASE_ASPECT is where no
// pull-back is needed; MAX_ZOOMOUT caps it on very tall screens.
const BASE_ASPECT = 1.3
const MAX_ZOOMOUT = 2.2
// As a rally builds, the camera eases lower for a flatter, tenser angle.
const RALLY_FULL = 12 // paddle hits to reach the lowest angle
const RALLY_LOWER_MAX = 0.5 // fraction of height dropped at full rally
const RALLY_CAM_SPEED = 1.6 // how fast the camera eases toward the target angle
const camera = new PerspectiveCamera(50, 1, 0.1, 200)
camera.position.copy(CAM_BASE)
camera.lookAt(CAM_TARGET)

let rally = 0 // consecutive paddle hits since the last serve
let rallyLower = 0 // smoothed 0..1 camera-lowering amount

function updateCamera(frameDt: number) {
  // Ease the lowering toward the current rally level (0 while served out).
  const low = clamp(rally / RALLY_FULL, 0, 1)
  rallyLower += (low - rallyLower) * Math.min(1, frameDt * RALLY_CAM_SPEED)

  const fit = camera.aspect < BASE_ASPECT ? Math.min(BASE_ASPECT / camera.aspect, MAX_ZOOMOUT) : 1
  let offY = (CAM_BASE.y - CAM_TARGET.y) * fit
  let offZ = (CAM_BASE.z - CAM_TARGET.z) * fit
  const drop = rallyLower * RALLY_LOWER_MAX
  offY *= 1 - drop // lower the eye
  offZ *= 1 + drop * 0.25 // drift back a touch so the table stays framed
  camera.position.set(CAM_TARGET.x, CAM_TARGET.y + offY, CAM_TARGET.z + offZ)
  camera.lookAt(CAM_TARGET)
}

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

// One soft blob-shadow texture, shared by the ball and both paddles.
const shadowTex = makeShadowTexture()

// Dynamic ball shadow — projects straight down, growing and fading with height.
const ballShadow = new Mesh(
  new CircleGeometry(BALL_R * 1.3, 24),
  new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
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

// Flat blob-shadows under each paddle (they sit on the table, so these are a
// constant size — just track x/z, nudged slightly toward the viewer).
function makePaddleShadow(): Mesh {
  const m = new Mesh(
    new CircleGeometry(PAD_R * 1.15, 24),
    new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }),
  )
  m.rotation.x = -Math.PI / 2
  return m
}
const playerShadow = makePaddleShadow()
const aiShadow = makePaddleShadow()
scene.add(playerShadow, aiShadow)

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
  sfx.unlock() // first gesture: satisfy the audio autoplay policy
  pointerActive = true
  updatePointer(e)
})
renderer.domElement.addEventListener('pointermove', (e) => {
  if (pointerActive) updatePointer(e)
})
renderer.domElement.addEventListener('pointerup', () => (pointerActive = false))
renderer.domElement.addEventListener('pointercancel', () => (pointerActive = false))

// Mute toggle (top-right HUD button).
muteEl.addEventListener('click', () => {
  const m = !sfx.isMuted()
  sfx.setMuted(m)
  muteEl.textContent = m ? '🔇' : '🔊'
})

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
  x: number
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
    sfx.rampIn()
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
    sfx.rampOut()
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
  rally = 0 // fresh point: let the camera ease back up
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
  tryPickupGun()

  if (onRamp) {
    updateRamp(dt) // ball is on the rail; 2D physics suspended
    return
  }

  const res = stepBall(ball, dt, [player, ai])
  if (res.hitIndex === 0) {
    possession = 0
    rally++
    sfx.paddle(Math.hypot(ball.vx, ball.vz))
  } else if (res.hitIndex === 1) {
    possession = 1
    rally++
    sfx.paddle(Math.hypot(ball.vx, ball.vz))
  } else if (res.wall) {
    sfx.wall()
  }

  if (res.goal === 'near') {
    scoreAI += 1 + (balance < 0 ? -balance : 0) // opponent's multiplier
    sfx.goalThem()
    serve(-1)
    return
  }
  if (res.goal === 'far') {
    scorePlayer += 1 + (balance > 0 ? balance : 0) // our multiplier
    sfx.goalUs()
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
        sfx.star()
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
  // Bolts home in on the AI paddle — auto-targeting.
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    const dx = ai.x - s.x
    const dz = ai.z - s.z
    const d = Math.hypot(dx, dz) || 1
    s.x += (dx / d) * SHOT_SPEED * dt
    s.z += (dz / d) * SHOT_SPEED * dt
    s.mesh.position.set(s.x, 0.5, s.z)
    s.mesh.rotation.y = Math.atan2(dx, dz) // point the bolt along its heading
    if (d < PAD_R + 0.4) {
      aiDisabled = DISABLE_SECONDS
      sfx.zap()
      scene.remove(s.mesh)
      shots.splice(i, 1)
    } else if (Math.abs(s.z) > HALF_L + 2 || Math.abs(s.x) > HALF_W + 2) {
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

// Touching a gun with the paddle grabs it immediately (token vanishes at once)
// and fires an auto-targeting bolt at the opponent.
function tryPickupGun() {
  for (let i = guns.length - 1; i >= 0; i--) {
    const g = guns[i]
    if ((g.x - player.x) ** 2 + (g.z - player.z) ** 2 < (PAD_R + GUN_R) ** 2) {
      scene.remove(g.mesh)
      guns.splice(i, 1)
      fireShot()
    }
  }
}

function fireShot() {
  const mesh = makeShotMesh()
  mesh.position.set(player.x, 0.5, player.z)
  scene.add(mesh)
  shots.push({ x: player.x, z: player.z, mesh })
  sfx.gun()
}

// Clear win/lose/draw scoreboard at the final whistle.
function endMatch() {
  const result = scorePlayer > scoreAI ? 'win' : scorePlayer < scoreAI ? 'lose' : 'draw'
  const headline = result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW'
  bannerEl.style.display = 'flex'
  bannerEl.className = result // color via CSS (win = amber, lose = red, draw = grey)
  bannerEl.textContent = `${headline}\nYOU ${pad(scorePlayer)}   AI ${pad(scoreAI)}`
  if (result === 'win') sfx.win()
  else if (result === 'lose') sfx.lose()
  else sfx.draw()
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
      endMatch()
    }
    acc += frameDt
    while (acc >= DT) {
      update(DT)
      acc -= DT
    }
  }

  updateCamera(frameDt)

  ballMesh.position.set(ball.x, ballY, ball.z)
  // Ball shadow: directly below, growing and fading with altitude.
  const alt = ballY - BALL_R
  ballShadow.position.set(ball.x, 0.05, ball.z)
  const s = 1 + alt * 0.07
  ballShadow.scale.set(s, s, s)
  ;(ballShadow.material as MeshBasicMaterial).opacity = clamp(0.55 - alt * 0.03, 0.12, 0.55)
  playerMesh.position.set(player.x, PADDLE_H / 2, player.z)
  aiMesh.position.set(ai.x, PADDLE_H / 2, ai.z)
  // Paddle shadows track their paddle, nudged slightly toward the viewer (+z).
  playerShadow.position.set(player.x, 0.04, player.z + 0.2)
  aiShadow.position.set(ai.x, 0.04, ai.z + 0.2)
  // AI flashes red while disabled by a shot.
  ;(aiMesh.material as MeshMatcapMaterial).color.set(aiDisabled > 0 ? 0xd23b3b : 0x7d8ea3)

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
