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
export const AI_MAX_SPEED = 26 // deliberately beatable

export const MATCH_SECONDS = 120

// Team colours (electric blue = us, electric pink = them). Shared by the
// murderball glow, the wall-mouth portals, and the claim targets.
export const COLOR_ME = 0x2ad4ff
export const COLOR_THEM = 0xff3ecb

// Murderball ramp: an over-the-top arch linking a hole in each side wall. Enter
// the RIGHT mouth (ours) or the LEFT mouth (theirs); ride up-over-down; exit the
// far mouth boosted with murderball armed for the side you entered.
export const RAMP_HOLE_Z = 6 // z of the right mouth (ours); left mouth is at -RAMP_HOLE_Z
export const RAMP_CAPTURE_R = 1.6 // how close to a mouth to get sucked in
export const RAMP_SPEED = 26 // travel speed along the rail
export const RAMP_RELEASE_BOOST = 1.25 // exit speed multiplier
export const RAMP_COOLDOWN = 1.5 // seconds before the ramp can grab the ball again
export const RAMP_MISS = GOAL_HALF + 2 // exit aims this far off goal centre (needs a bounce to score)

// Claim targets: two flanking each wall mouth (4 total). Claimed by the last
// hitter's colour; the count in your colour is your multiplier on the next goal.
export const TARGET_SEP = 3.2 // z-offset of each target either side of its mouth
export const TARGET_HIT_Z = 1.6 // z tolerance for the ball claiming a target at the wall

// Anti-trap: if the ball dwells in a corner (near a side AND an end wall) longer
// than CORNER_ESCAPE_TIME, it's kicked back toward centre so it can't get pinned
// there (by wall bounce limit-cycles or a paddle holding it in the corner).
export const CORNER_ESCAPE_ZONE = 3.0 // how far from each wall counts as "in the corner"
export const CORNER_ESCAPE_TIME = 0.5 // seconds of dwell before the escape kick

// Player half is z in [0, HALF_L]; AI half is z in [-HALF_L, 0].
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))
