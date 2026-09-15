# MUTE CITY — Twist Road (vertical slice)

A one-track, three-lap anti-gravity racer in the spirit of F-Zero GX's Mute City:
30 machines, a 360° twist, a banked halfpipe, a jump gap, energy that doubles as
health, boost that spends it, dash plates and a pit-lane recharge strip. Vanilla
ES modules + a vendored `three.module.js`, no build step.

## Run

```bash
node serve.mjs
```

Open http://localhost:5875 (root `.claude/launch.json` has a `mute-city` entry).
Deploy is a static folder: `vercel deploy --prod --yes`. GitHub: draphael123/mute-city.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | ↑ / W | A / right trigger |
| Steer | ← → / A D | left stick |
| Slide turn (tighter, bleeds speed) | Shift, Q, E | LB / RB |
| Boost (lap 2+, costs 15 energy) | Space / X | X / Y |
| Brake | ↓ / S | B / left trigger |
| Start / restart | Enter / R | Start |
| Pause | Esc / P | Start |
| Settings (title or pause) | S | — |

Pressing Enter on the title plays an opening flyover (grid, the Twist, the
Halfpipe, the Dive, back to the grid); any key skips it, and it can be turned
off in Settings. Settings persist in `localStorage` (`mc-settings`): music and
SFX volume, steering sensitivity, near/far camera, camera shake, render quality,
km/h or mph, minimap, opening flyover.

## Music

CC0 tracks from OpenGameArt, credits in `audio/CREDITS.txt`: *Midnight Drive*
(congusbongus) and *Space City* (MintoDog) alternate as race themes, *Vintage
Menu* (iamoneabe) plays on the title and intro. Transcoded to MP3 for the web.

## The track (7.36 km, ~60 s laps)

Start straight with the recharge strip → **Skyline Bend** (wide, banked) →
**The Twist** (full 360° roll while climbing) → **Halfpipe** (long banked left) →
**The Dive** (drop into a 48 m jump gap; below ~70 m/s you fall) → **Chicane**
(banked S, the slow corner) → **Harbour Sweep** → the rail-less back straight →
**Hairpin** → home.

## How it is built

- `src/track.js` — control points are `[x, z, y, extraRoll, halfWidth]`. The
  closed Catmull-Rom is resampled at 3.5 m; the normal is parallel-transported
  round the loop (holonomy spread evenly so it closes), then authored roll plus
  automatic banking (`-k * 110`, capped 0.72 rad) is applied. Everything moving
  lives in track space `(s, u, n)`; `toWorld()` maps back. Features (pads,
  recharge, gap, no-rail range, arches, corner names) are authored as
  `(control index, fraction)`.
- `src/game.js` — player physics: the road turns under a machine that keeps its
  world heading (`h -= v·k·dt`), so bends need steering and tight ones need the
  slide turn or brakes. Walls cost energy by impact speed; the no-rail straight
  drops you if you go 3.5 m over the edge. Rivals run on rails (lane + corner
  speed from curvature, apex bias, boost on straights from lap 2, pads). Contact
  is a rate-limited shove.
- `src/world.js` — sky shader, star field, ringed planet, ground grid, ~1700
  instanced towers kept out of a 42 m corridor and below the road within 95 m,
  billboards every 330 m, holographic corner names, distant traffic.
- `src/machine.js` — lathe hull + pods + fins; flames and boost cones scale
  with thrust.
- `src/audio.js` — synthesised engine, wind, boost, hits, pads, countdown.
- `src/music.js` — streamed, looped HTMLAudio soundtrack with crossfade + duck.
- `src/menus.js` — persisted settings and the pause menu (keyboard, mouse, pad).

## Verification seam

`?bot=1` runs an autopilot (curvature feed-forward, apex line, brakes for the
chicane and hairpin, boosts on straights). In the console:

```js
__mc.start(); __mc.fast(200); __mc.snap()
```

`fast(seconds)` steps the sim without rendering. Last run: bot laps 65 / 60 /
60 s, finished 3rd of 30, rival best laps 59–67 s, no hits, no falls. The dev
server accepts `POST /shot?name=x` with a data-URL JPEG (`tools/shots/`).
