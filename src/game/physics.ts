import {
  BALL_MAX_SPEED,
  BALL_MIN_SPEED,
  GOAL_HALF,
  HALF_L,
  HALF_W,
  SLOTS,
} from './const'

/** A circle on the table plane with a velocity. */
export interface Body {
  x: number
  z: number
  vx: number
  vz: number
  r: number
  /** When true the ball passes through this body instead of bouncing. */
  ghost?: boolean
}

export type GoalSide = 'near' | 'far' | null

export interface StepResult {
  goal: GoalSide
  /** Index of the paddle that struck the ball this step, or -1. */
  hitIndex: number
  /** True if the ball bounced off a side/end wall this step (not a goal). */
  wall: boolean
  /** Index of a ghost paddle the ball passed through this step, or -1. */
  phasedIndex: number
}

/**
 * Advance the ball one substep: move, resolve side/end walls (leaving the goal
 * mouths open), resolve paddle collisions, and clamp speed. 'near' = our goal
 * (opponent scores), 'far' = their goal (we score). hitIndex reports which
 * paddle touched the ball this step (for possession).
 */
export function stepBall(ball: Body, dt: number, paddles: Body[]): StepResult {
  ball.x += ball.vx * dt
  ball.z += ball.vz * dt

  let wall = false

  // Side walls.
  const maxX = HALF_W - ball.r
  if (ball.x < -maxX) {
    ball.x = -maxX
    ball.vx = Math.abs(ball.vx)
    wall = true
  } else if (ball.x > maxX) {
    ball.x = maxX
    ball.vx = -Math.abs(ball.vx)
    wall = true
  }

  // Guard blades: the stubs jutting into the court beside each murderball slot.
  // A ball travelling the owner's way slides along the blade into the throat; one
  // arriving from the wrong end hits the other flank and is turned back into play.
  for (const s of SLOTS) {
    if (collideBlade(ball, s.fin)) wall = true
  }

  // End walls, with the goal mouth left open.
  const maxZ = HALF_L - ball.r
  const inMouth = Math.abs(ball.x) < GOAL_HALF
  if (ball.z > maxZ) {
    if (inMouth) {
      if (ball.z > HALF_L + ball.r) return { goal: 'near', hitIndex: -1, wall: false, phasedIndex: -1 }
    } else {
      ball.z = maxZ
      ball.vz = -Math.abs(ball.vz)
      wall = true
    }
  } else if (ball.z < -maxZ) {
    if (inMouth) {
      if (ball.z < -HALF_L - ball.r) return { goal: 'far', hitIndex: -1, wall: false, phasedIndex: -1 }
    } else {
      ball.z = -maxZ
      ball.vz = Math.abs(ball.vz)
      wall = true
    }
  }

  let hitIndex = -1
  let phasedIndex = -1
  for (let i = 0; i < paddles.length; i++) {
    const p = paddles[i]
    if (p.ghost) {
      // No bounce; just report that the ball is overlapping this paddle.
      const dx = ball.x - p.x
      const dz = ball.z - p.z
      const rr = ball.r + p.r
      if (dx * dx + dz * dz < rr * rr) phasedIndex = i
    } else if (collidePaddle(ball, p)) {
      hitIndex = i
    }
  }

  clampSpeed(ball)
  return { goal: null, hitIndex, wall, phasedIndex }
}

/** Bounce off a static capsule (a line segment with a radius) on the table plane. */
function collideBlade(
  ball: Body,
  seg: { x0: number; z0: number; x1: number; z1: number; r: number },
): boolean {
  const ex = seg.x1 - seg.x0
  const ez = seg.z1 - seg.z0
  const len2 = ex * ex + ez * ez
  // Closest point on the segment to the ball centre.
  let t = ((ball.x - seg.x0) * ex + (ball.z - seg.z0) * ez) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const px = seg.x0 + ex * t
  const pz = seg.z0 + ez * t

  let dx = ball.x - px
  let dz = ball.z - pz
  const rr = ball.r + seg.r
  let d = Math.hypot(dx, dz)
  if (d >= rr) return false
  if (d === 0) {
    // Dead centre: push out square to the blade rather than dividing by zero.
    dx = -ez
    dz = ex
    d = Math.hypot(dx, dz)
  }
  const nx = dx / d
  const nz = dz / d
  ball.x = px + nx * rr
  ball.z = pz + nz * rr
  const vn = ball.vx * nx + ball.vz * nz
  if (vn < 0) {
    ball.vx -= 2 * vn * nx
    ball.vz -= 2 * vn * nz
  }
  return true
}

/** Elastic circle-circle response; a moving paddle transfers its velocity. */
function collidePaddle(ball: Body, p: Body): boolean {
  const dx = ball.x - p.x
  const dz = ball.z - p.z
  const rr = ball.r + p.r
  const d2 = dx * dx + dz * dz
  if (d2 >= rr * rr || d2 === 0) return false

  const d = Math.sqrt(d2)
  const nx = dx / d
  const nz = dz / d

  // Push the ball out of the paddle.
  const pen = rr - d
  ball.x += nx * pen
  ball.z += nz * pen

  // Reflect the ball's velocity relative to the paddle (so paddle motion counts).
  const rvx = ball.vx - p.vx
  const rvz = ball.vz - p.vz
  const vn = rvx * nx + rvz * nz
  if (vn < 0) {
    ball.vx -= 2 * vn * nx
    ball.vz -= 2 * vn * nz
  }
  return true
}

function clampSpeed(ball: Body) {
  const s = Math.hypot(ball.vx, ball.vz)
  if (s === 0) return
  const t = Math.max(BALL_MIN_SPEED, Math.min(BALL_MAX_SPEED, s)) / s
  if (t !== 1) {
    ball.vx *= t
    ball.vz *= t
  }
}
