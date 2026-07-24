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
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { makeMetalMatcap, makeShadowTexture } from './game/textures'
import {
  AI_PROFILES,
  BALL_R,
  BALL_START_SPEED,
  COLOR_ME,
  COLOR_THEM,
  CORNER_ESCAPE_TIME,
  CORNER_ESCAPE_ZONE,
  GOAL_HALF,
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
  PADDLE_FRONT_LIMIT,
  PLAYER_MAX_SPEED,
  SLOTS,
  TARGET_HIT_Z,
  clamp,
  type Level,
} from './game/const'
import { buildTable } from './game/table'
import { buildRamp } from './game/ramp'
import { buildTargets } from './game/stars'
import {
  GUN_R,
  POWERS,
  POWER_LABEL,
  POWER_SECONDS,
  SHOT_SPEED,
  makeShotMesh,
  makeTokenMesh,
  type Power,
} from './game/guns'
import { stepBall, type Body } from './game/physics'
import { sfx } from './game/sound'

const app = document.getElementById('app')!
const scoreEl = document.getElementById('score')!
const bannerEl = document.getElementById('banner')!
const debugEl = document.getElementById('debug')!
const muteEl = document.getElementById('mute') as HTMLButtonElement
const restartEl = document.getElementById('restart') as HTMLButtonElement
const tagMeEl = document.getElementById('tagMe')!
const tagThemEl = document.getElementById('tagThem')!
const tagMBEl = document.getElementById('tagMB')!
const flashEl = document.getElementById('flash')!
const startEl = document.getElementById('start')!
const headlineEl = document.getElementById('headline')!
const levelsEl = document.getElementById('levels')!
const goEl = document.getElementById('go') as HTMLButtonElement

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

// --- Paddles: short metal blue-grey cylinders, each wearing its team's band ---
const PADDLE_H = 0.85
const BAND_T = 0.14 // band tube radius; it straddles the rim, half proud
function makePaddle(tint: number, band: number): Mesh {
  const m = new Mesh(
    new CylinderGeometry(PAD_R, PAD_R, PADDLE_H, 48),
    new MeshMatcapMaterial({ matcap: metalMatcap, color: tint }),
  )
  // Unlit, so the band reads as a neon ring against the muted metal. A child of
  // the paddle, so it tracks it and vanishes with it when the paddle shatters.
  const ring = new Mesh(
    new TorusGeometry(PAD_R, BAND_T, 8, 48),
    new MeshBasicMaterial({ color: band }),
  )
  ring.rotation.x = -Math.PI / 2
  m.add(ring)
  return m
}
const player: Body = { x: 0, z: HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const ai: Body = { x: 0, z: -HALF_L * 0.6, vx: 0, vz: 0, r: PAD_R }
const playerMesh = makePaddle(0x9fb4cc, COLOR_ME) // lighter steel-blue, blue band (ours, bottom)
const aiMesh = makePaddle(0x7d8ea3, COLOR_THEM) // steel-grey, pink band (theirs, top)
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
    // Confine to our half, kept back from the mid-court slot and inside the walls.
    targetX = clamp(hitPoint.x, -(HALF_W - PAD_R), HALF_W - PAD_R)
    targetZ = clamp(hitPoint.z, PADDLE_FRONT_LIMIT, HALF_L - PAD_R)
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

// --- Start / play-again overlay --- Sits over the wide opening shot; picking a
// difficulty and tapping START runs the corners-fit zoom and begins the match.
let started = false // gated on START; until then the camera holds the wide shot
let overlayDelay = 0 // seconds the result banner gets before the overlay takes over

function openStart(headline: string, cls = '') {
  headlineEl.textContent = headline
  headlineEl.className = cls
  goEl.textContent = cls ? 'Play again' : 'Start'
  startEl.classList.add('show')
}

levelsEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null
  if (!btn) return
  sfx.unlock()
  level = btn.dataset.level as Level
  aiProfile = AI_PROFILES[level]
  levelsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn))
})

goEl.addEventListener('click', () => {
  sfx.unlock()
  startEl.classList.remove('show')
  resetMatch()
  started = true
})

restartEl.addEventListener('click', () => {
  sfx.unlock()
  resetMatch()
  openStart('MURDERBALL')
})

