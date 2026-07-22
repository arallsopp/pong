import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three'

/**
 * A fading motion trail behind the ball. Keeps a short history of positions and
 * renders them as a vertex-coloured line that fades from bright at the head to
 * black at the tail — on the dark arena background that reads as a clean fade,
 * and additive blending gives it the neon glow. Doubles as a depth/speed cue:
 * a long stretched trail means fast, a short one means slow.
 */
export class Trail {
  readonly object: Line
  private readonly n: number
  private readonly base: Color
  private readonly hist: Vector3[]
  private readonly posAttr: Float32BufferAttribute
  private readonly colAttr: Float32BufferAttribute

  constructor(length = 32, color = 0x67e8f9) {
    this.n = length
    this.base = new Color(color)
    this.hist = Array.from({ length }, () => new Vector3())

    const geo = new BufferGeometry()
    this.posAttr = new Float32BufferAttribute(new Float32Array(length * 3), 3)
    this.colAttr = new Float32BufferAttribute(new Float32Array(length * 3), 3)
    this.posAttr.setUsage(DynamicDrawUsage)
    geo.setAttribute('position', this.posAttr)
    geo.setAttribute('color', this.colAttr)

    // Colour fade is static (head bright → tail black); only positions change.
    for (let i = 0; i < length; i++) {
      const t = 1 - i / (length - 1) // 1 at head, 0 at tail
      this.colAttr.setXYZ(i, this.base.r * t, this.base.g * t, this.base.b * t)
    }
    this.colAttr.needsUpdate = true

    const mat = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    this.object = new Line(geo, mat)
    this.object.frustumCulled = false
  }

  /** Collapse the trail onto a point — call on serve so it doesn't streak. */
  reset(p: Vector3) {
    for (const v of this.hist) v.copy(p)
    this.flush()
  }

  /** Push the current ball position as the new head. */
  update(p: Vector3) {
    // Shift history toward the tail, newest at index 0.
    for (let i = this.n - 1; i > 0; i--) this.hist[i].copy(this.hist[i - 1])
    this.hist[0].copy(p)
    this.flush()
  }

  private flush() {
    for (let i = 0; i < this.n; i++) {
      const v = this.hist[i]
      this.posAttr.setXYZ(i, v.x, v.y, v.z)
    }
    this.posAttr.needsUpdate = true
  }
}
