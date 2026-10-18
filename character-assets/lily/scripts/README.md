# Lily phase 2A build

From the repository root in PowerShell:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background character-assets/lily/lily.blend --python character-assets/lily/scripts/build_lily_game.py
npm run check:lily
npm test
```

The build reads the approved `lily.blend`, regenerates its embedded hair paths at lower resolution, reshapes the mesh into hanging neutral, reduces each component, assigns weights, and merges it into one skinned mesh. It writes `lily_game.blend`, `public/assets/lily.glb`, `build_report.json`, and seven PNGs in `renders/game/`, including `seated_pedalling_front.png` for the skirt over raised thighs. `-- --skip-renders` skips only the PNG pass. The source and phase 1 renders are never saved or overwritten.

The Blender file keeps the source stage, a neutral pose, and the 15 native downward edit bones. Blender uses -Y forward / +Z up; the default glTF export maps `(x, y, z)` to `(x, z, -y)`. Joint head positions come directly from the frozen game interface in `JOINTS`.

Native downward Blender bone axes would export a rotated root frame. `normalize_glb.py` rebases the exported joint frames to identity rotations/scales, writes exact parent-relative translations, and recomputes inverse bind matrices. It preserves mesh geometry, weights, binary accessor layouts and materials. In glTF, child joint offsets define the downward chains; there are no bone tails. **Use this complete build command to export**, rather than exporting `lily_game.blend` manually.

For the native Blender previews, the script conjugates game local quaternions into each edit bone's basis. Walking, 70-degree raised thighs with bent knees, and the forward raised right arm use bone rotations only; no corrective mesh poses, translation offsets, animations or props conceal deformation. The saved blend remains neutral.

The GLB's three primitives use Principled materials with linear vertex colours for solids and matte face-framing locks, plus the original painted face as an embedded 512-pixel sRGB PNG. The side-lock material suppresses the grey specular strip while other hair highlights remain; regenerated hair normals are also corrected outward. The upper-arm surface sits inward of the frozen shoulder pivot for snug, sloping sleeves. The raised skirt hem and reduced lower depth improve visible leg proportions and let the thigh-weighted front drape over the seated thighs, with a rounded pelvis-weighted rear. `build_report.json` records component reductions, final budgets, bounds, weight limits and three independent CPU skinning pose checks. These checks supplement the controller-owned checker; Claude retains final visual acceptance.
