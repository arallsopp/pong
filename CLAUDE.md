# Murderball — working notes

A mobile-first PWA game: top-down **air-hockey + pinball** hybrid in a 16-bit
Bitmap-Brothers pixel style. Solo vs AI. Built with **Three.js + Vite +
TypeScript**. See `DESIGN.md` for the full design rationale and decisions.

> Note: the repo/URL is called `pong` and it began as a first-person 3D Pong
> (now abandoned — still in git history). The current game is Murderball.

## Run / verify / deploy

```bash
npm run dev -- --host     # http://localhost:5173/pong/  (LAN IP for phone)
npx tsc --noEmit          # type-check (do this after every change)
npm run build             # production build (tsc + vite)
```

- **Base path is `/pong/`** (`vite.config.ts`) for GitHub Pages — dev URL
  includes it.
- **Deploy:** pushing to `main` triggers `.github/workflows/deploy.yml` →
  GitHub Pages at **https://arallsopp.github.io/pong/**.
- **Pushing:** the git remote is SSH but this environment has no SSH key. Push
  over HTTPS with the gh credential helper:
  `gh auth setup-git && git push https://github.com/arallsopp/pong.git HEAD:main`.
  The user also commits/pushes intermittently themselves — run `git log`/`git
  status` before assuming what's committed.

## Coordinate system (important)

Everything lives on the **XZ plane**, y = up.

- `x` = width, `[-HALF_W, HALF_W]` = `[-10, 10]`.
- `z` = length, `[-HALF_L, HALF_L]` = `[-16, 16]`.
- **`+z` = near / OUR end** (bottom of screen, our goal, blue paddle).
- **`-z` = far / THEIR end** (top, AI, grey/orange paddle).
- `y` is only non-trivial while the ball rides the ramp.

Camera is a **fixed 3D perspective** view (table reads as a trapezoid), at
`(0, CAM_Y=30, CAM_Z=26)` looking at `(0,1,-2)` — see `main.ts`.

## Rendering approach

Full-resolution render. The 16-bit look comes from **nearest-filtered bitmap
textures on smooth geometry** + a chrome **matcap** for metal (ball, paddles,
rails). We tried full-screen low-res pixelation and **deliberately abandoned
it** (it made the round ball blocky). Don't reintroduce it without asking.

## File map (`src/`)

| File | Responsibility |
|---|---|
| `main.ts` | Entry: scene, renderer, fixed **120 Hz** loop, camera, ball+paddles, touch-drag input (raycast to table plane), ramp traversal, tug-of-war/possession, guns, HUD. |
| `game/const.ts` | All dimensions and tunable gameplay constants. |
| `game/physics.ts` | 2D ball physics. `stepBall()` → `{goal, hitIndex}`; walls leave goal mouths open; paddle = elastic circle-circle that transfers paddle velocity. |
| `game/table.ts` | Floor plane + side/end walls (tall, `WALL_H=3.5`). |
| `game/floorTexture.ts` | Procedural pixel-art floor: metal-blue, rivets, **embossed** center circle + line, lavender star, amber goal mouths. Drawn at 3× res. |
| `game/textures.ts` | Metal matcap, steel wall texture, ball shadow texture. (`makePaddleTexture` is currently unused.) |
| `game/ramp.ts` | Murderball rail: an **open S-curve with a spiral at each end** (bulging past the side walls), lifted into 3D. Two banked rods, marble rides on top. `ride(u)` gives the on-rail ball position. |
| `game/stars.ts` | Tug-of-war 5-star track on the **left** wall. `setBalance(-2..+2)`. |
| `game/guns.ts` | Gun pickup token (pixel icon) + laser-shot mesh factories. |

## What works now

- Air-hockey rally vs a beatable AI; **timed match** (120 s) with `MATCH OVER`.
- Direct **touch-drag** paddle, confined to our half; imparts velocity to ball.
- **Tug-of-war stars**: last hitter (possession) nudges the balance on a
  star-strike; favored side adds its bonus to each goal scored.
- **Murderball ramp** geometry + ball ride: enter a tip (only when approaching
  roughly parallel, ~45°), ride up-over-down, exit boosted. Bidirectional.
- **Gun**: token spawns in our half; cover with paddle + release finger to fire
  a bolt that freezes the AI paddle 3 s.
- Altitude-aware ball shadow; baked-vs-real shadow decision documented in ramp.

## Not done yet (rough build order)

1. **Accelerator flipper** (player-timed) at the ramp apex + **loop counting**:
   3 successful loops → **arm murderball** → **~8 s unstoppable window** (ball
   phases through the opponent paddle). Ramp currently just auto-boosts on exit.
2. **AI symmetry**: AI grabbing guns and charging the ramp/murderball. Guns
   currently spawn only in our half; AI can't use ramp/guns.
3. Star track polish / visibility pass (maybe both walls); confirm on device.
4. **Presentation/PWA**: amber pixel-font scoreboard panel (HUD is CSS
   monospace now), SFX, haptics, offline service worker + manifest/install,
   portrait lock, wake lock.

## Working style & gotchas

- **We build blind** — the assistant can't see the running game; the user
  eyeballs it and reports back. So: keep shape/feel constants at the **top of
  each module** and easy to tune, and expect a few iterations per visual change.
- The **ramp shape came from the user's top-down drawing**: an S-curve with a
  ~1-turn spiral at each end, spirals bulge **past the side walls**, the two
  free inner tips (near center) are entry/exit. Point-symmetric. Control points
  are the `CP` array in `ramp.ts`.
- Likely-wrong-and-need-a-flip: `BANK_GAIN` sign (rail bank direction) in
  `ramp.ts`. Capture parallel-tolerance is the `0.7` in `tryEnterRamp`.
- Paddle identity is by **position** (bottom = us) not loud color — palette is
  muted metal blue-grey to match the aesthetic.