// --- Match state ---
let scorePlayer = 0
let scoreAI = 0
let timeLeft = MATCH_SECONDS
let over = false
let level: Level = 'normal'
let aiProfile = AI_PROFILES[level]
let aiAimBias = 0

// Possession = last paddle to touch the ball; it claims targets it strikes.
let possession: 0 | 1 | null = null
let cornerTime = 0 // seconds the ball has dwelled in a corner (anti-trap)

// --- Neon overlays --- The tags under the score are always live; a big
// translucent numeral punches into the middle of the screen whenever a
// multiplier or a murderball changes hands, then fades off the table.
const CSS_ME = `#${COLOR_ME.toString(16).padStart(6, '0')}`
const CSS_THEM = `#${COLOR_THEM.toString(16).padStart(6, '0')}`
const FLASH_SECONDS = 1.1
const FLASH_IN = 0.12 // fraction of the window spent punching in
const FLASH_HOLD = 0.45 // fraction held at full before it starts leaving
const FLASH_PEAK = 0.55 // peak opacity — translucent, never hides the ball
let flashText = ''
let flashColor = CSS_ME
let flashTime = 0
let lastMult: [number, number] = [1, 1]

function flash(text: string, color: string) {
  flashText = text
  flashColor = color
  flashTime = FLASH_SECONDS
}

function updateFlash(frameDt: number) {
  if (flashTime <= 0) return
  flashTime -= frameDt
  if (flashTime <= 0) {
    flashEl.style.opacity = '0'
    return
  }
  const t = 1 - flashTime / FLASH_SECONDS
  const punch = Math.min(1, t / FLASH_IN)
  const leave = clamp((t - FLASH_HOLD) / (1 - FLASH_HOLD), 0, 1)
  flashEl.textContent = flashText
  flashEl.style.color = flashColor
  flashEl.style.opacity = String(FLASH_PEAK * punch * (1 - leave))
  flashEl.style.transform = `scale(${1.35 - 0.35 * punch + leave * 0.3})`
}

// --- Power-ups --- One token at a time, spawned across the centre line so
// either paddle can race for it. Freeze/shrink/slow are delivered as a homing
// bolt and only land if it connects; shield goes up over your own goal at once.
interface Token {
  x: number
  z: number
  power: Power
  mesh: Mesh
}
interface Shot {
  x: number
  z: number
  owner: 0 | 1
  power: Power
  mesh: Mesh
}
const guns: Token[] = []
const shots: Shot[] = []
const TOKEN_MIN_GAP = 16 // seconds before a token can reappear…
const TOKEN_GAP_SPREAD = 12 // …plus up to this much more
let gunTimer = TOKEN_MIN_GAP

/** Per-side effect state. Index 0 = us, 1 = them. */
interface SideFx {
  debuff: Exclude<Power, 'shield'> | null // what's afflicting THIS side's paddle
  debuffTime: number
  shieldTime: number // this side's own goal is sealed while this runs
}
const fx: [SideFx, SideFx] = [
  { debuff: null, debuffTime: 0, shieldTime: 0 },
  { debuff: null, debuffTime: 0, shieldTime: 0 },
]

const SHRINK_SCALE = 0.5 // shrink halves the paddle
const SLOW_SCALE = 0.5 // slow halves its top speed
const SHIELD_H = 1.7 // height of the neon block across the goal

// Translucent neon blocks across each goal, shown while that side is shielded.
function makeShieldMesh(sz: number, color: number): Mesh {
  const m = new Mesh(
    new BoxGeometry(GOAL_HALF * 2, SHIELD_H, 0.3),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  m.position.set(0, SHIELD_H / 2, sz * HALF_L)
  m.visible = false
  return m
}
const shieldMeshes: [Mesh, Mesh] = [makeShieldMesh(1, COLOR_ME), makeShieldMesh(-1, COLOR_THEM)]
scene.add(shieldMeshes[0], shieldMeshes[1])

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
    flash('MURDERBALL', rampOwner === 0 ? CSS_ME : CSS_THEM)
    return
  }
  const u = rampDir > 0 ? rampPhase : 1 - rampPhase
  ramp.ride(u, _cp)
  ball.x = _cp.x
  ball.z = _cp.z
  ballY = _cp.y
}

