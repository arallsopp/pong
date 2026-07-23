// Generates a to-scale top-down plan of the Murderball court from the real
// constants, as an SVG for the user to annotate.
const fs = require('fs')

// --- Constants mirrored from src/game/const.ts + ramp.ts ---
const HALF_W = 10, HALF_L = 16, GOAL_HALF = 3.5, WALL_T = 0.6
const BALL_R = 0.55, PAD_R = 1.4
const RAMP_HOLE_Z = 6, R = 2.6, TARGET_SEP = 3.2, TARGET_R = 0.82
const BLUE = '#2ad4ff', PINK = '#ff3ecb', AMBER = '#ffcc33', STEEL = '#9fb4cc'

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

// Side walls (thick steel)
for (const wx of [-HALF_W, HALF_W])
  p(`<rect x="${sx(wx - WALL_T / 2)}" y="${sy(-HALF_L)}" width="${r(WALL_T)}" height="${r(2 * HALF_L)}" fill="#46566b"/>`)
// End walls with goal mouth gap
for (const wz of [-HALF_L, HALF_L]) {
  p(`<rect x="${sx(-HALF_W)}" y="${sy(wz - WALL_T / 2)}" width="${r(HALF_W - GOAL_HALF)}" height="${r(WALL_T)}" fill="#46566b"/>`)
  p(`<rect x="${sx(GOAL_HALF)}" y="${sy(wz - WALL_T / 2)}" width="${r(HALF_W - GOAL_HALF)}" height="${r(WALL_T)}" fill="#46566b"/>`)
  // Goal mouth (amber)
  p(`<line x1="${sx(-GOAL_HALF)}" y1="${sy(wz)}" x2="${sx(GOAL_HALF)}" y2="${sy(wz)}" stroke="${AMBER}" stroke-width="4"/>`)
}

// --- Ramp (plan projection) ---
// Overhead crossover: straight diagonal mouth→mouth (rises to y≈8, drawn dashed)
p(`<line x1="${sx(HALF_W)}" y1="${sy(RAMP_HOLE_Z)}" x2="${sx(-HALF_W)}" y2="${sy(-RAMP_HOLE_Z)}" stroke="#8ea4bd" stroke-width="3" stroke-dasharray="7 6"/>`)
// Corkscrew loops (full circles just outside each side wall)
p(`<circle cx="${sx(HALF_W + R)}" cy="${sy(RAMP_HOLE_Z)}" r="${r(R)}" fill="none" stroke="${BLUE}" stroke-width="3" stroke-dasharray="6 5"/>`)
p(`<circle cx="${sx(-(HALF_W + R))}" cy="${sy(-RAMP_HOLE_Z)}" r="${r(R)}" fill="none" stroke="${PINK}" stroke-width="3" stroke-dasharray="6 5"/>`)
// Wall mouths (slots) + entry-direction arrows
p(`<rect x="${sx(HALF_W - 0.4)}" y="${sy(RAMP_HOLE_Z + 0.7)}" width="${r(0.8)}" height="${r(1.4)}" fill="${BLUE}"/>`)
p(`<rect x="${sx(-HALF_W - 0.4)}" y="${sy(-RAMP_HOLE_Z - 0.7)}" width="${r(0.8)}" height="${r(1.4)}" fill="${PINK}"/>`)
// entry arrows (ball must move AWAY from owner's end): right→ -z (up), left→ +z (down)
p(`<path d="M ${sx(HALF_W - 1.6)} ${sy(RAMP_HOLE_Z + 1.6)} L ${sx(HALF_W - 1.6)} ${sy(RAMP_HOLE_Z - 1.2)}" stroke="${BLUE}" stroke-width="2.5" marker-end="url(#ab)"/>`)
p(`<path d="M ${sx(-HALF_W + 1.6)} ${sy(-RAMP_HOLE_Z - 1.6)} L ${sx(-HALF_W + 1.6)} ${sy(-RAMP_HOLE_Z + 1.2)}" stroke="${PINK}" stroke-width="2.5" marker-end="url(#ap)"/>`)

// --- Claim targets (2 per wall flanking each mouth) ---
const targets = [
  [HALF_W - 0.06, RAMP_HOLE_Z - TARGET_SEP], [HALF_W - 0.06, RAMP_HOLE_Z + TARGET_SEP],
  [-HALF_W + 0.06, -RAMP_HOLE_Z + TARGET_SEP], [-HALF_W + 0.06, -RAMP_HOLE_Z - TARGET_SEP],
]
for (const [tx, tz] of targets) {
  p(`<circle cx="${sx(tx)}" cy="${sy(tz)}" r="${r(TARGET_R)}" fill="#0a0d12" stroke="${STEEL}" stroke-width="2.5"/>`)
}

// --- Paddles ---
p(`<circle cx="${sx(0)}" cy="${sy(HALF_L * 0.6)}" r="${r(PAD_R)}" fill="#9fb4cc" stroke="#dfe" stroke-width="1"/>`)
p(`<circle cx="${sx(0)}" cy="${sy(-HALF_L * 0.6)}" r="${r(PAD_R)}" fill="#7d8ea3" stroke="#bcd" stroke-width="1"/>`)

// --- Axis ticks / labels ---
const T = '#9fb4cc'
for (const x of [-10, -5, 0, 5, 10])
  p(`<text x="${sx(x)}" y="${sy(Zmax) + 22}" fill="${T}" font-size="13" text-anchor="middle">x=${x}</text>`)
for (const z of [-16, -8, 0, 8, 16])
  p(`<text x="${sx(Xmin) - 8}" y="${+sy(z) + 4}" fill="${T}" font-size="13" text-anchor="end">z=${z}</text>`)

const cap = (x, z, t, fill = '#e6edf5', size = 15, anchor = 'middle') =>
  p(`<text x="${sx(x)}" y="${sy(z)}" fill="${fill}" font-size="${size}" text-anchor="${anchor}" font-weight="700">${t}</text>`)
cap(0, -16.5, 'THEIR END  (−z, far)', '#cbd6e4', 16)
cap(0, 16.9, 'MY END  (+z, near, blue)', BLUE, 16)
cap(0, -15.2, 'their goal', AMBER, 12)
cap(0, 15.3, 'my goal', AMBER, 12)
cap(13.6, 6, 'MY loop', BLUE, 13)
cap(-13.6, -6, 'THEIR loop', PINK, 13)
cap(0, 1.3, 'overhead cross →', '#aebfd4', 12, 'middle')
cap(8.2, 2.8, 'target', STEEL, 11, 'end')
cap(8.2, 9.2, 'target', STEEL, 11, 'end')

// Title + note
p(`<text x="${sx(Xmin) - 8}" y="34" fill="#e6edf5" font-size="19" font-weight="700">MURDERBALL — court plan (top-down, to scale · 20 × 32 units)</text>`)
p(`<text x="${sx(Xmin) - 8}" y="54" fill="#8ea4bd" font-size="12">Dashed = ramp is up in the air (loops climb 0.55→6; overhead apex ≈ 8 — not shown in a plan). Arrows = required entry direction.</text>`)

// Arrow markers
p(`<defs>
  <marker id="ab" markerWidth="9" markerHeight="9" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${BLUE}"/></marker>
  <marker id="ap" markerWidth="9" markerHeight="9" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${PINK}"/></marker>
</defs>`)

p(`</svg>`)
fs.writeFileSync(process.argv[2], out.join('\n'))
console.log('wrote', process.argv[2])
