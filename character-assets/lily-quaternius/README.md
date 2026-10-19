# Lily (Quaternius base)

Lily's in-game body: a child-proportioned build of the CC0 Quaternius Ultimate
Modular Women pack (see `LICENSE.txt`), polished to match `public/assets/lily.png`.

| File | Role |
| --- | --- |
| `lily_q.blend` | Editable source: separate part meshes and materials, 62-bone rig, all pack clips. Already polished. |
| `lily_q_game.blend` | Generated export copy: one joined vertex-colour mesh, Idle/Walk/Run only. |
| `../../public/assets/lily-child.glb` | Generated game asset (`npm run check:lily`). |
| `source/` | Extracted pack, git-ignored (re-extract from "humanoid assets.zip"). |

## Rebuild the game asset

```sh
blender -b lily_q.blend --python scripts/build_lily_game.py -- lily_q_game.blend ../../public/assets/lily-child.glb
```

Then run `npm run check:lily` and `npm test` from the project root.

## Scripts

- `scripts/polish_lily.py` reproduces the 2026-10-19 polish. It turns the pre-polish `lily_q.blend` (commit 6ade7b1) into this version: smaller hands and shoes, continuous straps, a level waistband, a rounder skirt hem, the anime reference face (tiny wedge nose, soft blush), and smooth shading. It marks the armature `lily_polish` and refuses to run twice.
- `scripts/build_lily_game.py` flattens the source and exports the GLB. Blush discs fade into the skin colour.
- `scripts/render_turnaround.py` renders review views without saving the file. Add `walk` for the walk frames and video:

  ```sh
  blender -b lily_q_game.blend --python scripts/render_turnaround.py -- renders lily Idle 0
  blender -b lily_q_game.blend --python scripts/render_turnaround.py -- renders walk Walk 0 walk
  ```

## Renders

- `renders/`: turnaround views, face (front and three-quarter), hands and feet close-ups, walk frames, and the walk video (rendered as `walk.mp4`, committed as `lily_walk.mp4`).
- `renders/polish/`: before/after comparison of the polish.
- `renders/in-game/`: every route action in the game, and the wide, medium and high zoom levels.
