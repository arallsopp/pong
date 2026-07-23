import {
  AdditiveBlending,
  BoxGeometry,
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
  COLOR_ME,
  COLOR_THEM,
  CORNER_ESCAPE_TIME,
  CORNER_ESCAPE_ZONE,
  HALF_L,
  HALF_W,
  MATCH_SECONDS,
  PAD_R,
  RAMP_AIM_DOT,
  RAMP_CAPTURE_R,
  RAMP_COOLDOWN,
  RAMP_MISS,
  RAMP_RELEASE_BOOST,
  RAMP_SPEED,
  PLAYER_MAX_SPEED,
  SLOTS,
  TARGET_HIT_Z,
  clamp,
} from './game/const'
import { buildTable } from './game/table'
import { buildRamp } from './game/ramp'
import { buildTargets } from './game/stars'
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
const targets = buildTargets()
scene.add(targets.group)

// 3D perspective view (table reads as a trapezoid, far end narrower). The look
// *angle* is fixed (CAM_DIR_REF); the *distance* is solved every frame so the
// table is as large as possible while all four corners stay in view — so it
// fits any viewport (portrait phone, wide desktop) with no cropping.
// --- Camera framing dials (tune here) ---
const CAM_TARGET = new Vector3(0, 1, -2) // where the camera looks
const CAM_DIR_REF = new Vector3(0, 29, 28) // look direction (angle) from the target
const CORNER_MARGIN = 0.96 // corners sit within 96% of the frame at max zoom (small border)
// As a rally builds, the camera eases *slightly* lower for a subtly tenser
// angle — only a few degrees, and very slowly. Keep these small.
const RALLY_FULL = 16 // paddle hits to reach the (gentle) lowest angle
const RALLY_LOWER_MAX = 0.12 // fraction of height dropped at full rally (~4°)
const RALLY_CAM_SPEED = 0.4 // slow ease toward the target angle (~3s constant)
// Opening shot: zoom from a wider view into the fitted play view before play.
const INTRO_SECONDS = 1
const INTRO_START_SCALE = 1.5 // how far out the opening shot begins, vs the fit

const camera = new PerspectiveCamera(50, 1, 0.1, 200)
camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR_REF, 1.5)
camera.lookAt(CAM_TARGET)

let rally = 0 // consecutive paddle hits since the last serve
let rallyLower = 0 // smoothed 0..1 camera-lowering amount

// The four table-floor corners; the fit keeps all of these on-screen.
const CAM_CORNERS = [
  new Vector3(HALF_W, 0, HALF_L),
  new Vector3(-HALF_W, 0, HALF_L),
  new Vector3(HALF_W, 0, -HALF_L),
  new Vector3(-HALF_W, 0, -HALF_L),
]
const _dir = new Vector3()
const _fitPos = new Vector3()
const _introStart = new Vector3()
const _proj = new Vector3()

// Look direction after the (gentle) rally-lowering is applied, into `out`.
function rallyDir(out: Vector3) {
  const drop = rallyLower * RALLY_LOWER_MAX
  out.set(0, CAM_DIR_REF.y * (1 - drop), CAM_DIR_REF.z * (1 + drop * 0.1))
}

// Do all four corners project inside the frame with the camera `k` units along
// `dir` from the target? (Mutates the camera — callers set the final pose.)
function cornersFit(dir: Vector3, k: number): boolean {
  camera.position.copy(CAM_TARGET).addScaledVector(dir, k)
  camera.lookAt(CAM_TARGET)
  camera.updateMatrixWorld()
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  for (const c of CAM_CORNERS) {
    _proj.copy(c).project(camera)
    if (Math.abs(_proj.x) > CORNER_MARGIN || Math.abs(_proj.y) > CORNER_MARGIN) return false
  }
  return true
}

// Smallest distance scale along `dir` (largest table) that still fits the
// corners — binary search between a near and a far bound.
function fitScale(dir: Vector3): number {
  let lo = 0.3 // too close: corners spill off-screen
  let hi = 5 // far enough that everything fits
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (cornersFit(dir, mid)) hi = mid
    else lo = mid
  }
  return hi
}

function updateCamera(frameDt: number) {
  // Ease the lowering toward the current rally level (0 while served out).
  const low = clamp(rally / RALLY_FULL, 0, 1)
  rallyLower += (low - rallyLower) * Math.min(1, frameDt * RALLY_CAM_SPEED)
  rallyDir(_dir)
  _fitPos.copy(CAM_TARGET).addScaledVector(_dir, fitScale(_dir))
  camera.position.copy(_fitPos)
  camera.lookAt(CAM_TARGET)
}

