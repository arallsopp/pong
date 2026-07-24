// Table is laid out on the XZ plane. x = width (left/right), z = length
// (near/far). Our goal is at +z (near/bottom), theirs at -z (far/top).
export const HALF_W = 10 // half width  → table is 20 wide
export const HALF_L = 16 // half length → table is 32 long
export const GOAL_HALF = 3.5 // half-width of the goal mouth
export const WALL_H = 3.5 // visual wall height (tall enough to carry the star track)
export const WALL_T = 0.6 // visual wall thickness

export const BALL_R = 0.55 // smaller ball → the court reads bigger
export const PAD_R = 1.4

export const BALL_START_SPEED = 16
export const BALL_MAX_SPEED = 42
export const BALL_MIN_SPEED = 10

export const PLAYER_MAX_SPEED = 90 // paddle tracks the finger fast

// Neither paddle may come closer to the centre line than this, so a paddle can't
// sit in front of the mid-court murderball slot/guard and block the ramp. Both
// halves keep a clear neutral band of ±PADDLE_FRONT_LIMIT across the middle.
export const PADDLE_FRONT_LIMIT = 2.0

export const MATCH_SECONDS = 120

/** How hard the AI plays. Picked on the start overlay. */
export type Level = 'easy' | 'normal' | 'hard'

export interface AiProfile {
  maxSpeed: number
  /** Fraction of the ball's x it misjudges by — sloppiness, not lag. */
  aimError: number
  /** Will it break off to grab a power-up token? */
  usesGuns: boolean
  /** Will it set up its own murderball run into the left slot? */
  seeksRamp: boolean
  /** Scales every ball speed (serve/clamp/ramp) — <1 gives you more time. */
  pace: number
}

export const AI_PROFILES: Record<Level, AiProfile> = {
  easy: { maxSpeed: 18, aimError: 1.6, usesGuns: false, seeksRamp: false, pace: 0.6 },
  normal: { maxSpeed: 26, aimError: 0.7, usesGuns: true, seeksRamp: false, pace: 1 },
  hard: { maxSpeed: 34, aimError: 0.15, usesGuns: true, seeksRamp: true, pace: 1 },
}

// Team colours (electric blue = us, electric pink = them). Shared by the
// murderball glow, the wall-mouth portals, and the claim targets.
export const COLOR_ME = 0x2ad4ff
export const COLOR_THEM = 0xff3ecb

// Murderball ramp: an over-the-top arch linking a 45° slot in each side wall,
// both at mid-court. Enter the RIGHT slot (ours) or the LEFT slot (theirs); ride
// up-over-down; exit the far slot boosted, with murderball armed for the side
// whose slot you entered.
export const RAMP_MOUTH_Z = 0.4 // right mouth sits at z = -this, left mouth at +this
export const RAMP_SLOT_HALF = 0.9 // slot half-width, measured ACROSS the 45° axis
export const RAMP_FIN_LEN = 1.8 // how far the guard blade reaches into the court
export const RAMP_FIN_T = 0.35 // guard blade thickness
export const RAMP_AIM_DOT = 0.25 // how closely the ball must be aimed along the axis
export const RAMP_CAPTURE_R = 1.6 // how close to a mouth to get sucked in
export const RAMP_SPEED = 26 // travel speed along the rail
export const RAMP_RELEASE_BOOST = 1.25 // exit speed multiplier
export const RAMP_COOLDOWN = 1.5 // seconds before the ramp can grab the ball again
export const RAMP_MISS = GOAL_HALF + 2 // exit aims this far off goal centre (needs a bounce to score)

/**
 * A murderball slot: the 45° break in one side wall.
 *
 * `a` (ax/az) is the slot axis, pointing OUT of the court — a ball must be
 * travelling roughly along it to be taken by the ramp, which for the owner means
 * "away from your own end". `n` (nx/nz) crosses the slot toward the chamfered
 * jaw. The other jaw is the GUARD BLADE: a wall stub on the same 45° line that
 * juts into the court, so a ball arriving from the wrong end is deflected back
 * into play instead of being fed to the opponent's loop.
 */
export interface Slot {
  owner: 0 | 1
  sx: 1 | -1 // which side wall: +1 = right (ours), -1 = left (theirs)
  x: number // mouth centre, on the wall face
  z: number
  ax: number // unit slot axis, out of the court (= the required entry direction)
  az: number
  nx: number // unit normal across the slot, toward the chamfered jaw
  nz: number
  zFin: number // wall-face z where the guard blade's jaw meets the wall
  zOpen: number // wall-face z of the chamfered jaw
  /** Guard blade centreline, court tip → buried end (a capsule for physics). */
  fin: { x0: number; z0: number; x1: number; z1: number; r: number }
}

function makeSlot(owner: 0 | 1, sx: 1 | -1): Slot {
  const q = Math.SQRT1_2
  const x = sx * HALF_W
  const z = -sx * RAMP_MOUTH_Z
  const ax = sx * q
  const az = -sx * q
  const nx = -az // n = a rotated a quarter turn
  const nz = ax
  const span = RAMP_SLOT_HALF * Math.SQRT2 // a 45° cut elongates by √2 along the wall
  const zFin = z - sx * span
  const zOpen = z + sx * span
  // The blade's slot-facing flank lies ON the jaw line, so its centreline is
  // half a thickness back; it runs from FIN_LEN out in the court to WALL_T deep
  // in the wall, where it meets the run's chamfer.
  const off = RAMP_FIN_T / 2
  return {
    owner,
    sx,
    x,
    z,
    ax,
    az,
    nx,
    nz,
    zFin,
    zOpen,
    fin: {
      x0: x - ax * RAMP_FIN_LEN - nx * off,
      z0: zFin - az * RAMP_FIN_LEN - nz * off,
      x1: x + ax * WALL_T - nx * off,
      z1: zFin + az * WALL_T - nz * off,
      r: off,
    },
  }
}

/** The two wall slots. [0] = right wall (ours), [1] = left wall (theirs). */
export const SLOTS: Slot[] = [makeSlot(0, 1), makeSlot(1, -1)]

// Claim targets: two evenly spaced either side of each wall slot (4 total).
// Claimed by the last hitter's colour; the count in your colour is your
// multiplier on the next goal.
export const TARGET_SEP = 4.8 // z-offset of each target either side of its slot
export const TARGET_HIT_Z = 1.6 // z tolerance for the ball claiming a target at the wall

// Anti-trap: if the ball dwells in a corner (near a side AND an end wall) longer
// than CORNER_ESCAPE_TIME, it's kicked back toward centre so it can't get pinned
// there (by wall bounce limit-cycles or a paddle holding it in the corner).
export const CORNER_ESCAPE_ZONE = 3.0 // how far from each wall counts as "in the corner"
export const CORNER_ESCAPE_TIME = 0.5 // seconds of dwell before the escape kick

// Player half is z in [0, HALF_L]; AI half is z in [-HALF_L, 0].
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))
