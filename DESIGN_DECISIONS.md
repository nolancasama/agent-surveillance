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
