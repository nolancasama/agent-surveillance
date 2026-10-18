# Current State

## Status
The Agent Surveillance MVP is implemented end to end: briefing, deterministic 210-second market surveillance, telephoto controls, ten-slot photo evidence ledger with refill, neutral photo review, spoken NAME / LIKES / CAN deduction with picture fallback, and mission report.

The HUD now includes Lily's responsive target dossier and a single MARK TARGET / TAKE PHOTO action. Students must identify Lily manually before taking photos. Wrong marks are free, and identification rescue hints name only her current route area. After identification, TARGET IN VIEW reflects framing and building visibility, independently of evidence events.

The automatic Field Notebook records only photographed, visible Lily activities, including filler activities, with one entry per activity and references to ledger photos. N or FIELD NOTEBOOK opens a paused notebook during surveillance; it is also available read-only during review and deduction. Shared evidence configuration supplies private category/strength metadata. The ledger still determines scoring, limits and refill. A version 1 JSON mission export is ready for future Agent Briefing integration.

Graphics slice A (2026-10-18) gives Lily, all 12 deterministic background NPCs and the BLOOM shopkeeper one shared rounded cartoon rig with connected elbows/knees, expressive faces, varied hair and clothes, and blended poses. Lily keeps the dossier colours and accessories; the yellow-shirt, long-hair and scooter decoys remain distinct. Walking plants feet; hands meet bike/scooter bars; riding legs follow rotating pedals; buying shows money followed by flowers; watering uses a held, tilted can and a sustained nozzle-to-soil stream. Vehicles and hand props are procedural merged geometry. Environment geometry, lighting, route sampling, event/activity IDs and mission flow are unchanged.

Before phase 2B, procedural Lily used 13 visible body meshes normally and 20 with her bicycle/basket flowers. Slice A matched wide-view render counts changed from 496 calls / 17,820 triangles to 443 / 72,068; Lily close-up from 121 / 4,406 to 110 / 11,886. Extra triangles provide rounded silhouettes and detail; merged assemblies reduce draw calls. The pixel-ratio cap remains 1.5. Shared photo/identity projection uses measured neutral height 2.09 and torso centre 1.24, preserving every evidence and marking threshold.

The shutter remains disabled until the revealed scene has rendered a full-opacity frame. Test-only controls remain exposed as `window.__surv` only when the URL includes `?test`.

Graphics slice B (2026-10-18) adds varied shop roofs, framed recessed windows and doors, scalloped striped awnings, readable canvas signs and individual shop displays. The environment now has instanced layered trees, petalled flowers with leaves, café umbrellas/chairs, slatted benches with armrests, a tiered fountain, upright bike hoops, patterned paving, path edging, lamps, planters and bins. Shop body dimensions/positions and all eight building-only visibility occluders are preserved; the fountain retains its previous upper height for the bike lap. Lily's watering stream is brighter, thicker and continuous while pouring, and the long-hair decoy walks with a symmetric skirt centred on her hips.

Warm hemisphere/directional lighting, explicit sRGB output with NoToneMapping, a sky gradient and distance fog preserve Lily's distinctive palette. Opaque instanced radial contact shadows and baked building-base shading use no shadow map or post-processing. Static details are merged by landmark; trees and skyline roofs are instanced. Slice B matched counts: wide **443 -> 241 draw calls, 72,068 -> 162,936 triangles**; Lily close-up **110 -> 47 calls, 11,886 -> 67,068 triangles**. Both wide-view budgets are met; pixel ratio remains capped at 1.5. Close-up triangle counts reflect larger merged assemblies surviving culling.

Lily 3D redesign, phase 2A correction (2026-10-18): the approved phase 1 source `character-assets/lily/lily.blend` and its renders are unchanged. The rebuilt `character-assets/lily/lily_game.blend` and `public/assets/lily.glb` have snug, sloping sleeves, a slightly raised skirt hem, thigh-following front pleats and a rounded hanging rear in the seated pose. Export: 11,298 triangles, three materials/draw primitives, about 0.46 MiB, height 2.090, exactly 15 frozen joints with identity GLB rest rotations and at most three normalized influences per vertex. Build instructions and regenerated QA report are in `character-assets/lily/scripts/`; all seven previews, including `seated_pedalling_front.png`, are in `character-assets/lily/renders/game/` for Claude's visual acceptance. The documented Blender build and asset checker pass.

