import { Vector3 } from 'three'
import type { Arena } from '../arena/Arena'
import type { BallState } from './Ball'

const _n = new Vector3()

/**
 * A convex paddle that lives on a plane at fixed z and slides in x/y. The
 * convex surface means where the ball lands relative to the paddle centre sets
 * the return angle: dead centre returns straight, an edge hit returns sharply.
 * `facing` is +1 for the near (player) paddle whose normal points toward +z,
 * and -1 for the far (AI) paddle whose normal points toward -z.
 */
export class Paddle {
  x = 0
  y = 0
  readonly z: number
  readonly facing: 1 | -1
  /** Catch radius in the paddle plane. */
  radius: number
  /** Convexity: lateral normal gain per unit offset. Higher = wilder angles. */
  curve: number
  /** Speed multiplier applied on each successful hit (the per-rally ramp). */
  boost: number
  /** Max return angle off the forward axis (radians). Keeps returns forward. */
  maxAngle: number

  constructor(
    z: number,
    facing: 1 | -1,
    radius = 6,
    curve = 0.16,
    boost = 1.03,
    maxAngle = Math.PI / 4, // 45°
  ) {
    this.z = z
    this.facing = facing
    this.radius = radius
    this.curve = curve
    this.boost = boost
    this.maxAngle = maxAngle
  }

  /**
   * Test and resolve a collision with the ball for this substep. Returns true
   * if the paddle struck the ball. Called after the ball has been advanced but
   * before the goal test, so a hit prevents the point.
   */
  collide(ball: BallState): boolean {
    const approaching = ball.vel.z * this.facing > 0
    if (!approaching) return false

    // Has the ball reached (or passed) the paddle plane this substep?
    const reached =
      this.facing > 0
        ? ball.pos.z + ball.radius >= this.z
        : ball.pos.z - ball.radius <= this.z
    if (!reached) return false

    const dx = ball.pos.x - this.x
    const dy = ball.pos.y - this.y
    if (dx * dx + dy * dy > this.radius * this.radius) return false // whiffed

    // Convex surface normal at the contact offset, pointing back toward the ball.
    _n.set(dx * this.curve, dy * this.curve, this.facing).normalize()
    const vn = ball.vel.dot(_n)
    if (vn > 0) {
      ball.vel.addScaledVector(_n, -2 * vn) // elastic reflection
      ball.vel.multiplyScalar(this.boost) // per-rally speed ramp
      this.clampForward(ball)
    }
    // Sit the ball exactly on the paddle plane so it can't re-trigger.
    ball.pos.z = this.z - this.facing * ball.radius
    return true
  }

  /**
   * Cap the return angle so the ball can't leave near-tangentially. The lateral
   * aim *direction* is preserved (you still steer left/right/up/down), but its
   * magnitude is limited so the ball always makes strong forward progress and
   * doesn't ping-pong between side walls for dozens of bounces.
   */
  private clampForward(ball: BallState) {
    const fwd = -this.facing // sign of z the return should travel
    const speed = ball.vel.length()
    if (speed < 1e-6) return
    const vzF = ball.vel.z * fwd // forward component (want > 0)
    const lat = Math.hypot(ball.vel.x, ball.vel.y)
    const angle = Math.atan2(lat, vzF)
    if (vzF <= 0 || angle > this.maxAngle) {
      const newLat = speed * Math.sin(this.maxAngle)
      const newVzF = speed * Math.cos(this.maxAngle)
      if (lat > 1e-6) {
        const s = newLat / lat
        ball.vel.x *= s
        ball.vel.y *= s
      }
      ball.vel.z = fwd * newVzF
    }
  }

  /**
   * Move toward target x/y at up to `maxSpeed`. The centre is clamped only to
   * the wall, not a radius inside it, so the paddle may overhang the edge and
   * its centre can reach right into a corner to strike a corner ball square.
   */
  moveToward(tx: number, ty: number, maxSpeed: number, dt: number, arena: Arena) {
    const b = arena.paddleBounds(this.z)
    const cx = Math.max(b.minX, Math.min(b.maxX, tx))
    const cy = Math.max(b.minY, Math.min(b.maxY, ty))
    const step = maxSpeed * dt
    this.x += Math.max(-step, Math.min(step, cx - this.x))
    this.y += Math.max(-step, Math.min(step, cy - this.y))
  }
}