/** Park the ball at centre, still, and clear everything a new point should clear. */
function placeForServe() {
  ball.x = 0
  ball.z = 0
  ball.vx = 0
  ball.vz = 0
  ballY = BALL_R
  onRamp = false
  possession = null
  rally = 0 // fresh point: the camera goes back to its resting angle
  rallyLower = 0 // snapped, not eased — we're cutting to the wide shot anyway
  rollAiAim()
  rampCooldown = 1.0 // don't let the ramp grab the ball at kickoff
  // Reset murderball + reform any shattered paddle.
  murderball = null
  mbTimer = 0
  playerBroken = 0
  aiBroken = 0
  playerMesh.visible = true
  aiMesh.visible = true
  clearEffects() // a new point starts clean — no freeze/shrink/slow/shield carrying over
}

/** Send the parked ball on its way, toward -1 (their end) or +1 (ours). */
function launch(toward: number) {
  const ang = (Math.random() - 0.5) * 1.0
  ball.vx = Math.sin(ang) * BALL_START_SPEED
  ball.vz = toward * Math.abs(Math.cos(ang) * BALL_START_SPEED)
}

function serve(toward: number) {
  placeForServe()
  launch(toward)
}
serve(Math.random() < 0.5 ? 1 : -1)

// --- Goal sequence --- On a goal the sim freezes and we replay the run-up in
// slow motion, the camera dropping out of the play view to chase the ball and
// follow it through the mouth. Then a hard cut back to the wide opening shot,
// the same zoom-down as the intro, a beat, and the next serve. The match clock
// is paused for all of it, so replays never cost you time.
const REPLAY_LEAD = 2.0 // seconds of run-up kept on tape
const REPLAY_RATE = 0.5 // playback speed
const REPLAY_BLEND = 0.35 // fraction of the replay spent easing off the play camera
const CHASE_UP_FAR = 5.5 // camera height when the chase begins…
const CHASE_UP_NEAR = 2.0 // …and as it goes through the mouth
const CHASE_BACK_FAR = 12 // how far behind the ball the chase starts…
const CHASE_BACK_NEAR = 2.5 // …and ends, so we cross the line just after it
const CHASE_SQUARE = 0.7 // how far the camera slides to centre on the goal
const RESET_HOLD = 0.5 // beat at the play view before the serve
const REPLAY_HZ = 60 // tape sampling rate

interface Snapshot {
  bx: number
  by: number
  bz: number
  px: number
  pz: number
  ax: number
  az: number
}
const tape: Snapshot[] = []
const TAPE_MAX = Math.ceil(REPLAY_LEAD * REPLAY_HZ)
let tapeAcc = 0

type Phase = 'play' | 'replay' | 'reset' | 'hold'
let phase: Phase = 'play'
let phaseT = 0
let replayGoalZ = 0
let pendingServe = 1

function recordFrame() {
  if (tape.length >= TAPE_MAX) tape.shift()
  tape.push({
    bx: ball.x,
    by: ballY,
    bz: ball.z,
    px: player.x,
    pz: player.z,
    ax: ai.x,
    az: ai.z,
  })
}

function startReplay(goal: 'near' | 'far') {
  recordFrame() // catch the ball on the wrong side of the line
  replayGoalZ = goal === 'near' ? HALF_L : -HALF_L
  pendingServe = goal === 'near' ? -1 : 1
  phase = 'replay'
  phaseT = 0
}

/** Scrub the tape to `t` (0..1) and drop the world back into that pose. */
function applyTape(t: number) {
  if (tape.length === 0) return
  const f = clamp(t, 0, 1) * (tape.length - 1)
  const i0 = Math.floor(f)
  const i1 = Math.min(i0 + 1, tape.length - 1)
  const k = f - i0
  const a = tape[i0]
  const b = tape[i1]
  ball.x = a.bx + (b.bx - a.bx) * k
  ballY = a.by + (b.by - a.by) * k
  ball.z = a.bz + (b.bz - a.bz) * k
  player.x = a.px + (b.px - a.px) * k
  player.z = a.pz + (b.pz - a.pz) * k
  ai.x = a.ax + (b.ax - a.ax) * k
  ai.z = a.az + (b.az - a.az) * k
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)
const _chase = new Vector3()
const _look = new Vector3()

