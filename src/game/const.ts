// Table is laid out on the XZ plane. x = width (left/right), z = length
// (near/far). Our goal is at +z (near/bottom), theirs at -z (far/top).
export const HALF_W = 10 // half width  → table is 20 wide
export const HALF_L = 16 // half length → table is 32 long
export const GOAL_HALF = 3.5 // half-width of the goal mouth
export const WALL_H = 3.5 // visual wall height (tall enough to carry the star track)
export const WALL_T = 0.6 // visual wall thickness

export const BALL_R = 0.8
export const PAD_R = 1.9

export const BALL_START_SPEED = 16
export const BALL_MAX_SPEED = 42
export const BALL_MIN_SPEED = 10

export const PLAYER_MAX_SPEED = 90 // paddle tracks the finger fast
export const AI_MAX_SPEED = 26 // deliberately beatable

export const MATCH_SECONDS = 120

// Central murderball ramp.
export const RAMP_ENTRY_Z = 6 // z of the two entry mouths (±)
export const RAMP_CAPTURE_R = 1.8 // how close the ball must pass to get sucked in
export const RAMP_SPEED = 26 // travel speed along the rail
export const RAMP_RELEASE_BOOST = 1.25 // exit speed multiplier (accelerator, auto for now)
export const RAMP_COOLDOWN = 1.5 // seconds before the ramp can grab the ball again

// Player half is z in [0, HALF_L]; AI half is z in [-HALF_L, 0].
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))
