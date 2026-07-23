import {
  BALL_MAX_SPEED,
  BALL_MIN_SPEED,
  GOAL_HALF,
  HALF_L,
  HALF_W,
} from './const'

/** A circle on the table plane with a velocity. */
export interface Body {
  x: number
  z: number
  vx: number
  vz: number
  r: number
}

export type GoalSide = 'near' | 'far' | null

/**
 * Advance the ball one substep: move, resolve side/end walls (leaving the goal
 * mouths open), resolve paddle collisions, and clamp speed. Returns which goal
 * the ball fully entered this step, if any. 'near' = our goal (opponent scores),
 * 'far' = their goal (we score).
 */
export function stepBall(ball: Body, dt: number, paddles: Body[]): GoalSide {
  ball.x += ball.vx * dt
  ball.z += ball.vz * dt

  // Side walls.
  const maxX = HALF_W - ball.r
  if (ball.x < -maxX) {
    ball.x = -maxX
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x > maxX) {
    ball.x = maxX
    ball.vx = -Math.abs(ball.vx)
  }

  // End walls, with the goal mouth left open.
  const maxZ = HALF_L - ball.r
  const inMouth = Math.abs(ball.x) < GOAL_HALF
  if (ball.z > maxZ) {
    if (inMouth) {
      if (ball.z > HALF_L + ball.r) return 'near'
    } else {
      ball.z = maxZ
      ball.vz = -Math.abs(ball.vz)
    }
  } else if (ball.z < -maxZ) {
    if (inMouth) {
      if (ball.z < -HALF_L - ball.r) return 'far'
    } else {
      ball.z = -maxZ
      ball.vz = Math.abs(ball.vz)
    }
  }

  for (const p of paddles) collidePaddle(ball, p)

  clampSpeed(ball)
  return null
}

/** Elastic circle-circle response; a moving paddle transfers its velocity. */
function collidePaddle(ball: Body, p: Body) {
  const dx = ball.x - p.x
  const dz = ball.z - p.z
  const rr = ball.r + p.r
  const d2 = dx * dx + dz * dz
  if (d2 >= rr * rr || d2 === 0) return

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