function replayCamera(t: number) {
  // Chase along the goal's axis rather than the ball's heading — the ball bounces
  // during the run-up and tracking that would swing the camera all over the table.
  const gs = Math.sign(replayGoalZ)
  const close = smoothstep(clamp((t - REPLAY_BLEND) / (1 - REPLAY_BLEND), 0, 1))
  const up = CHASE_UP_FAR + (CHASE_UP_NEAR - CHASE_UP_FAR) * close
  const back = CHASE_BACK_FAR + (CHASE_BACK_NEAR - CHASE_BACK_FAR) * close
  _chase.set(ball.x * (1 - close * CHASE_SQUARE), up, ball.z - gs * back)
  _look.set(ball.x, ballY, ball.z)

  // Ease out of the play view rather than cutting to the chase.
  const blend = smoothstep(clamp(t / REPLAY_BLEND, 0, 1))
  rallyDir(_dir)
  _fitPos.copy(CAM_TARGET).addScaledVector(_dir, fitScale(_dir))
  camera.position.lerpVectors(_fitPos, _chase, blend)
  _look.lerp(CAM_TARGET, 1 - blend)
  camera.lookAt(_look)
}

function updateSequence(frameDt: number) {
  phaseT += frameDt
  if (phase === 'replay') {
    const dur = REPLAY_LEAD / REPLAY_RATE
    const t = clamp(phaseT / dur, 0, 1)
    applyTape(t)
    replayCamera(t)
    if (t >= 1) {
      // Cut back to the wide opening shot with the ball waiting at centre.
      placeForServe()
      tape.length = 0
      phase = 'reset'
      phaseT = 0
    }
  } else if (phase === 'reset') {
    if (updateIntro(phaseT)) {
      phase = 'hold'
      phaseT = 0
    }
  } else {
    updateCamera(frameDt)
    if (phaseT >= RESET_HOLD) {
      launch(pendingServe)
      phase = 'play'
      phaseT = 0
    }
  }
}

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
  const lo = -(HALF_L - PAD_R) // don't back all the way onto its own goal line…
  const hi = -PADDLE_FRONT_LIMIT // …nor cross into the mid-court neutral band
  // Stay off the side walls by a touch, so the AI can't pin the ball in a corner.
  const wallX = HALF_W - PAD_R - 0.5
  let tx: number
  let tz: number

  const token = aiToken()
  if (token && ball.vz > 0) {
    // Ball is on its way to our end and there's a token in reach — go shopping.
    tx = token.x
    tz = token.z
  } else if (aiProfile.seeksRamp && wantsRampShot()) {
    // Line up BEHIND the ball, on the far side from its own slot, so the bounce
    // sends it into the left throat and charges its murderball.
    const s = SLOTS[1]
    const dx = s.x - ball.x
    const dz = s.z - ball.z
    const inv = 1 / (Math.hypot(dx, dz) || 1)
    tx = ball.x - dx * inv * (PAD_R + BALL_R) + aiAimBias
    tz = ball.z - dz * inv * (PAD_R + BALL_R)
  } else if (ball.vz < 0) {
    // Ball incoming: intercept it, but stay goal-side and give a corner ball an
    // escape lane by nudging the target in off the wall rather than onto it.
    tx = ball.x + aiAimBias
    if (Math.abs(ball.x) > wallX) tx = Math.sign(ball.x) * (wallX - 0.6)
    tz = Math.min(ball.z, hi) // never chase past the ball toward its own goal
  } else {
    // Ball leaving: fall back to a central home post.
    tx = aiAimBias
    tz = -HALF_L * 0.55
  }

  const speed = aiProfile.maxSpeed * (fx[1].debuff === 'slow' ? SLOW_SCALE : 1)
  moveBody(ai, clamp(tx, -wallX, wallX), clamp(tz, lo, hi), speed, dt)
}

/** The nearest token the AI is willing to fetch: in its own half and reachable. */
function aiToken(): Token | null {
  if (!aiProfile.usesGuns) return null
  for (const g of guns) if (g.z <= -PADDLE_FRONT_LIMIT) return g
  return null
}

/** Is it worth the AI trying to feed its own slot rather than just returning? */
function wantsRampShot() {
  return (
    murderball === null &&
    rampCooldown <= 0 &&
    ball.vz < 0 && // coming at the AI
    ball.z < -PADDLE_FRONT_LIMIT - 1 && // and clear of the neutral band
    ball.z > -HALF_L * 0.75 // but not so deep that defending has to come first
  )
}

