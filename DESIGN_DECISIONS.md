# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-09-25 — Surveillance MVP as a separate program
- Built as a new sibling project rather than a mode inside `agent-briefing`; shared modules (data, evaluate, recorder, sfx) are copied into `src/shared/` with only an ES export added. Why: the user asked for a brand-new program, and Agent Briefing is a no-build classic-script app while this needs three.js + Vite. Rejected: importing across `../agent-briefing` (breaks standalone builds).
- Mark is Lily (likes flowers, can ride a bike), not Ben: swimming cannot be staged in a market square; a bike is the most readable CAN at range, and pushing a bike is a natural weak-evidence decoy.
- Deduction gates on factual correctness (mismatch → retry), unlike Agent Briefing where recognition never gates. When speech cannot be verified, a 3-choice picture fallback keeps the check factual without trapping the child. Why: deduction is the point of this mode.
- Out of film with incomplete evidence → HQ sends 5 more photos; no fail state.

## 2026-09-25 — Deterministic scene and evidence boundaries
- The 210-second mark route and the 12 ambient NPC loops are pure data samplers, while three.js objects only consume their returned poses. Why: unit tests and `?test` automation can select exact evidence moments without depending on animation frames or wall-clock timing.
- The photo ledger stores the judged event ID privately alongside each real thumbnail. Review receives the photos but renders only neutral `PHOTO n` labels; the report is the first screen allowed to interpret and mark evidence.
- The BLOOM shopkeeper is a separate stationary character in addition to the 12 background loops. The café friend remains one of those 12, matching the population rule in the frozen spec.
- The copied recorder now imports `Sfx` as an ES module. The original classic-script copy relied on a browser global, which is unavailable in the Vite module graph.

## 2026-09-25 - Surveillance readability corrections
- Character local `+z` is the canonical forward/face direction. Faces are explicit skin-and-feature geometry on that side; long hair occupies only the top, back, and sides. Evidence poses use this convention to present Lily toward the player.
- The bike evidence lap uses the open ring around the fountain and preserves its original 16-second evidence window. Why: the former perimeter route crossed the cafe furniture and weakened the action's readability.
- The distant scene uses one extended ground mesh and one instanced low-building skyline. Why: the wide camera needs a continuous horizon while keeping the backdrop to two additional draw calls.
- Shutter availability is gated on a full-opacity surveillance frame having rendered. The test harness waits on the same readiness state and rejects thumbnails whose luminance mean and variance indicate a blank/dark capture.

## 2026-10-18 - Identify first, describe photographed activities
- The primary action morphs from MARK TARGET to TAKE PHOTO after the student correctly identifies Lily using the dossier. Wrong marks cost no film. Rejected: a separate disabled shutter, which adds a second action before the student can use it.
- The subtle TARGET IN VIEW state checks identity visibility only, using the same framing, size and building occlusion rules as photography. Rejected: an event-aware indicator, which would reveal evidence moments. The visibility check runs at most ten times per second.
- Filler activities create notebook entries too. A note describes what Lily is doing in a photograph; its existence must not reveal evidence strength. Frozen present-progressive sentences avoid supplying the LIKE or CAN deduction answers.
- The evidence ledger remains the scoring source. Notebook entries deduplicate by activity and store ledger photo IDs rather than copying thumbnails. Like/can/weak classification comes from shared evidence configuration and is never rendered in surveillance, review or the notebook.
- The Field Notebook pauses surveillance and mission time, and remains available read-only during review and deduction. New-note toasts do not pause or intercept input.
- Agent Briefing integration uses a versioned JSON export: `{ version: 1, mission: 'surveillance-market', targetId: 'lily', elapsedSeconds, photos: [{ id, thumbnail, missionTime }], observations: [...] }`. Observation metadata stays separate from the neutral photo list; no integration with the sibling repository is included.