Lily phase 2B (2026-10-18) now renders that GLB in-game as three Lambert skinned primitives. The complete procedural rig still drives every pose and prop; its 13 body meshes are hidden after a successful load. All 15 bone quaternions and pelvis/body/head translations copy after the final IK/blend each frame. The model inherits the person group's scale, and the existing contact shadow follows that group. GLTFLoader preloads during briefing; BEGIN waits for success or a one-warning procedural fallback before revealing surveillance. Vertex colours and the sRGB face texture remain; the dedicated matte hair material receives #241a12 at conversion because its exported vertex colours and base factor are white. The asset itself is unchanged. All NPCs/decoys/shopkeeper, gameplay/evidence constants, routes and test hooks retain their existing behavior.

Phase 2B matched renderer counts versus slice B: wide **241 -> 231 calls / 162,936 -> 169,462 triangles**; Lily close-up **47 -> 37 calls / 67,068 -> 73,642 triangles**. The wide view remains within the existing budgets. `npm test` passes 30/30, `npm run build` passes with the existing bundle-size advisory, and `npm run check:lily` passes. `.shots/lily-b-after/` contains 34 matched/pose captures and `metrics.json`, including walking, smelling, money/flowers trade phases, held-can watering/stream, phone, seven bike-lap phases and the wide view. Delayed loading preserves briefing until the body is ready; a forced 404 reveals the procedural fallback with one warning and no page errors. Per-pose audits cover bone copying, props, scale, contact placement and the 13 other procedural people. Normal-load browser page errors: none.

## Run

- `npm run dev` — local development server
- `npm test` — unit tests for the ledger, route/activity coverage, target selection/visibility, notebook/export, and factual answer evaluation
- `npm run build` — production build in `dist/`
- `npm run test:e2e` — Playwright acceptance test against an existing `dist/` build; screenshots go to `.shots/`

## Known gaps

- The prior procedural Lily skirt/thigh clipping is no longer apparent in the phase 2B sampled bike phases, including t=160 and t=162. Claude's final aesthetic review of the integrated model and Chromebook frame-rate measurement remain pending.

- Slice B verification passed: `npm test` (27/27) and `npm run build`. All 23 requested matched views and renderer metrics are in `.shots/gfx-b-before/` and `.shots/gfx-b-after/`; extra after frames show sustained watering, backpack/phone and the bike lap. `.shots/capture-gfx-b.cjs` repeats the captures against dist with the supplied Playwright NODE_PATH and SwiftShader. Focused photo checks recognise smell/buy/water/ride and retain weak pushing; the audit confirms eight real-building occluders. Browser page errors: none. No full e2e/smoke/browser suite was run for this slice. Claude's final aesthetic review and Chromebook frame-rate measurement remain pending.

- No Agent Briefing import UI or external integration is included; `exportMission(ledger, notebook)` supplies the pure JSON-serialisable boundary.
- Graphics slice A verification passed: `npm test` (27 tests), `npm run build`, and `npm run test:e2e` using `NODE_PATH=C:/Users/nolan/recipe-tester/node_modules`. The e2e run includes identification, evidence thumbnails, notebook pause/notes, deduction and report screenshots. Matched baseline/after captures, exact camera/time setups and renderer metrics are saved in `.shots/gfx-before/` and `.shots/gfx-after/`; extra after frames cover phone, talk, walking/backpack, watering phases and pedalling. `.shots/capture-gfx.cjs` repeats the screenshot pass with SwiftShader. Browser errors: none. Final aesthetic review by Claude and Chromebook frame-rate measurement remain pending.

- Browser speech recognition and microphone permissions vary by device. Unsupported or unverified speech intentionally uses the required three-choice fallback.
- The production build emits Vite's advisory warning that the single three.js bundle exceeds 500 kB uncompressed; it builds successfully and adds no runtime dependencies.

## Test hooks

Only `?test` exposes `window.__surv`. Existing state, route, camera, shutter, finish, ledger and speech hooks remain. New hooks: `markTarget()` (deterministic cooldown bypass), `aimAtPerson(id, zoom)`, `people()` (IDs including Lily, 12 ambient NPCs and BLOOM shopkeeper), `identified()`, `notebook()` (entry snapshots), and `exportMission()` (versioned JSON data). `shoot()` always rejects before identification. `state().paused` and `state().time` expose notebook pause behavior.