// Opening zoom: ease from a wider shot into the fitted play view. Returns true
// once the intro has finished.
function updateIntro(elapsed: number) {
  const t = clamp(elapsed / INTRO_SECONDS, 0, 1)
  const e = 1 - Math.pow(1 - t, 3) // ease-out cubic
  rallyDir(_dir) // rally is 0 pre-play, so this is the resting angle
  const k = fitScale(_dir)
  _fitPos.copy(CAM_TARGET).addScaledVector(_dir, k)
  _introStart.copy(CAM_TARGET).addScaledVector(_dir, k * INTRO_START_SCALE)
  camera.position.lerpVectors(_introStart, _fitPos, e)
  camera.lookAt(CAM_TARGET)
  return t >= 1
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

// --- Murderball look: electric-blue when ours, electric-pink when theirs. ---
const MB_SECONDS = 8 // length of the unstoppable window
// Additive glow halo around the ball, shown only while murderball is armed.
const ballGlow = new Mesh(
  new SphereGeometry(BALL_R * 1.9, 24, 16),
  new MeshBasicMaterial({ color: COLOR_ME, transparent: true, blending: AdditiveBlending, depthWrite: false }),
)
ballGlow.visible = false
scene.add(ballGlow)

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

// Possession = last paddle to touch the ball; it claims targets it strikes.
let possession: 0 | 1 | null = null
let cornerTime = 0 // seconds the ball has dwelled in a corner (anti-trap)

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

// --- Murderball: armed for a side after clearing the ramp. While active, the
// ball glows that side's colour and phases straight through the OPPONENT paddle,
// shattering it, until it scores or the window runs out. ---
const BREAK_SECONDS = 2.5 // how long a shattered paddle stays out before reforming
let murderball: 0 | 1 | null = null // which side's murderball is live (0 = us)
let mbTimer = 0 // seconds of the window remaining
let playerBroken = 0 // seconds the player paddle stays shattered
let aiBroken = 0

interface Shard {
  mesh: Mesh
  vx: number
  vy: number
  vz: number
  life: number
}
const shards: Shard[] = []

// --- Ramp state --- The right slot (SLOTS[0]) is ours, the left is theirs;
// whoever's slot the ball enters arms THAT side's murderball, no matter who
// knocked it in. rampDir +1 rides right→left (ours), -1 rides left→right.
let onRamp = false
let rampPhase = 0 // 0..1 fraction of the ramp traversed since entry
let rampDir = 1
let rampOwner: 0 | 1 = 0 // whose murderball this ride arms
let rampCooldown = 0
const rampLen = ramp.length
const _cp = new Vector3()

function tryEnterRamp() {
  if (onRamp || rampCooldown > 0) return
  const speed = Math.hypot(ball.vx, ball.vz)
  if (speed < 6) return
  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i]
    const dx = ball.x - s.x
    const dz = ball.z - s.z
    if (dx * dx + dz * dz >= RAMP_CAPTURE_R * RAMP_CAPTURE_R) continue
    // The throat only swallows a ball travelling roughly along the slot axis,
    // which for the owner means away from their own end. The guard blade turns
    // most wrong-way balls back before they get here; this catches the rest.
    if ((ball.vx * s.ax + ball.vz * s.az) / speed < RAMP_AIM_DOT) continue
    onRamp = true
    rampPhase = 0
    rampDir = i === 0 ? 1 : -1
    rampOwner = s.owner
    sfx.rampIn()
    return
  }
}

