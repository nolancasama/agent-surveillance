# Current State

## Status
The Agent Surveillance MVP is implemented end to end: briefing, deterministic 210-second market surveillance, telephoto controls, ten-slot photo evidence ledger with refill, neutral photo review, spoken NAME / LIKES / CAN deduction with picture fallback, and mission report.

The HUD includes Lily's dossier and a single MARK TARGET / TAKE PHOTO action. Students must identify Lily manually before taking photos. Wrong marks are free, and rescue hints name only her current route area. After identification, TARGET IN VIEW reflects framing and building visibility, independently of evidence events.

The automatic Field Notebook records only photographed, visible Lily activities, with one entry per activity and references to ledger photos. N or FIELD NOTEBOOK opens a paused notebook during surveillance; it is also available read-only during review and deduction. A version 1 JSON mission export is ready for future Agent Briefing integration.

Graphics: every other character uses the shared rounded procedural rig (slice A); the market has the slice B shops, props, instanced trees, warm lighting and contact shadows. The worker pedestrian (`lawn_walker`) is the CC0 Quaternius Worker (`public/assets/npc-worker.glb`, `character-assets/npc/worker/convert-worker.mjs`).

## Lily (2026-10-19)
- Body: child-proportioned CC0 Quaternius character, `public/assets/lily-child.glb`, driven by `src/scene/lilyBody.js` (authored Walk/Run/Idle; IK retargeting for bike, sitting, bending and held props). Procedural Lily remains the load-failure fallback.
- Polished model: smooth shading, hands x0.8, shoes 0.8 long, continuous backpack straps, level skirt waistband over the shirt, rounder skirt hem, and an anime face matched to `public/assets/lily.png`: almond eyes, soft arched brows, a tiny wedge nose with a side shadow, an open smile and soft blush. 7,918 triangles (was 7,262), one material, 0.55 MB (was 1.12 MB).
- Pipeline (see `character-assets/lily-quaternius/README.md`): `lily_q.blend` (editable, already polished) -> `scripts/build_lily_game.py` -> `lily_q_game.blend` + `lily-child.glb`. `scripts/polish_lily.py` documents and reproduces the polish from the pre-polish commit; it refuses to run twice.
- Staging: stops sit beside props, not inside them; Lily faces where she walks and turns smoothly; she faces what she is doing (side-on smelling, face to face with the shopkeeper, who turns to her, sitting on her own cafe chair and a camera-facing bench, watering from behind the bed). Her bike, ridden and parked, is child-sized (0.8). Segment durations, event windows and event IDs are unchanged.
- Renders: `character-assets/lily-quaternius/renders/` (turnaround, close-ups, walk frames and video), `renders/polish/` (before/after), `renders/in-game/` (every action and the wide/medium/high zoom levels).

## Verification (2026-10-19)
`npm test` 42/42 (new route clearance, facing and no-slide tests), `npm run build`, `npm run check:lily`, `npm run test:e2e`. Capture pass `.shots/lily-polish-final/` (local): no page errors or warnings; smell, buy, water and ride photos score, push stays weak; forced 404 shows the procedural fallback with one warning. Wide view 227 calls / 168,078 triangles (was 228 / 167,314). An in-game montage of the main activities is at `.shots/lily-in-game.mp4` (local); to remake it, run `node .shots/record-lily-video.cjs`, then `blender -b --factory-startup --python .shots/encode-frames.py -- .shots/lily-video .shots/lily-in-game.mp4 12`.

## Next Steps
1. User reviews the polished Lily and the new staging in the running game.
2. Decide whether to drop the stashed, unreviewed v2 rig work (`git stash drop`, "codex lily-v2 rig work").
3. Chromebook frame-rate check remains outstanding.
4. Optional: rebalance segment durations so the run-paced legs walk (needs a decision; it moves event windows).

## Run
- `npm run dev` - local development server
- `npm test` - unit tests (ledger, route timing/clearance/facing, target selection/visibility, notebook/export, Lily body, answer evaluation)
- `npm run build` - production build in `dist/`
- `npm run test:e2e` - Playwright acceptance test against an existing `dist/` build (PowerShell: `$env:NODE_PATH='C:/Users/nolan/recipe-tester/node_modules'`)
- `npm run check:lily` - GLB skeleton, clips and budget check
- In-game review captures: `LILY_PASS=<name> node .shots/capture-lily-polish.cjs` with the same NODE_PATH (local, git-ignored)

## Known gaps
- Fixed segment durations make three legs run-paced (about 2.5-3 units/s): cafe to BOOKS/BLOOM, BLOOM to the bench, and bench to ROBOTS. ROBOTS is looked at from the middle of the square, because its window is out of reach in that segment.
- Riding seen from behind: the back of the skirt fans over the saddle (no clipping).
- Hair is smooth-shaded but still strand-blocky up close; subdividing it would cost about 5,400 triangles.
- Ambient NPCs still snap their heading at corners; only Lily's turns are smoothed.
- No Agent Briefing import UI or external integration; `exportMission(ledger, notebook)` supplies the JSON boundary.
- Browser speech recognition and microphone permissions vary by device; unsupported speech uses the three-choice fallback.
- The production build emits Vite's advisory that the three.js bundle exceeds 500 kB uncompressed.

## Test hooks
Only `?test` exposes `window.__surv`: state, route, camera, shutter, finish, ledger and speech hooks, plus `markTarget()`, `aimAtPerson(id, zoom)`, `people()`, `identified()`, `notebook()` and `exportMission()`. `shoot()` always rejects before identification. `state().paused` and `state().time` expose notebook pause behaviour.
