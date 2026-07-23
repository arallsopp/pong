// Generates a to-scale top-down plan of the Murderball court from the real
// constants, as an SVG for the user to annotate.
import fs from 'node:fs'

// --- Constants mirrored from src/game/const.ts + ramp.ts ---
const HALF_W = 10, HALF_L = 16, GOAL_HALF = 3.5, WALL_T = 0.6
const BALL_R = 0.55, PAD_R = 1.4
const RAMP_MOUTH_Z = 0.4, RAMP_SLOT_HALF = 0.9, RAMP_FIN_LEN = 1.8, RAMP_FIN_T = 0.35
const R = 1.8, LOOP_TURNS = 1.625, TARGET_SEP = 4.8, TARGET_R = 0.82
const BLUE = '#2ad4ff', PINK = '#ff3ecb', AMBER = '#ffcc33', STEEL = '#9fb4cc'
const WALL = '#46566b'

// The 45° murderball slots, same construction as const.ts makeSlot().
const SLOTS = [1, -1].map((sx) => {
  const q = Math.SQRT1_2
  const x = sx * HALF_W, z = -sx * RAMP_MOUTH_Z
  const ax = sx * q, az = -sx * q
  const nx = -az, nz = ax
  const span = RAMP_SLOT_HALF * Math.SQRT2
  const off = RAMP_FIN_T / 2
  const zFin = z - sx * span
  return { sx, x, z, ax, az, nx, nz, zFin, zOpen: z + sx * span, ours: sx === 1, fin: {
    x0: x - ax * RAMP_FIN_LEN - nx * off, z0: zFin - az * RAMP_FIN_LEN - nz * off,
    x1: x + ax * WALL_T - nx * off,       z1: zFin + az * WALL_T - nz * off, r: off } }
})

// --- View mapping: +x → right, +z (our end) → bottom, -z (their end) → top ---
const S = 22 // px per world unit
const Xmin = -16.5, Xmax = 16.5, Zmin = -17, Zmax = 17
const PAD = 72
const sx = (x) => (PAD + (x - Xmin) * S).toFixed(1)
const sy = (z) => (PAD + (z - Zmin) * S).toFixed(1)
const W = PAD * 2 + (Xmax - Xmin) * S
const H = PAD * 2 + (Zmax - Zmin) * S
const r = (v) => (v * S).toFixed(1)

const out = []
const p = (s) => out.push(s)