function updateRamp(dt: number) {
  rampPhase += (RAMP_SPEED / rampLen) * dt
  if (rampPhase >= 1) {
    // Reached the far slot: launch toward the opponent's goal but deliberately
    // wide of the mouth, so the ball must bounce back before it can be scored.
    const exit = SLOTS[rampDir > 0 ? 1 : 0]
    ramp.ride(rampDir > 0 ? 1 : 0, _cp)
    // Step clear of the wall face, along the slot axis, so the ball doesn't
    // spawn inside the throat and immediately register a wall bounce.
    const clear = BALL_R + 0.5
    ball.x = _cp.x - exit.ax * clear
    ball.z = _cp.z - exit.az * clear
    // Owner 0 attacks the far goal (−z); owner 1 attacks the near goal (+z).
    const goalZ = rampOwner === 0 ? -HALF_L : HALF_L
    const aimX = -exit.sx * RAMP_MISS // across court, wide of the mouth
    const dirX = aimX - ball.x
    const dirZ = goalZ - ball.z
    const inv = 1 / Math.hypot(dirX, dirZ)
    const speed = BALL_START_SPEED * RAMP_RELEASE_BOOST
    ball.vx = dirX * inv * speed
    ball.vz = dirZ * inv * speed
    ballY = BALL_R
    onRamp = false
    rampCooldown = RAMP_COOLDOWN
    sfx.rampOut()
    // Arm murderball for the mouth's owner (not the last hitter).
    murderball = rampOwner
    mbTimer = MB_SECONDS
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
  // Reset murderball + reform any shattered paddle.
  murderball = null
  mbTimer = 0
  playerBroken = 0
  aiBroken = 0
  playerMesh.visible = true
  aiMesh.visible = true
}
serve(Math.random() < 0.5 ? 1 : -1)

// --- Fixed-timestep loop ---
const HZ = 120
const DT = 1 / HZ
const MAX_FRAME = 0.25
let acc = 0
let last = performance.now() / 1000
let playing = false // gated on the opening zoom finishing
let introElapsed = 0

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
  // Tick the murderball window and paddle-reform timers.
  if (mbTimer > 0) {
    mbTimer -= dt
    if (mbTimer <= 0) murderball = null
  }
  if (playerBroken > 0) {
    playerBroken -= dt
    if (playerBroken <= 0) playerMesh.visible = true
  }
  if (aiBroken > 0) {
    aiBroken -= dt
    if (aiBroken <= 0) aiMesh.visible = true
  }
  // Ghost (no bounce) while phased through by murderball, or while shattered.
  ai.ghost = murderball === 0 || aiBroken > 0
  player.ghost = murderball === 1 || playerBroken > 0

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
  // Murderball phasing through the opponent paddle shatters it.
  if (res.phasedIndex === 1 && murderball === 0) breakPaddle(1)
  else if (res.phasedIndex === 0 && murderball === 1) breakPaddle(0)

  if (res.goal === 'near') {
    scoreAI += 1 + targets.countFor(1) // their claimed targets add to their goal
    targets.reset()
    sfx.goalThem()
    serve(-1)
    return
  }
  if (res.goal === 'far') {
    scorePlayer += 1 + targets.countFor(0) // our claimed targets add to our goal
    targets.reset()
    sfx.goalUs()
    serve(1)
    return
  }

  checkCornerTrap(dt)
  checkTargets()
  tryEnterRamp()
}

// Anti-trap: kick the ball back toward table centre if it lingers in a corner.
function checkCornerTrap(dt: number) {
  const inCorner =
    Math.abs(ball.x) > HALF_W - CORNER_ESCAPE_ZONE && Math.abs(ball.z) > HALF_L - CORNER_ESCAPE_ZONE
  if (!inCorner) {
    cornerTime = 0
    return
  }
  cornerTime += dt
  if (cornerTime < CORNER_ESCAPE_TIME) return
  // Redirect toward centre (0,0) — always away from both walls, never a goal.
  const dx = -Math.sign(ball.x) || -1
  const dz = -Math.sign(ball.z) || -1
  const inv = 1 / Math.hypot(dx, dz)
  const speed = Math.max(BALL_START_SPEED, Math.hypot(ball.vx, ball.vz))
  ball.vx = dx * inv * speed
  ball.vz = dz * inv * speed
  cornerTime = 0
}

