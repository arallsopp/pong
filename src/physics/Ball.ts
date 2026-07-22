import { Vector3 } from 'three'
import type { Arena } from '../arena/Arena'
import type { Paddle } from './Paddle'

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
  /** Set when a paddle struck the ball this step. */
  paddleHit?: Paddle
}

/**
 * Advance the ball by dt with continuous collision against the court SDF.
 * We integrate position, then if the ball has penetrated the boundary
 * (sdf + radius > 0) we reflect velocity about the surface normal and push
 * back to the surface. Because dt is a fixed small substep this stays stable
 * without full swept-sphere CCD, but the penetration correction prevents the
 * ball from resting inside a wall.
 */
const _pball: BallState = { pos: new Vector3(), vel: new Vector3(), radius: 0 }

/**
 * Predict where the ball will cross the player's paddle plane (z = planeZ,
 * approached from -z, i.e. moving toward +z), accounting for wall bounces by
 * reusing the real integrator. Returns the crossing x/y, or null if the ball
 * is heading away or won't arrive within maxSteps.
 */
export function predictImpact(
  ball: BallState,
  arena: Arena,
  planeZ: number,
  dt: number,
  maxSteps = 2000,
): { x: number; y: number } | null {
  if (ball.vel.z <= 0) return null // not heading toward the player
  _pball.pos.copy(ball.pos)
  _pball.vel.copy(ball.vel)
  _pball.radius = ball.radius
  for (let i = 0; i < maxSteps; i++) {
    const prevZ = _pball.pos.z
    const r = stepBall(_pball, arena, dt)
    if (r.goal) return null // lands in a goal, not on our plane
    if (prevZ < planeZ && _pball.pos.z >= planeZ) {
      return { x: _pball.pos.x, y: _pball.pos.y }
    }
  }
  return null
}

export function stepBall(
  ball: BallState,
  arena: Arena,
  dt: number,
  paddles: Paddle[] = [],
  restitution = 1.0,
): StepResult {
  const result: StepResult = { bounces: 0 }

  _step.copy(ball.vel).multiplyScalar(dt)
  ball.pos.add(_step)

  // Paddles are tested before the goal so an interception saves the point.
  for (const p of paddles) {
    if (p.collide(ball)) {
      result.paddleHit = p
      return result
    }
  }

  // Goal check — reaching an end zone ends the rally regardless of walls.
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
