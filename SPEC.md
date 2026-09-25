# Agent Surveillance — MVP spec (frozen 2026-09-25)

One playable 3D surveillance mission for elementary ESL students:

**find the mark → observe → photograph evidence → deduce LIKE + CAN → report in English**

This is a new program, a sibling of `../agent-briefing`. It reuses that game's character data,
speech evaluation, recorder and SFX by *copy* (`src/shared/`, unchanged except for an ES export
line) and its navy / amber / cyan visual language (tokens below). It does not modify
Agent Briefing.

Out of scope (do not build): drones, microphones, player movement, repositioning, combat,
suspicion meters, multiple maps or marks, personality deduction, store interiors.

## Stack

Vite 5 + three 0.180 (already installed), plain ES modules, no framework, no other runtime
dependencies. `npm run dev` / `npm run build` / `npm test` (node --test on `src/**/*.test.js`) /
`npm run test:e2e` (Playwright, resolved from the parent `recipe-tester/node_modules`).
Target: school Chromebooks. Low-poly primitives only, shared geometries and materials,
`MeshLambertMaterial` or `MeshToonMaterial`, one directional light + hemisphere light, a single
small shadow map at most (or none), `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`.

## The mark

**Lily** (`DATA.CHARACTERS` id `lily`, she): likes **flowers**, can **ride a bike**.
Chosen over Ben because swimming cannot be shown in a market square; riding a bike is the
most readable CAN at long range, and pushing a bike gives a natural *weak* decoy.

Look (must be identifiable at medium zoom): yellow shirt `#f4c518`, long dark hair `#241a12`,
blue skirt, small red hair ribbon, green backpack. The briefing tells the player this
description and shows `public/assets/lily.png`.

Decoys (surface similarity only; the mark stays identifiable):
- NPC in a yellow shirt with short hair and grey trousers.
- NPC with long dark hair, orange top, blue skirt.
- One other NPC rides a scooter (not a bike) along the lawn path.

## Map (world units ≈ metres, −z is "away from the player")

- **Market square**: paved, x −22..22, z −20..20, centre fountain at (0, 0). Flowerbed planter
  at (−8, 6). Bike rack at (15, 12). Café tables near (−14, −12). Benches at (6, 8) and (−3, −9).
- **Shops** (façade boxes with coloured awnings, windows, door, a readable sign texture drawn
  on a canvas) on three sides; south side (z = +20) open towards the player.
  - North row (z ≈ −24): CAFÉ, BOOKS, **BLOOM** (flower shop, with buckets of flowers outside
    at about (4, −19)), SPORTS.
  - West row (x ≈ −26): ROBOTS (electronics), MUSIC.
  - East row (x ≈ 26): ART, BAKERY.
- **Lawn**: z 20..58, quiet: a path, 5–7 trees, 2 benches, 1–3 pedestrians.
- **Vantage point**: the player's camera sits at (0, 16, 78) on the upper floor of a building.
  A foreground window frame / balcony railing mesh sits at the bottom edge of the wide view to sell
  "upper floor". The camera cannot move, only rotate and zoom.

## Camera (src/camera/)

- Yaw clamp about ±38° around the square's centre, pitch clamp about −25°..+5°.
- Zoom = FOV from 50° (wide) to 3.5° (max) on a log scale; 1× to ≈14× displayed.
  Wheel, `+`/`-`/`=` keys, an on-screen zoom slider, and `Q`/`E`. Smoothly damped.
- Pan: pointer drag (mouse and touchpad click-drag) and arrow keys / WASD. Drag sensitivity
  scales with FOV so that one screen-width of drag moves about one field of view. Soft damping,
  **no** shake, **no** focus mechanic, **no** sway.
- Take photo: `Space`, or the on-screen shutter button. `Esc` = pause menu (resume / finish surveillance).
- HUD: subtle reticle (thin corner brackets + centre dot), zoom readout (`4.2×`), photo count
  `PHOTOS 7 / 10`, a small objective line (`Observe LILY. Photograph useful evidence.`), and a
  `FINISH SURVEILLANCE` button. Letterbox bars and a faint vignette for a cinematic feel; no
  Call of Duty imitation.

