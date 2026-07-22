/**
 * Floating thumb-zone virtual stick. First pointer-down anywhere sets the stick
 * origin; dragging away from it yields a normalised vector in [-1,1]^2 that the
 * game maps to paddle velocity. Works with touch and mouse (desktop testing).
 */
export class Stick {
  x = 0
  y = 0
  active = false
  private id: number | null = null
  private ox = 0
  private oy = 0
  private readonly maxRadius = 70 // px to reach full deflection

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown, { passive: false })
    target.addEventListener('pointermove', this.onMove, { passive: false })
    target.addEventListener('pointerup', this.onUp)
    target.addEventListener('pointercancel', this.onUp)
  }

  private onDown = (e: PointerEvent) => {
    if (this.id !== null) return
    this.id = e.pointerId
    this.ox = e.clientX
    this.oy = e.clientY
    this.active = true
    e.preventDefault()
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return
    const dx = e.clientX - this.ox
    const dy = e.clientY - this.oy
    this.x = clamp(dx / this.maxRadius, -1, 1)
    // Screen y is down; invert so dragging up moves the paddle up.
    this.y = clamp(-dy / this.maxRadius, -1, 1)
    e.preventDefault()
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return
    this.id = null
    this.active = false
    this.x = 0
    this.y = 0
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