// Claim targets: while the ball is pressed against a side wall next to a target,
// the last hitter lights it their colour (stealing it if the other side held it).
function checkTargets() {
  if (possession === null) return
  const atWall = Math.abs(ball.x) > HALF_W - BALL_R - 0.12
  if (!atWall) return
  for (let i = 0; i < targets.positions.length; i++) {
    const p = targets.positions[i]
    if (Math.sign(ball.x) !== Math.sign(p.x)) continue
    if (Math.abs(ball.z - p.z) > TARGET_HIT_Z) continue
    if (targets.claims[i] !== possession) {
      targets.claim(i, possession)
      sfx.star()
    }
  }
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

// Shatter a paddle: hide it, throw shards, keep it out for BREAK_SECONDS.
function breakPaddle(idx: number) {
  if (idx === 0) {
    if (playerBroken > 0) return
    playerBroken = BREAK_SECONDS
    playerMesh.visible = false
    spawnShards(player.x, player.z, 0x9fb4cc)
  } else {
    if (aiBroken > 0) return
    aiBroken = BREAK_SECONDS
    aiMesh.visible = false
    spawnShards(ai.x, ai.z, 0x7d8ea3)
  }
  sfx.smash()
}

const SHARD_COUNT = 9
function spawnShards(x: number, z: number, color: number) {
  for (let i = 0; i < SHARD_COUNT; i++) {
    const m = new Mesh(
      new BoxGeometry(0.32, 0.32, 0.32),
      new MeshMatcapMaterial({ matcap: metalMatcap, color }),
    )
    m.position.set(x, PADDLE_H / 2, z)
    scene.add(m)
    const a = (i / SHARD_COUNT) * Math.PI * 2 + Math.random()
    const sp = 4 + Math.random() * 6
    shards.push({ mesh: m, vx: Math.cos(a) * sp, vy: 5 + Math.random() * 5, vz: Math.sin(a) * sp, life: 1.4 })
  }
}

function updateShards(dt: number) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i]
    s.life -= dt
    s.vy -= 24 * dt // gravity
    s.mesh.position.x += s.vx * dt
    s.mesh.position.y += s.vy * dt
    s.mesh.position.z += s.vz * dt
    s.mesh.rotation.x += dt * 9
    s.mesh.rotation.y += dt * 7
    if (s.mesh.position.y < 0.16 && s.vy < 0) {
      s.mesh.position.y = 0.16
      s.vy *= -0.4 // little bounce off the floor
    }
    s.mesh.scale.setScalar(clamp(s.life / 1.4, 0, 1))
    if (s.life <= 0) {
      scene.remove(s.mesh)
      shards.splice(i, 1)
    }
  }
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

  if (!playing) {
    // Opening zoom-in; gameplay and the match clock are held until it finishes.
    introElapsed += frameDt
    if (updateIntro(introElapsed)) playing = true
  } else {
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
  }

  updateShards(frameDt)

  ballMesh.position.set(ball.x, ballY, ball.z)
  // Ball shadow: directly below, growing and fading with altitude.
  const alt = ballY - BALL_R
  ballShadow.position.set(ball.x, 0.05, ball.z)
  const s = 1 + alt * 0.07
  ballShadow.scale.set(s, s, s)
  ;(ballShadow.material as MeshBasicMaterial).opacity = clamp(0.55 - alt * 0.03, 0.12, 0.55)

  // Murderball glow: tint the ball and pulse an additive halo in the side colour.
  if (murderball !== null) {
    const col = murderball === 0 ? COLOR_ME : COLOR_THEM
    ;(ballMesh.material as MeshMatcapMaterial).color.set(col)
    ballGlow.visible = true
    ;(ballGlow.material as MeshBasicMaterial).color.set(col)
    const pulse = 0.4 + 0.2 * Math.sin(now * 12)
    ;(ballGlow.material as MeshBasicMaterial).opacity = pulse
    ballGlow.position.set(ball.x, ballY, ball.z)
    ballGlow.scale.setScalar(1 + 0.12 * Math.sin(now * 12))
  } else {
    ;(ballMesh.material as MeshMatcapMaterial).color.set(0xffffff)
    ballGlow.visible = false
  }

  playerMesh.position.set(player.x, PADDLE_H / 2, player.z)
  aiMesh.position.set(ai.x, PADDLE_H / 2, ai.z)
  // Paddle shadows track their paddle (hidden while the paddle is shattered).
  playerShadow.position.set(player.x, 0.04, player.z + 0.2)
  aiShadow.position.set(ai.x, 0.04, ai.z + 0.2)
  playerShadow.visible = playerBroken <= 0
  aiShadow.visible = aiBroken <= 0
  // AI flashes red while disabled by a shot.
  ;(aiMesh.material as MeshMatcapMaterial).color.set(aiDisabled > 0 ? 0xd23b3b : 0x7d8ea3)

  const mm = Math.floor(timeLeft / 60)
  const ss = Math.floor(timeLeft % 60)
  scoreEl.textContent = `${pad(scorePlayer)}   ${mm}:${String(ss).padStart(2, '0')}   ${pad(scoreAI)}`
  debugEl.textContent =
    `|v| ${Math.hypot(ball.vx, ball.vz).toFixed(0)}  x${1 + targets.countFor(0)} / x${1 + targets.countFor(1)}` +
    (murderball !== null ? `  MURDERBALL ${mbTimer.toFixed(1)}` : '') +
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
