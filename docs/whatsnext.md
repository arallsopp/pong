# whats next?

commit as you go.

## Just done (this pass)

- **Slot-mouth colour** no longer paints the 45° chamfer (a vertical face reads
  as a clipped sliver from the near-top-down camera). Chamfer is now plain wall
  steel; the owner's colour is a **lip on the wall top** at each mouth
  (`addMouthCap` in `table.ts`, `MOUTH_CAP_LEN`).
- **AI power-ups On/Off** toggle on the start overlay (`aiGunsEnabled`), separate
  from difficulty. Default On.
- **Conceded-goal spin**: when you concede (near goal) the replay orbits the view
  around the ball as it zooms in, so the board spins back to a readable
  orientation (`PLAYER_GOAL_SPIN` in `main.ts`, default 180°).
- **AI dribble fixed**: removed the Hard-only "line up behind the ball and feed
  its own slot" behaviour — it let the AI stick the ball to its paddle and walk
  it to the ramp. `AiProfile` lost `seeksRamp`/`usesGuns` (guns is now the UI
  toggle).
- **Scoreboard scores in home colours** (blue = us, pink = them); clock amber.
- **With AI power-ups off**, tokens only spawn on our half (`spawnToken`).
- **Persistence** (localStorage `murderball`): difficulty, AI power-ups toggle,
  mute, and high score (best goals in a match) survive reloads; overlay shows
  `BEST nnn`.

## Tuning dials to eyeball on device

- `MOUTH_CAP_LEN` / lip height in `table.ts` — how much of the wall end reads as
  team-coloured.
- `PLAYER_GOAL_SPIN` in `main.ts` — spin amount/direction on a conceded goal
  (π = swing right around; try less if it feels like too much).
- AI power-ups toggle default (currently On) — flip in `main.ts` if Off suits
  playtesting better.

## Still open (from CLAUDE.md "Not done yet")

1. **On-device framing check**: the ramp arch can clip the screen edge at max
   zoom (the fit tracks only the four floor corners). Decide whether to fold the
   arch into the fit.
2. **Presentation/PWA**: amber pixel-font scoreboard panel, SFX for the power-ups,
   haptics, offline service worker + manifest/install, portrait lock, wake lock.