// The aim error is re-rolled each rally rather than each frame, so the AI plays
// a whole exchange slightly off rather than jittering around the right answer.
function rollAiAim() {
  aiAimBias = (Math.random() * 2 - 1) * aiProfile.aimError * PAD_R
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

  updateWeapons(dt)

  if (fx[0].debuff === 'freeze') {
    player.vx = 0
    player.vz = 0
  } else {
    const mine = PLAYER_MAX_SPEED * (fx[0].debuff === 'slow' ? SLOW_SCALE : 1)
    moveBody(player, targetX, targetZ, mine, dt)
  }
  if (fx[1].debuff === 'freeze') {
    ai.vx = 0
    ai.vz = 0
  } else {
    updateAI(dt)
  }
  if (rampCooldown > 0) rampCooldown -= dt
  tryPickupGun()

  // Keep the rolling tape for the goal replay. Above the ramp return, so a
  // murderball goal replays the ride itself rather than the run-up before it.
  tapeAcc += dt
  if (tapeAcc >= 1 / REPLAY_HZ) {
    tapeAcc = 0
    recordFrame()
  }

  if (onRamp) {
    updateRamp(dt) // ball is on the rail; 2D physics suspended
    return
  }

  // A shield seals its owner's goal — but a murderball goes through it, so the
  // ramp stays the trump card.
  const res = stepBall(ball, dt, [player, ai], [
    fx[0].shieldTime > 0 && murderball !== 1,
    fx[1].shieldTime > 0 && murderball !== 0,
  ])
  if (res.hitIndex === 0) {
    possession = 0
    rally++
    rollAiAim() // fresh misjudgement for the return leg
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
    clearTargets()
    sfx.goalThem()
    startReplay('near')
    return
  }
  if (res.goal === 'far') {
    scorePlayer += 1 + targets.countFor(0) // our claimed targets add to our goal
    clearTargets()
    sfx.goalUs()
    startReplay('far')
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
      announceMultipliers()
    }
  }
}

// A claim can raise one side's multiplier and drop the other's (targets are
// stealable), so check both and shout about any that went up past x1.
/** Wipe every claim and forget the announced multipliers, so they flash afresh. */
function clearTargets() {
  targets.reset()
  lastMult = [1, 1]
}

function announceMultipliers() {
  for (const side of [0, 1] as const) {
    const m = 1 + targets.countFor(side)
    if (m > lastMult[side] && m > 1) flash(`×${m}`, side === 0 ? CSS_ME : CSS_THEM)
    lastMult[side] = m
  }
}

function updateWeapons(dt: number) {
  // Tick each side's effects down.
  for (const side of [0, 1] as const) {
    const f = fx[side]
    if (f.debuffTime > 0) {
      f.debuffTime -= dt
      if (f.debuffTime <= 0) f.debuff = null
    }
    if (f.shieldTime > 0) f.shieldTime -= dt
  }
  // Shrink is the only effect that changes the collision shape.
  player.r = fx[0].debuff === 'shrink' ? PAD_R * SHRINK_SCALE : PAD_R
  ai.r = fx[1].debuff === 'shrink' ? PAD_R * SHRINK_SCALE : PAD_R

  gunTimer -= dt
  if (gunTimer <= 0 && guns.length === 0) {
    spawnToken()
    gunTimer = TOKEN_MIN_GAP + Math.random() * TOKEN_GAP_SPREAD
  }

  // Bolts home in on the opposing paddle — auto-targeting.
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    const victim = s.owner === 0 ? ai : player
    const dx = victim.x - s.x
    const dz = victim.z - s.z
    const d = Math.hypot(dx, dz) || 1
    s.x += (dx / d) * SHOT_SPEED * dt
    s.z += (dz / d) * SHOT_SPEED * dt
    s.mesh.position.set(s.x, 0.5, s.z)
    s.mesh.rotation.y = Math.atan2(dx, dz) // point the bolt along its heading
    if (d < victim.r + 0.4) {
      applyPower(s.power, s.owner)
      scene.remove(s.mesh)
      shots.splice(i, 1)
    } else if (Math.abs(s.z) > HALF_L + 2 || Math.abs(s.x) > HALF_W + 2) {
      scene.remove(s.mesh)
      shots.splice(i, 1)
    }
  }
}

