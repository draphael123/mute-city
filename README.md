# MUTE CITY — Twist Road

A fan-made anti-gravity racer in the spirit of F-Zero GX's Mute City: 30
machines with stats and silhouettes, a momentum handling model with slide and
drift, hold-to-boost that spends your energy, side and spin attacks that knock
rivals out, a 7.4 km Twist Road with a 360° twist, banked halfpipe, jump gap,
dirt, mines, a tunnel and a jump plate, Grand Prix across four difficulties and
Time Attack against your own ghost. Vanilla ES modules + a vendored
`three.module.js`, no build step.

**Live:** https://mute-city.vercel.app · **Repo:** github.com/draphael123/mute-city

## Run

```bash
node serve.mjs
```

Open http://localhost:5875 (root `.claude/launch.json` has a `mute-city` entry).
Deploy is a static folder: `vercel deploy --prod --yes`.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate / brake | ↑ / ↓ (W / S) | A / B, triggers |
| Steer | ← → (A D) | left stick |
| Slide left / right (strafe, loose grip) | Q / E | LB / RB |
| Drift (tighter, more grip ceiling, some scrub) | Shift, or Q+E | LB+RB |
| Boost (hold; lap 2+; drains energy) | Space / X | X |
| Spin attack | Z / C | Y |
| Side attack | double-tap Q or E | double-tap LB / RB |
| Pause | Esc / P | Start |
| Settings (title or pause) | S | — |

## Flow

Title → **Select Mode** (Grand Prix with Novice / Standard / Expert / Master, or
Time Attack, or Settings) → **Select Machine** (30 machines, body / boost / grip
grades A–E, weight, and the accel ↔ max-speed balance slider) → opening flyover
(GP only, skippable, can be turned off) → countdown → 3 laps.

Settings persist in `localStorage` (`mc-settings`): music and SFX volume,
steering sensitivity, near/far camera, camera shake, render quality, km/h or
mph, minimap, opening flyover, announcer. Mode/machine/difficulty in `mc-prefs`,
the Time Attack record + ghost path in `mc-ghost`.

## How the racing works

- **Handling** (`src/player.js`): velocity is carried in the road frame; the
  pilot points a heading; grip pulls velocity toward the heading with a ceiling
  (the friction circle, per grip grade). The frame rotating under the machine
  pushes momentum outward in every bend, so bends are driven, not followed.
  Slide (one shoulder) loosens grip and strafes; drift (both) raises the yaw
  rate and the grip ceiling but scrubs speed. Air has almost no grip. Hard rail
  impacts spin you out.
- **Energy** is health. Rails, mines, contact and rival attacks drain it (scaled
  by body grade). Boost drains 20–28/s while held. The pink pit strip refills
  45/s, and boosting on it is the lap-2 gamble. Zero energy = machine destroyed.
- **Combat**: side attack lunges 8 m and hits for ~26 (weighted by mass ratio),
  spin attack hits everything within 8 m for ~20. Rivals have 100 energy, flash
  when hit, explode at zero and are out of the race. Rivals block when just
  ahead, side-attack when alongside, boost to catch up, avoid mines and dirt,
  spin out when shoved, and occasionally take each other out.
- **Machines** (`src/machines.js`): 30 entries, 8 silhouette archetypes built
  from parameters (hull, pods, wings, fins, canards, ring), grades map to
  numbers: body → damage multiplier, boost → power and drain, grip → damping,
  ceiling and yaw, weight → top speed up / accel down and shove strength.
- **Track** (`src/track.js`): closed Catmull-Rom resampled at 3.5 m; normal
  parallel-transported around the loop, authored roll for the twist, automatic
  banking from curvature. Features authored as (control index, fraction):
  dash plates, recharge, jump gap, jump plate, mines, dirt patches, tunnel,
  per-side rail-less stretches (the back straight, and the outside of Harbour
  Sweep). Section radii after smoothing: Skyline 163 m, Twist/Halfpipe 130 m,
  Chicane 61 m, Hairpin 89 m, Harbour 285 m.
- **Presentation**: speed lines, FOV that opens with speed and boost, sparks on
  rails, explosions, damage flash, low-energy pulse and alarm, whoosh on passes,
  per-machine engine pitch, corner holograms, a browser-speech announcer
  (3-2-1-GO, boost power, final lap, K.O., finish, new record).
- **Music**: CC0 from OpenGameArt (`audio/CREDITS.txt`): Midnight Drive
  (congusbongus) and Space City (MintoDog) alternate as race themes, Vintage
  Menu (iamoneabe) on the title and intro.

## Verification seam

`?bot=1[&diff=expert]` runs an autopilot (apex line, stopping-distance
braking, drift when the grip ceiling asks for it, boost on straights, spin and
side attacks when a rival is in range). In the console:

```js
__mc.start('gp', 'standard'); __mc.fast(220); __mc.snap()
__mc.start('ta'); __mc.fast(200); __mc.snap()
```

Last run: Time Attack 65 / 61 / 62 s, no wall hits. Grand Prix (Blue Falcon):
4th on Novice, 21st on Standard, 27th on Expert, 1–3 K.O.s, no deaths. The dev
server accepts `POST /shot?name=x` with a data-URL JPEG (`tools/shots/`).
