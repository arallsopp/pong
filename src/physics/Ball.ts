import { Vector3 } from 'three'
import type { Arena } from '../arena/Arena'

const _n = new Vector3()
const _step = new Vector3()

export interface BallState {
  pos: Vector3
  vel: Vector3
  radius: number
}

export interface StepResult {
  /** Set when the ball entered a goal zone this step. */
  goal?: 'near' | 'far'
  /** Number of court-wall bounces this step. */
  bounces: number
}

/**
 * Advance the ball by dt with continuous collision against the court SDF.
 * We integrate position, then if the ball has penetrated the boundary
 * (sdf + radius > 0) we reflect velocity about the surface normal and push
 * back to the surface. Because dt is a fixed small substep this stays stable
 * without full swept-sphere CCD, but the penetration correction prevents the
 * ball from resting inside a wall.
 */
export function stepBall(
  ball: BallState,
  arena: Arena,
  dt: number,
  restitution = 1.0,
): StepResult {
  const result: StepResult = { bounces: 0 }

  _step.copy(ball.vel).multiplyScalar(dt)
  ball.pos.add(_step)

  // Goal check first — reaching an end zone ends the rally regardless of walls.
  const zone = arena.zoneAt(ball.pos)
  if (zone !== 'court') {
    result.goal = zone
    return result
  }

  // Court-wall collision: penetration if signed distance exceeds -radius.
  const d = arena.sdf(ball.pos)
  if (d > -ball.radius) {
    arena.normalAt(ball.pos, _n) // outward normal
    // Reflect velocity: v' = v - (1+e)(v·n)n, only if moving into the wall.
    const vn = ball.vel.dot(_n)
    if (vn > 0) {
      ball.vel.addScaledVector(_n, -(1 + restitution) * vn)
      result.bounces++
    }
    // Push the ball back inside so it sits exactly on the surface.
    const penetration = d + ball.radius
    ball.pos.addScaledVector(_n, -penetration)
  }

  return result
}