p(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, Menlo, monospace">`)
p(`<rect x="0" y="0" width="${W}" height="${H}" fill="#141b25"/>`)

// Grid (every 2 units)
for (let x = -16; x <= 16; x += 2)
  p(`<line x1="${sx(x)}" y1="${sy(Zmin)}" x2="${sx(x)}" y2="${sy(Zmax)}" stroke="rgba(255,255,255,0.05)"/>`)
for (let z = -16; z <= 16; z += 2)
  p(`<line x1="${sx(Xmin)}" y1="${sy(z)}" x2="${sx(Xmax)}" y2="${sy(z)}" stroke="rgba(255,255,255,0.05)"/>`)

// Court floor
p(`<rect x="${sx(-HALF_W)}" y="${sy(-HALF_L)}" width="${r(2 * HALF_W)}" height="${r(2 * HALF_L)}" fill="#243449" stroke="none"/>`)
// Centre line + circle + ball
p(`<line x1="${sx(-HALF_W)}" y1="${sy(0)}" x2="${sx(HALF_W)}" y2="${sy(0)}" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>`)
p(`<circle cx="${sx(0)}" cy="${sy(0)}" r="${r(3)}" fill="none" stroke="rgba(200,180,255,0.35)" stroke-width="2"/>`)
p(`<circle cx="${sx(0)}" cy="${sy(0)}" r="${r(BALL_R)}" fill="#e9f1fb"/>`)

// Polygon helper, in world units.
const poly = (pts, fill, extra = '') =>
  p(`<polygon points="${pts.map(([x, z]) => `${sx(x)},${sy(z)}`).join(' ')}" fill="${fill}" ${extra}/>`)

// Side walls: two runs per wall, broken at mid-court by the 45° murderball slot.
// Each run's end is chamfered parallel to the slot axis; on the guard side the
// chamfer carries on into the court as the blade.
for (const s of SLOTS) {
  const inner = s.x, outer = s.x + s.sx * WALL_T
  // Run behind the guard blade (inner face reaches zFin, outer face stops short).
  poly([[inner, -s.sx * HALF_L], [inner, s.zFin], [outer, s.zFin - s.sx * WALL_T], [outer, -s.sx * HALF_L]], WALL)
  // Approach-side run, chamfered the same way round.
  poly([[inner, s.zOpen], [inner, s.sx * HALF_L], [outer, s.sx * HALF_L], [outer, s.zOpen - s.sx * WALL_T]], WALL)
  // Guard blade: rectangle around its centreline.
  const f = s.fin, o = RAMP_FIN_T / 2
  poly([
    [f.x0 - s.nx * o, f.z0 - s.nz * o], [f.x0 + s.nx * o, f.z0 + s.nz * o],
    [f.x1 + s.nx * o, f.z1 + s.nz * o], [f.x1 - s.nx * o, f.z1 - s.nz * o],
  ], '#6b7f99')
}
// End walls with goal mouth gap
for (const wz of [-HALF_L, HALF_L]) {
  p(`<rect x="${sx(-HALF_W)}" y="${sy(wz - WALL_T / 2)}" width="${r(HALF_W - GOAL_HALF)}" height="${r(WALL_T)}" fill="${WALL}"/>`)
  p(`<rect x="${sx(GOAL_HALF)}" y="${sy(wz - WALL_T / 2)}" width="${r(HALF_W - GOAL_HALF)}" height="${r(WALL_T)}" fill="${WALL}"/>`)
  // Goal mouth (amber)
  p(`<line x1="${sx(-GOAL_HALF)}" y1="${sy(wz)}" x2="${sx(GOAL_HALF)}" y2="${sy(wz)}" stroke="${AMBER}" stroke-width="4"/>`)
}

// --- Ramp (plan projection) ---
// Corkscrew loops (just outside each side wall) + the overhead crossover between
// where each corkscrew tops out.
const loops = SLOTS.map((s) => ({
  cx: s.x + s.nx * R, cz: s.z + s.nz * R, col: s.ours ? BLUE : PINK,
}))
const th = LOOP_TURNS * Math.PI * 2
const top = { // where the right corkscrew tops out and heads for the apex
  x: loops[0].cx + R * (-SLOTS[0].nx * Math.cos(th) + SLOTS[0].ax * Math.sin(th)),
  z: loops[0].cz + R * (-SLOTS[0].nz * Math.cos(th) + SLOTS[0].az * Math.sin(th)),
}
p(`<line x1="${sx(top.x)}" y1="${sy(top.z)}" x2="${sx(-top.x)}" y2="${sy(-top.z)}" stroke="#8ea4bd" stroke-width="3" stroke-dasharray="7 6"/>`)
for (const l of loops)
  p(`<circle cx="${sx(l.cx)}" cy="${sy(l.cz)}" r="${r(R)}" fill="none" stroke="${l.col}" stroke-width="3" stroke-dasharray="6 5"/>`)

// Slot throats (drawn across the 45° axis) + entry-direction arrows.
for (const s of SLOTS) {
  const col = s.ours ? BLUE : PINK
  p(`<line x1="${sx(s.x - s.nx * RAMP_SLOT_HALF)}" y1="${sy(s.z - s.nz * RAMP_SLOT_HALF)}" x2="${sx(s.x + s.nx * RAMP_SLOT_HALF)}" y2="${sy(s.z + s.nz * RAMP_SLOT_HALF)}" stroke="${col}" stroke-width="6"/>`)
  // Arrow runs along the slot axis: the direction the ball must be travelling.
  p(`<path d="M ${sx(s.x - s.ax * 4.4)} ${sy(s.z - s.az * 4.4)} L ${sx(s.x - s.ax * 1.9)} ${sy(s.z - s.az * 1.9)}" stroke="${col}" stroke-width="2.5" marker-end="url(#${s.ours ? 'ab' : 'ap'})"/>`)
}

// --- Claim targets (2 per wall, evenly spaced either side of the slot) ---
for (const s of SLOTS) {
  for (const tz of [s.z - TARGET_SEP, s.z + TARGET_SEP])
    p(`<circle cx="${sx(s.x - s.sx * 0.06)}" cy="${sy(tz)}" r="${r(TARGET_R)}" fill="#0a0d12" stroke="${STEEL}" stroke-width="2.5"/>`)
}

// --- Paddles ---
p(`<circle cx="${sx(0)}" cy="${sy(HALF_L * 0.6)}" r="${r(PAD_R)}" fill="#9fb4cc" stroke="#dfe" stroke-width="1"/>`)
p(`<circle cx="${sx(0)}" cy="${sy(-HALF_L * 0.6)}" r="${r(PAD_R)}" fill="#7d8ea3" stroke="#bcd" stroke-width="1"/>`)

// --- Axis ticks / labels ---
const T = '#9fb4cc'
for (const x of [-10, -5, 0, 5, 10])
  p(`<text x="${sx(x)}" y="${+sy(Zmax) + 22}" fill="${T}" font-size="13" text-anchor="middle">x=${x}</text>`)
for (const z of [-16, -8, 0, 8, 16])
  p(`<text x="${sx(Xmin) - 8}" y="${+sy(z) + 4}" fill="${T}" font-size="13" text-anchor="end">z=${z}</text>`)

const cap = (x, z, t, fill = '#e6edf5', size = 15, anchor = 'middle') =>
  p(`<text x="${sx(x)}" y="${sy(z)}" fill="${fill}" font-size="${size}" text-anchor="${anchor}" font-weight="700">${t}</text>`)
cap(0, -16.5, 'THEIR END  (−z, far)', '#cbd6e4', 16)
cap(0, 16.9, 'MY END  (+z, near, blue)', BLUE, 16)
cap(0, -15.2, 'their goal', AMBER, 12)
cap(0, 15.3, 'my goal', AMBER, 12)
cap(15.0, 0.9, 'MY loop', BLUE, 13)
cap(-15.0, -0.9, 'THEIR loop', PINK, 13)
cap(0, -1.4, '← overhead cross →', '#aebfd4', 12, 'middle')
cap(7.9, SLOTS[0].z - TARGET_SEP + 0.3, 'target', STEEL, 11, 'end')
cap(7.9, SLOTS[0].z + TARGET_SEP + 0.3, 'target', STEEL, 11, 'end')
cap(8.1, -3.0, 'guard blade ↘', STEEL, 11, 'end')

// Title + note
p(`<text x="${sx(Xmin) - 8}" y="34" fill="#e6edf5" font-size="19" font-weight="700">MURDERBALL — court plan (top-down, to scale · 20 × 32 units)</text>`)
p(`<text x="${sx(Xmin) - 8}" y="54" fill="#8ea4bd" font-size="12">Dashed = ramp is up in the air (corkscrews climb 0.55→6 over ${LOOP_TURNS} turns; overhead apex ≈ 8). Arrows = required entry direction; the guard blade turns away anything arriving the other way.</text>`)

// Arrow markers
p(`<defs>
  <marker id="ab" markerWidth="9" markerHeight="9" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${BLUE}"/></marker>
  <marker id="ap" markerWidth="9" markerHeight="9" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${PINK}"/></marker>
</defs>`)

p(`</svg>`)
fs.writeFileSync(process.argv[2], out.join('\n'))
console.log('wrote', process.argv[2])
