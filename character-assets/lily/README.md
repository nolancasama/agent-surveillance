# Lily character asset

Lily, the mark in Agent Surveillance, remodelled in Blender as an original, anime-inspired stylised child. The art direction takes clean, expressive faces and readable silhouettes from Spy × Family-style character design, and soft, cohesive anime-to-3D shapes from Ni no Kuni. No existing character is copied. `public/assets/lily.png` is the identity reference.

## Files

| Path | What it is |
|---|---|
| `lily.blend` | Approved editable source model (phase 1). Not rigged. |
| `renders/lily_{front,three_quarter,side,back}.png`, `renders/lily_turnaround.png` | Approved phase 1 renders. |
| `renders/lily_face_closeup.png` | Face close-up of the approved model (`scripts/render_face_closeup.py`). |
| `lily_game.blend` | Rigged, reduced game version built from `lily.blend` (phase 2A). |
| `renders/game/` | Previews of the game version, neutral and in test poses. |
| `scripts/` | Reproducible build of the game version and GLB (see `scripts/README.md`). |

The game loads `public/assets/lily.glb`, which `npm run check:lily` verifies.

## Modelling approach

- **Identity kept:** yellow shirt, blue pleated skirt, long dark hair, small red ribbon on her +X side, green backpack. The colours match the game palette exactly.
- **Body:** one continuous skin-modifier mesh, so the neck, shoulders, elbows, hips and knees flow into each other instead of being separate capsules. The proportions are a moderately large head with natural child limbs, not chibi.
- **Clothing:** the shirt is cut from the body surface for clean hems. The skirt is a lofted, pleated A-line that clears the thighs. Rolled-collar shoes and mitten hands with thumbs stay small but readable.
- **Face:** a painted texture on a sculpted head: large, balanced brown eyes with highlights, thin brows, a dot nose, an open smile and soft blush. There is no protruding eye or mouth geometry, so the face stays clean and readable at surveillance zoom and costs almost nothing in real time.
- **Hair:** a sculpted cap plus about 40 procedurally generated tapered, flattened locks over a solid inner mass. That gives centre-parted bangs, face-framing locks and a clean rear silhouette. The generators live in the `.blend` text blocks `lily_hair_lib.py` and `lily_hair_build.py`.
- **Shading:** soft, matte, flat-coloured materials with gentle three-point lighting. EEVEE with the Standard view transform keeps the palette saturated.
- **Real-time:** the game version is 11,298 triangles, 3 materials and a 15-bone skeleton that matches the game's procedural rig, so all existing poses (walk, sit, phone, talk, smell, buy, water, push and ride the bike) drive it directly.

The design history and the rejected alternatives are in the repository's `DESIGN_DECISIONS.md`.