/** Drop every live power-up effect and any in-flight bolt (used on each goal). */
function clearEffects() {
  for (const f of fx) {
    f.debuff = null
    f.debuffTime = 0
    f.shieldTime = 0
  }
  player.r = PAD_R
  ai.r = PAD_R
  playerMesh.scale.setScalar(1)
  aiMesh.scale.setScalar(1)
  shieldMeshes[0].visible = false
  shieldMeshes[1].visible = false
  for (const s of shots) scene.remove(s.mesh)
  shots.length = 0
}

/** Land an effect. Shield buffs the grabber; everything else hits the opponent. */
function applyPower(power: Power, owner: 0 | 1) {
  if (power === 'shield') {
    fx[owner].shieldTime = POWER_SECONDS
  } else {
    const victim: 0 | 1 = owner === 0 ? 1 : 0
    fx[victim].debuff = power // a new debuff replaces whatever was running
    fx[victim].debuffTime = POWER_SECONDS
  }
  flash(POWER_LABEL[power], owner === 0 ? CSS_ME : CSS_THEM)
  sfx.zap()
}

// A token lands at a random reachable spot on a random side — sometimes yours to
// grab, sometimes the AI's, rarely both. Kept out of the neutral band (where no
// paddle can reach) and off the goal areas.
function spawnToken() {
  const side = Math.random() < 0.5 ? 1 : -1
  const x = (Math.random() * 2 - 1) * (HALF_W - 2.5)
  const z = side * (PADDLE_FRONT_LIMIT + 1 + Math.random() * (HALF_L - PADDLE_FRONT_LIMIT - 3.5))
  const power = POWERS[Math.floor(Math.random() * POWERS.length)]
  const mesh = makeTokenMesh(power)
  mesh.position.set(x, 0.12, z)
  scene.add(mesh)
  guns.push({ x, z, power, mesh })
}

// Touching a token with either paddle grabs it immediately (it vanishes at once).
// Shield goes up there and then; the rest fly at the opponent as a homing bolt.
function tryPickupGun() {
  for (let i = guns.length - 1; i >= 0; i--) {
    const g = guns[i]
    for (const owner of [0, 1] as const) {
      const p = owner === 0 ? player : ai
      if ((g.x - p.x) ** 2 + (g.z - p.z) ** 2 >= (p.r + GUN_R) ** 2) continue
      scene.remove(g.mesh)
      guns.splice(i, 1)
      if (g.power === 'shield') applyPower(g.power, owner)
      else fireShot(g.power, owner)
      break
    }
  }
}