## 2026-10-18 - Graphics slice A: shared articulated cartoon people
- Every person now uses the same rounded, tapered procedural rig: a hip pivot, bending upper body, separate elbow/knee chains, level hands and shoes, and a larger expressive head. Local `+z` remains forward for faces, vehicles and props. Lily retains her exact yellow/dark-hair palette, blue skirt, red bow and green backpack; decoys retain their distinguishing clothes and mobility. Bob, long, ponytail, short, curly and cap silhouettes and separate jacket/shorts parts share the rig. Skirts switch to a cached draped front hem for walking, sitting and riding so bent thighs stay covered without another mesh.
- Face features, hair and fixed clothing details are merged into cached vertex-colour geometry. The material cache remains shared; merged assemblies share one Lambert material. Lily has 13 visible meshes in a neutral pose and 20 including the bicycle and basket flowers. Water droplets use one InstancedMesh. This keeps articulation within the approximately 25-mesh budget without making every eye, joint, petal or spoke another draw call.
- Joint motion blends over ordinary consecutive frames and resolves directly on absolute time seeks. Two-bone IK connects shoulders/elbows/hands and hips/knees/feet, plants walking feet, meets the handlebars, and follows rotating bicycle pedals. Prop visibility and trade phases consume the existing sampled progress/props; the shopkeeper reaches to exchange money and flowers. The can's stream starts at its transformed nozzle, falls vertically and ends at soil height. Simulation schedules, coordinates, event/activity IDs, camera hooks, evidence thresholds and mission flow are unchanged.
- Projection now uses the measured neutral Lily top of `2.09` above ground and torso centre `1.24`. This checkout previously used `2.1` / `1.2` in the shared visibility helper (rather than the older dimensions cited in the brief). Photo judging and target identification both use that helper; only geometry dimensions changed, with central 70%, minimum 15% height, building raycasts and marking thresholds preserved. The neutral shoe sole is within .006 units of the ground. A focused regression verifies the silhouette, shared head geometry, handlebar contact and a complete pedal cycle.
- The redesigned bike, scooter, bouquet and can are cached procedural assemblies. Bike static frame/rims/spokes/basket details are merged, with separate rotating wheels/crank and level pedals. The can is authored at its handle grip, so its existing parked placement is adjusted in main.js; no environment geometry or lighting is changed.
- At identical 1440x900 camera/time setups, renderer.info reports wide: **496 -> 443 calls**, **17,820 -> 72,068 triangles**; Lily close-up: **121 -> 110 calls**, **4,406 -> 11,886 triangles**. Extra triangles buy rounded silhouettes, facial detail, joined limbs and detailed vehicles, while merging reduces wide draw calls by 10.7%. Pixel ratio remains capped at 1.5. This is a geometry/draw-count comparison, not a Chromebook frame-rate benchmark.
- Built baseline captures precede code changes in `.shots/gfx-before/`; matched after captures and extra pose samples are in `.shots/gfx-after/`. Each directory includes `metrics.json` with camera setups, times and renderer counts. `.shots/capture-gfx.cjs` repeats the screenshot pass against dist with Playwright resolved through the supplied NODE_PATH and SwiftShader. Automated e2e also ran successfully. Implementation QA inspected close-ups, trade phases, watering, bicycle grip/pedal contact, scooter, decoys, phone and rear backpack views; final aesthetic judgment remains with Claude.