## Mark behaviour loop (src/sim/markRoute.js)

A pure, deterministic schedule: `poseAt(t)` returns the mark's position, heading, animation
state, props held and the active `eventId` (or null) for loop time `t`
(`t mod LOOP_SECONDS`). Loop length about **210 s**. It must not look like a short reset. Walk speed
about 1.3 m/s. The route is data (an array of segments), not code branches.

| # | Segment | Where | ~s | eventId |
|---|---|---|---|---|
| 1 | Walk from the bike rack to the café | → (−14, −12) | travel | – |
| 2 | Sit at a café table, look at phone | café | 16 | – (filler) |
| 3 | Talk with a friend NPC (gestures) | café | 12 | – (filler) |
| 4 | Walk to the BOOKS window and browse | north | 10 | – (filler) |
| 5 | **Smell the flowers** in the buckets outside BLOOM (bend down, lean in, pause, straighten) | (4, −19) | 9 | `smell_flowers` (LIKE) |
| 6 | Wait and wave to someone | near BLOOM | 6 | – |
| 7 | **Buy flowers**: face the shopkeeper NPC, hand over money, receive a bright bouquet and hold it up | BLOOM door | 9 | `buy_flowers` (LIKE) |
| 8 | Walk carrying the bouquet, sit on a bench | (6, 8) | 12 | – (holding a bouquet is weak) |
| 9 | Walk to the ROBOTS window and look | west | 8 | – (filler) |
| 10 | **Water the flowerbed**: take a watering can from the planter edge, tilt it, a water particle stream falls, then put it down | (−8, 6) | 10 | `water_flowers` (LIKE) |
| 11 | Walk to the bike rack and put the bouquet in the bike basket | (15, 12) | travel | – |
| 12 | Push the bike a few metres (walking beside it) | rack → (12, 16) | 6 | `push_bike` (**weak**, never counts) |
| 13 | **Ride the bike**: mount, pedal a full lap around the square's inner edge / fountain, legs cycling, wheels spinning | lap | 16 | `ride_bike` (CAN) |
| 14 | Dismount, lock the bike in the rack, tie shoe / check phone | rack | 10 | – (filler) |
| 15 | Walk to the MUSIC window, then slowly towards the café (loop wraps to #1) | west → café | travel | – |

The bouquet disappears into the bike basket at #11 and reappears in her hands at #7 each loop.
Evidence segments are staged to face roughly towards the player so the action reads.

## NPCs (src/sim/ambient.js, src/scene/people.js)

12 background NPCs + the mark + the BLOOM shopkeeper + the café friend (the friend is one of the
12). Behaviours: wander between waypoints, sit on benches, talk in pairs, look at phones, carry
shopping bags, stand at windows, enter/exit shop doors (fade or step through the doorway). Each
NPC runs its own simple looped route with randomised offsets from a seeded RNG, so the scene is
reproducible. People are built from shared box/cylinder/sphere geometries (head, torso, legs,
arms, hair variants) with a per-colour material cache; procedural limb animation (walk swing,
sit, arm gesture, bend, pedal).

## Photo + evidence rules (src/evidence/)

- `evidence.js`: a **pure** ledger, no three.js, fully unit-tested.
  - `createLedger({ slots: 10, likeEvents: ['smell_flowers','buy_flowers','water_flowers'], canEvents: ['ride_bike'] })`
  - `capture({ eventId|null, thumbnail })` uses a slot, stores the photo, returns `{ ok, remaining }`.
    A photo with `eventId` null or a weak event is still stored (it's a photo) but counts for
    nothing.
  - Distinct counting: each LIKE eventId counts once no matter how many photos show it.
  - `status()` → `{ likeCount, likeNeeded: 3, canDone, complete, remaining, photos }`.
  - Out of film while incomplete: `refill(5)` is available once HQ sends new film (see below). Nobody fails
    for one wasted shot.
- `judgePhoto(camera, markState)` (in `photo.js`): a photo shows the event only if **all** hold:
  the mark's `eventId` is non-null and not weak; the mark's torso projects inside the central
  70 % of the frame; the mark's projected height is ≥ 15 % of the viewport height (i.e. zoomed
  in, roughly ≥ 5×); a raycast from the camera to the mark's chest is not blocked by a building.
  Otherwise the photo's `eventId` is null.
- Shutter: a white flash + top/bottom shutter blades animation (≈150 ms), shutter SFX
  (synthesised with `Sfx`'s tone/noise style: a short click + mechanical noise burst), a
  `PHOTO SAVED` toast, and the thumbnail flies into a small film strip in the corner. The shutter button cools down for 0.6 s.
- Thumbnail: a genuine snapshot. Render the frame, immediately `canvas.toDataURL` via a
  downscaled 2D canvas (≈320×180 JPEG). Never show which event a photo contains.

## Hints and validation

- Opening hint only (auto-hides after 6 s): *"Watch the mark carefully. Take photos of useful
  evidence."* Nothing else ever says to take a photo now. There are no glowing markers.
- `FINISH SURVEILLANCE` with incomplete evidence → HQ radio line *"We need more evidence."*
  and play continues. It never says which evidence is missing at this point.
- After the mark has completed **one full loop** since mission start with evidence still
  missing, HQ may give one gentle location hint per missing requirement, e.g. *"Watch the
  area near the bike rack."* (CAN) or *"Keep an eye on the north shops."* / *"Watch the
  flowerbed."* (LIKE). Never name the activity. At most one hint per ~60 s.
- Out of film with incomplete evidence → *"HQ: New film is on the way."* then +5 photos.
- When evidence is complete the player may still keep watching; the FINISH button always
  works once complete. Running out of film when complete → go straight to review.

## Evidence review → deduction → report (src/ui/)

1. **Evidence review**: grid of the captured photos labelled only `PHOTO 1`, `PHOTO 2`, … Click
   one to enlarge. Button `REPORT TO HQ`.
2. **Deduction**: three questions, reusing the Agent Briefing L1 grammar-pack steps
   (`DATA.GRAMMAR_PACKS` L1: NAME, LIKES, CAN; PERSONALITY is skipped). The photo grid stays
   visible as a small strip. For each step the commander asks the `radio` line
   (*"What does she like?"*) and shows only the frame (`She likes ______.`), **never the answer
   and never the fact icon**. The student records with `Recorder` (MediaRecorder + speech
   recognition, auto-stop via `Evaluate.looksComplete`), and the clip is judged with
   `Evaluate.evaluateClip({ fact, frame }, stt)`:
   - `confirmed` → accepted (stamp *CONFIRMED*, `Sfx.stamp`), next question.
   - `mismatch` → rejected: *"That doesn't match our photos. Look at the evidence again."*,
     retry.
   - `partial` → *"Almost. Say the whole sentence."*, retry.
   - `unverified` (no SpeechRecognition, no mic, or nothing heard) → show a 3-choice picture
     fallback (correct fact + two distractors taken from other characters' facts of the same
     type, icons from `DATA`). A wrong choice → same rejection line; right → accepted. The
     same fallback also appears after two failed spoken attempts, so no child gets stuck.
   Recognition gates *factual correctness* here, unlike Agent Briefing, because the whole
   point of this mode is the deduction. Recorded as a design decision.
3. **Mission report**: all three facts revealed with icons, photos annotated only now
   (event photos get a small ✓), photos used / evidence found, time, and a PLAY AGAIN button.

## Visual language

Reuse Agent Briefing's tokens: `--bg #07111f`, `--panel #10263d`, `--ink #f4ead5`,
`--ink-dim #a8bbca`, `--amber #ffbd3f`, `--cyan #37b7d8`, `--green #3eaf72`, `--red #d94a52`,
`--manila #ead9ad`. The HUD is thin cyan lines on glass. The 3D market is colourful and clean
(warm stone paving, saturated awnings, green lawn, soft late-afternoon light, light fog for depth).

## Test hooks

`window.__surv` is exposed only when the URL has `?test`: `{ state(), setTime(t), markState(),
aimAtMark(zoom), shoot(), finish(), ledger(), stubSpeech(transcript|null), screen() }`,
so the e2e test can drive the mission deterministically without real speech.