function fireShot(power: Power, owner: 0 | 1) {
  const from = owner === 0 ? player : ai
  const mesh = makeShotMesh(power)
  mesh.position.set(from.x, 0.5, from.z)
  scene.add(mesh)
  shots.push({ x: from.x, z: from.z, owner, power, mesh })
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

// Clear win/lose/draw scoreboard at the final whistle, then hand over to the
// overlay so the next match is one tap away.
const BANNER_SECONDS = 2.5
function endMatch() {
  const result = scorePlayer > scoreAI ? 'win' : scorePlayer < scoreAI ? 'lose' : 'draw'
  const headline = result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW'
  bannerEl.style.display = 'flex'
  bannerEl.className = result // color via CSS (win = amber, lose = red, draw = grey)
  bannerEl.textContent = `${headline}\nYOU ${pad(scorePlayer)}   AI ${pad(scoreAI)}`
  endResult = result
  endText = `${headline}\nYOU ${pad(scorePlayer)}   AI ${pad(scoreAI)}`
  overlayDelay = BANNER_SECONDS
  if (result === 'win') sfx.win()
  else if (result === 'lose') sfx.lose()
  else sfx.draw()
}
let endResult = ''
let endText = ''

/** Wipe the match back to kickoff and re-arm the opening zoom. */
function resetMatch() {
  scorePlayer = 0
  scoreAI = 0
  timeLeft = MATCH_SECONDS
  over = false
  overlayDelay = 0
  bannerEl.style.display = 'none'
  clearTargets()
  for (const g of guns) scene.remove(g.mesh)
  guns.length = 0
  for (const s of shots) scene.remove(s.mesh)
  shots.length = 0
  for (const s of shards) scene.remove(s.mesh)
  shards.length = 0
  gunTimer = TOKEN_MIN_GAP
  clearEffects()
  player.x = 0
  player.z = HALF_L * 0.6
  targetX = player.x
  targetZ = player.z
  ai.x = 0
  ai.z = -HALF_L * 0.6
  rallyLower = 0
  playing = false
  started = false
  introElapsed = 0
  acc = 0
  last = performance.now() / 1000
  phase = 'play'
  phaseT = 0
  tape.length = 0
  tapeAcc = 0
  serve(Math.random() < 0.5 ? 1 : -1)
}

function frame() {
  const now = performance.now() / 1000
  const frameDt = Math.min(now - last, MAX_FRAME)
  last = now

  if (!started) {
    // Hold the wide opening shot behind the start overlay.
    updateIntro(0)
  } else if (!playing) {
    // Opening zoom-in; gameplay and the match clock are held until it finishes.
    introElapsed += frameDt
    if (updateIntro(introElapsed)) playing = true
  } else {
    if (over && overlayDelay > 0) {
      // Let the result banner land, then swap in the play-again overlay.
      overlayDelay -= frameDt
      if (overlayDelay <= 0) {
        bannerEl.style.display = 'none'
        openStart(endText, endResult)
      }
    }
    if (phase !== 'play') {
      // Goal replay / reset / hold. The match clock stays frozen throughout.
      updateSequence(frameDt)
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
  // Shrink shows on the mesh; the collision radius is set in updateWeapons.
  playerMesh.scale.setScalar(fx[0].debuff === 'shrink' ? SHRINK_SCALE : 1)
  aiMesh.scale.setScalar(fx[1].debuff === 'shrink' ? SHRINK_SCALE : 1)
  // A frozen paddle flashes red.
  ;(aiMesh.material as MeshMatcapMaterial).color.set(
    fx[1].debuff === 'freeze' ? 0xd23b3b : 0x7d8ea3,
  )
  ;(playerMesh.material as MeshMatcapMaterial).color.set(
    fx[0].debuff === 'freeze' ? 0xd23b3b : 0x9fb4cc,
  )
  // Shields: pulse the neon block while it holds.
  for (const side of [0, 1] as const) {
    const up = fx[side].shieldTime > 0
    shieldMeshes[side].visible = up
    if (up) {
      const m = shieldMeshes[side].material as MeshBasicMaterial
      m.opacity = 0.3 + 0.15 * Math.sin(now * 9)
    }
  }

  updateFlash(frameDt)

  const mm = Math.floor(timeLeft / 60)
  const ss = Math.floor(timeLeft % 60)
  scoreEl.textContent = `${pad(scorePlayer)}   ${mm}:${String(ss).padStart(2, '0')}   ${pad(scoreAI)}`
  // Live tags: each side's multiplier, and who owns the murderball window.
  const multMe = 1 + targets.countFor(0)
  const multThem = 1 + targets.countFor(1)
  tagMeEl.textContent = multMe > 1 ? `×${multMe}` : ''
  tagThemEl.textContent = multThem > 1 ? `×${multThem}` : ''
  tagMBEl.textContent = murderball !== null ? `MURDERBALL ${mbTimer.toFixed(1)}` : ''
  tagMBEl.style.color = murderball === 1 ? CSS_THEM : CSS_ME
  debugEl.textContent =
    `|v| ${Math.hypot(ball.vx, ball.vz).toFixed(0)}  x${1 + targets.countFor(0)} / x${1 + targets.countFor(1)}` +
    (murderball !== null ? `  MURDERBALL ${mbTimer.toFixed(1)}` : '') +
    fxDebug(0, 'US') +
    fxDebug(1, 'AI') +
    (guns.length ? `  ${guns[0].power.toUpperCase()}!` : '')

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function pad(n: number) {
  return String(n).padStart(3, '0')
}

/** Debug-line summary of what's currently afflicting or protecting one side. */
function fxDebug(side: 0 | 1, label: string) {
  const f = fx[side]
  let s = ''
  if (f.debuff) s += `  ${label} ${f.debuff.toUpperCase()} ${f.debuffTime.toFixed(1)}`
  if (f.shieldTime > 0) s += `  ${label} SHIELD ${f.shieldTime.toFixed(1)}`
  return s
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

openStart('MURDERBALL')
requestAnimationFrame(frame)