## 2026-10-18 - Graphics slice B: market architecture and afternoon atmosphere
- Shop bodies retain their original 9 x 7 x 6 dimensions, positions, rotations, identities and sign text. Gables, parapets, a BOOKS dormer, SPORTS tower, chimneys, projecting cornices, recessed framed panes, sills and panelled doors vary the silhouettes. Striped scalloped awnings and canvas signs share the rounded character style. Small displays establish each shop's identity; street furniture stays at the square edges. The visibility occluder list still contains exactly the eight real building bodies. The tiered fountain stays within the former 2.13-unit upper silhouette to preserve the rear bike-lap sightline.
- Keep explicit `SRGBColorSpace` output and `NoToneMapping` at exposure 1. The warm directional light and softer neutral hemisphere provide late-afternoon modelling without a filmic highlight shoulder washing out Lily's yellow #f4c518 shirt, red bow, blue skirt or green backpack. A canvas sky gradient and warm fog at 92–172 units soften the skyline while keeping nearby evidence colours distinct. No additional lights or post-processing passes are used.
- No shadow map: baked vertex-colour darkening grounds building bases, and one instanced set of radial canvas contact decals grounds people, trees and benches. Opaque MSAA alpha-to-coverage avoids transparent sorting; alpha hashing was rejected after screenshot QA showed conspicuous dark speckles. Water and windows also use opaque stylised surfaces. The pixel-ratio cap remains 1.5.
- Static details are merged into vertex-colour assemblies per shop/landmark. Layered tree assemblies and the skyline bodies/varied roofs are instanced; paving uses one small repeating canvas texture. Petals, contrasting centres and leaves make flowers legible at telephoto. Chairs/umbrellas, slatted benches, fountain tiers, upright bicycle hoops, edging, lamps, planters and bins add detail without individual draw calls for each piece. Budget: about 520 wide-view calls and under 200k triangles; measured at matched 1440 x 900 setups: wide **443 -> 241 calls / 72,068 -> 162,936 triangles**, Lily close-up **110 -> 47 calls / 11,886 -> 67,068 triangles**. Coarser landmark-level culling increases close-up triangles, while merging cuts draw calls. These counts are not a Chromebook frame-rate benchmark.
- Slice A's only rig changes are the thicker, bright unlit overlapping nozzle-to-soil stream (one instanced draw, continuous during the scheduled raised-can pour) and a symmetric walking hem for the long-dark-hair decoy. Lily's rig, simulation schedule, gameplay thresholds, camera hooks and UI remain unchanged.
- Extra lap frames expose pre-existing Lily skirt/thigh clipping at some pedal phases, also present in slice A's accepted `ride-three-quarter.png`. It is recorded in CURRENT_STATE rather than changing the rig beyond the two authorised fixes.
- Built baseline captures were taken before implementation in `.shots/gfx-b-before/`. `.shots/gfx-b-after/` repeats all 23 camera/time setups and adds watering phases, backpack/phone and seven bike-lap samples. Both directories record renderer metrics; `.shots/capture-gfx-b.cjs` reuses the baseline setup manifest with Playwright through `NODE_PATH=C:/Users/nolan/recipe-tester/node_modules` and SwiftShader. All five sampled photo checks retain the expected outcome, including pushing yielding no strong event. No browser page errors. `npm test` (27 tests) and `npm run build` pass; the existing bundle-size advisory remains. No full e2e/smoke/browser suite was run for slice B. Claude retains final aesthetic judgment.

## 2026-10-18 - Lily 3D redesign, phase 1 (Blender, visual only)
- Lily is being remodelled as a standalone stylised Blender character in `character-assets/lily/lily.blend`, with turnaround renders in `character-assets/lily/renders/`. The game's procedural three.js Lily in `src/scene/people.js` is deliberately unchanged until the model is approved.
- `public/assets/lily.png` is the primary reference, and the game palette is kept exactly: skin #f2c39c, shirt #f4c518, skirt #3972b7, hair #241a12, side ribbon #e74451, backpack #3eaf72. The model is authored at game scale (about 2.0 units tall, matching PERSON_HEIGHT 2.09 including hair). The bow sits on her +X side, matching the game's ribbon placement.
- The body is one continuous skin-modifier mesh, so limbs join smoothly instead of being overlapping primitives. The shirt is cut from the body surface with plane bisects for clean hems. The skirt is a lofted pleated A-line, and the hands are mittens with thumbs. Legs run into rounded shoes under rolled collars.
- The face is a painted texture (large brown eyes with highlights, thin brows, open smile, blush) projected onto a sculpted head, not modelled eye or mouth geometry. That keeps the expression clean, readable at game distance, and cheap.
- Hair is a cap plus about 40 procedural tapered, flattened locks: centre-parted bangs, face-framing locks in front of the shoulders, behind-ear locks, and a long back mass over a solid inner layer. Lock generation lives in the .blend text blocks `lily_hair_lib.py` and `lily_hair_build.py`, so the hair can be re-tuned and rebuilt.
- Renders use EEVEE with Standard view transform; AgX was rejected because it washed out the palette. The stage is a mostly self-lit cyclorama under three-point lighting, with camera and lights parented to `Stage_Pivot` so every view is lit the same way.
- No rig, animation, LOD or game export yet. Render-resolution triangle count is about 226k across 69 mesh objects, so a game version needs decimation/merging and a lower subdivision level before integration.
