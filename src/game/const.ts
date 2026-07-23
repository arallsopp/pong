// Table is laid out on the XZ plane. x = width (left/right), z = length
// (near/far). Our goal is at +z (near/bottom), theirs at -z (far/top).
export const HALF_W = 10 // half width  → table is 20 wide
export const HALF_L = 16 // half length → table is 32 long
export const GOAL_HALF = 3.5 // half-width of the goal mouth
export const WALL_H = 1.4 // visual wall height
export const WALL_T = 0.6 // visual wall thickness

export const BALL_R = 0.8
export const PAD_R = 1.9

export const BALL_START_SPEED = 16
export const BALL_MAX_SPEED = 42
export const BALL_MIN_SPEED = 10

export const PLAYER_MAX_SPEED = 90 // paddle tracks the finger fast
export const AI_MAX_SPEED = 26 // deliberately beatable

export const MATCH_SECONDS = 120

// Player half is z in [0, HALF_L]; AI half is z in [-HALF_L, 0].
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))
