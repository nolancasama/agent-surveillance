"""Build phase 2A from the approved source without saving over it.

Run from the repository root:
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background character-assets/lily/lily.blend --python character-assets/lily/scripts/build_lily_game.py
Add -- --skip-renders to rebuild the blend/GLB without the seven stage previews.
All geometry, weights and material changes below happen in memory on the source.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
ASSET = HERE.parent
ROOT = ASSET.parent.parent
assert Path(bpy.data.filepath).resolve() == (ASSET / 'lily.blend').resolve(), 'Build must start from the approved lily.blend'
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from normalize_glb import normalize_glb

JOINTS = {
    'pelvis': (None, (0, .92, 0)),
    'body': ('pelvis', (0, .92, 0)),
    'head': ('body', (0, 1.78, 0)),
}
for side, sign in (('left', -1), ('right', 1)):
    for limb, x, heights in (('arm', .30, (1.48, 1.17, .87)),
                             ('leg', .125, (.92, .49, .09))):
        parent = 'body' if limb == 'arm' else 'pelvis'
        for part, h in zip(('upper', 'lower', 'end'), heights):
            name = f'{side}-{limb}-{part}'
            JOINTS[name] = (parent, (sign * x, h, 0))
            parent = name


def smooth(lo, hi, v):
    t = max(0, min(1, (v - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def interp(value, points):
    for (a, b), (c, d) in zip(points, points[1:]):
        if value <= c:
            return b + (d - b) * (value - a) / (c - a)
    a, b = points[-2]
    c, d = points[-1]
    return b + (d - b) * (value - a) / (c - a)


def blender_point(p):
    return Vector((p[0], -p[2], p[1]))


# Regenerate the same approved lock control paths, with fewer cross sections.
# Only the in-memory text is edited; lily.blend remains the approved source.
lib = bpy.data.texts['lily_hair_lib.py']
source = lib.as_string().replace('pts=cr(ctrl,8)', 'pts=cr(ctrl,3)')
source = source.replace("k=10):", "k=6):")
source = source.replace('m.levels=1; m.render_levels=2', 'm.levels=0; m.render_levels=0')
lib.clear()
lib.write(source)
exec(compile(bpy.data.texts['lily_hair_build.py'].as_string(), 'lily_hair_build.py', 'exec'), {})

# Three exported materials: linear vertex colours for solid surfaces/hair, and
# the original sRGB painted face. Avoid an atlas bake or palette approximation.
palette = bpy.data.materials.new('Lily_Game_Palette')
palette.use_nodes = True
bsdf = palette.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .55
bsdf.inputs['Specular IOR Level'].default_value = .25
colors = palette.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'Color'
palette.node_tree.links.new(colors.outputs['Color'], bsdf.inputs['Base Color'])
hair_palette = palette.copy()
hair_palette.name = 'Lily_Game_Hair'
hair_bsdf = hair_palette.node_tree.nodes.get('Principled BSDF')
# Low-resolution smooth lock tubes otherwise catch a broad grey specular band
# on their face-facing surface. Keep their brown colour and diffuse shading.
hair_bsdf.inputs['Roughness'].default_value = .9
hair_bsdf.inputs['Specular IOR Level'].default_value = 0
face = bpy.data.materials['Lily_Face']
face.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .65
face_image = next(n.image for n in face.node_tree.nodes if n.type == 'TEX_IMAGE')
face_image.colorspace_settings.name = 'sRGB'
face_image.scale(512, 512)
face_image.pack()
face_uv = face.node_tree.nodes.new('ShaderNodeUVMap')
face_uv.uv_map = 'UVMap'
face_texture = next(n for n in face.node_tree.nodes if n.type == 'TEX_IMAGE')
face.node_tree.links.new(face_uv.outputs['UV'], face_texture.inputs['Vector'])

parts = []
reduction = []
height_scale = 2.09 / 1.940903306


def rest_shape(p, name):
    """Preserve the head silhouette; straighten and relocate limb centre lines."""
    x, y, z = p
    sign = -1 if x < 0 else 1
    if name.startswith(('Hair_', 'Ribbon_')) or name in ('Lily_HairCap', 'Lily_Head', 'Lily_Ear_L', 'Lily_Ear_R'):
        return Vector((x * height_scale, y * height_scale, z * height_scale))
    if name.startswith(('Lily_Hand_', 'Lily_Thumb_')):
        # Palm top overlaps the wrist, unlike the small phase 1 gap.
        return Vector((sign * .30 + (x - sign * .298) * 1.25,
                       (y + .004) * 1.15, .91 + (z - .875) * 1.15))
    if name.startswith(('Lily_Shoe_', 'Lily_Sole_', 'Lily_ShoeCollar_')):
        return Vector((sign * .125 + (x - sign * .096) * 1.15, y * height_scale,
                       z * height_scale + .003))
    if name == 'Lily_Skirt':
        lower = 1 - smooth(.60, 1.045, z)
        rear = smooth(0, .22, y)
        # Less fore/aft flare lets the rotated front fall onto the thigh tops.
        # Round and lift the rear hem to avoid a rigid trailing corner.
        return Vector((x * height_scale * (1 - .16 * lower * rear),
                       y * height_scale * (1 - .45 * lower),
                       interp(z, ((.60, .65), (1.045, 1.02))) + .065 * lower * rear))
    if name.startswith('Backpack_'):
        return Vector((x * height_scale, y * height_scale,
                       interp(z, ((.99, 1.04), (1.42, 1.50)))))
    # A continuous mapping through both body and shell keeps sleeve openings
    # aligned with the skin. The arm's source centre line is mildly splayed.
    arm_edge = interp(z, ((.82, .23), (1.12, .19), (1.35, .14), (1.55, .14)))
    arm = smooth(arm_edge - .035, arm_edge + .035, abs(x)) * smooth(.74, .83, z)
    arm_center = interp(min(z, 1.345), ((.875, .29), (1.11, .25), (1.24, .215), (1.345, .17)))
    # The frozen shoulder pivot need not sit at the sleeve surface centre.
    # Bring the upper arm inward and keep the original descending sleeve cap.
    upper = smooth(1.11, 1.345, z)
    target_center = .30 - .065 * upper
    ax = sign * target_center + (x - sign * arm_center) * (1 - .22 * upper)
    az = interp(z, ((.875, .87), (1.11, 1.17), (1.345, 1.43), (1.53, 1.59)))
    # Original ankle/knee centres .096/.49 become .125/.49; hips .092/.84
    # become .125/.92. Torso is recentered near 1.24, head stays at 2.09.
    bz = interp(z, ((0, .003), (.09, .09), (.49, .49), (.84, .92),
                    (1.06, 1.07), (1.22, 1.30), (1.43, 1.54), (1.53, 1.65)))
    bx = x * height_scale
    if z < .90:
        bx = x + sign * .030 * smooth(.008, .05, abs(x))
    return Vector((bx * (1 - arm) + ax * arm, y * height_scale,
                   bz * (1 - arm) + az * arm))


def add_weights(ob, name):
    groups = {n: ob.vertex_groups.new(name=n) for n in JOINTS}
    for v in ob.data.vertices:
        x, y, z = v.co
        side = 'left' if x < 0 else 'right'
        weights = {}
        if name.startswith(('Hair_', 'Ribbon_')) or name in ('Lily_Head', 'Lily_HairCap', 'Lily_Ear_L', 'Lily_Ear_R'):
            weights = {'head': 1}
        elif name.startswith('Backpack_'):
            weights = {'body': 1}
        elif name.startswith(('Lily_Hand_', 'Lily_Thumb_')):
            weights = {f'{side}-arm-end': 1}
        elif name.startswith(('Lily_Shoe_', 'Lily_Sole_', 'Lily_ShoeCollar_')):
            weights = {f'{side}-leg-end': 1}
        elif name == 'Lily_Skirt':
            # Carry front and side pleats over the raised thighs; only the
            # rear quadrant hangs from the seat. Smooth the rear transition
            # rather than leaving a long, diagonally stretched side panel.
            hem = 1 - smooth(.98, 1.02, z)
            front = 1 - smooth(.008, .095, y)
            thigh = hem * front
            right = smooth(-.10, .10, x)
            weights = {'pelvis': 1 - thigh, 'left-leg-upper': thigh * (1 - right),
                       'right-leg-upper': thigh * right}
        else:
            arm = smooth(.205, .230, abs(x)) * smooth(.75, .83, z)
            if arm > 0:
                shoulder = smooth(1.36, 1.53, z) * (1 - smooth(.24, .34, abs(x)))
                lower = 1 - smooth(1.11, 1.23, z)
                hand = 1 - smooth(.85, .93, z)
                weights = {f'{side}-arm-upper': arm * (1 - shoulder) * (1 - lower),
                           f'{side}-arm-lower': arm * (1 - shoulder) * lower * (1 - hand),
                           f'{side}-arm-end': arm * (1 - shoulder) * lower * hand,
                           'body': 1 - arm + arm * shoulder}
            else:
                leg = 1 - smooth(.88, 1.03, z)
                lower = 1 - smooth(.43, .55, z)
                foot = 1 - smooth(.105, .19, z)
                body = smooth(.94, 1.18, z)
                weights = {f'{side}-leg-upper': leg * (1 - lower),
                           f'{side}-leg-lower': leg * lower * (1 - foot),
                           f'{side}-leg-end': leg * lower * foot,
                           'pelvis': (1 - leg) * (1 - body), 'body': (1 - leg) * body}
                neck = smooth(1.50, 1.64, z)
                weights = {k: w * (1 - neck) for k, w in weights.items()}
                weights['head'] = neck
        weights = sorted(((k, w) for k, w in weights.items() if w > .0001), key=lambda kw: -kw[1])[:4]
        total = sum(w for _, w in weights)
        assert total > 0, (name, v.index)
        for key, w in weights:
            groups[key].add([v.index], w / total, 'REPLACE')


for ob in list(bpy.data.objects):
    if ob.type != 'MESH' or ob.name.startswith('Stage_'):
        continue
    name = ob.name
    # Subdivision one on the body preserves bend rings; tessellation beyond
    # one contributes little to silhouette at this scale.
    for mod in ob.modifiers:
        if mod.type == 'SUBSURF':
            mod.levels = 0 if name.startswith('Hair_') else 1
            mod.render_levels = mod.levels
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    for mod in list(ob.modifiers):
        if mod.type == 'SUBSURF' and mod.levels == 0:
            ob.modifiers.remove(mod)
        else:
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Bake world transforms, including the bow's source parent.
    world = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    for v in ob.data.vertices:
        v.co = rest_shape(world @ v.co, name)
    if name.startswith('Hair_'):
        # The generated tube faces wind inward. Correct the actual geometry
        # before reduction, so the lock fronts shade like the approved hair.
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(ob.data)
        bm.free()
    if name == 'Lily_Shirt':
        soften = ob.modifiers.new('Round reshaped shoulders', 'SMOOTH')
        soften.factor = .65
        soften.iterations = 4
        bpy.ops.object.modifier_apply(modifier=soften.name)
    ob.data.calc_loop_triangles()
    before = len(ob.data.loop_triangles)
    budgets = {'Lily_Body': 1400, 'Lily_Head': 1500, 'Lily_Shirt': 800,
               'Lily_Skirt': 1000, 'Lily_HairCap': 550,
               'Backpack_Body': 180, 'Backpack_Lid': 110, 'Backpack_Pocket': 100,
               'Backpack_Buckle': 40, 'Backpack_Handle': 80, 'Ribbon_Knot': 80}
    target = budgets.get(name, 100)
    if name.startswith('Hair_'):
        target = before * .5
    elif name.startswith(('Lily_Shoe_', 'Lily_Sole_')):
        target = 200
    elif name.startswith('Lily_ShoeCollar_'):
        target = 80
    elif name.startswith('Lily_Hand_'):
        target = 130
    elif name.startswith('Lily_Thumb_'):
        target = 65
    elif name.startswith('Backpack_Strap_'):
        target = 180
    elif name.startswith('Ribbon_Loop_'):
        target = 120
    elif name.startswith('Ribbon_Tail_'):
        target = 50
    ratio = min(1.0, target / before)
    if ratio < 1:
        dec = ob.modifiers.new('Game silhouette reduction', 'DECIMATE')
        dec.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)
    ob.data.calc_loop_triangles()
    reduction.append({'object': name, 'before': before, 'after': len(ob.data.loop_triangles)})
    color = ob.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    original_materials = list(ob.data.materials)
    material_indices = []
    for poly in ob.data.polygons:
        mat = original_materials[poly.material_index]
        rgba = mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value
        for loop in poly.loop_indices:
            color.data[loop].color = rgba
        material_indices.append(1 if name == 'Lily_Head' else
                                2 if name.startswith('Hair_Side_') else 0)
        poly.use_smooth = True
    ob.data.materials.clear()
    ob.data.materials.append(palette)
    ob.data.materials.append(face)
    ob.data.materials.append(hair_palette)
    for poly, index in zip(ob.data.polygons, material_indices):
        poly.material_index = index
    add_weights(ob, name)
    parts.append(ob)

bpy.ops.object.select_all(action='DESELECT')
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.object
mesh.name = 'Lily_Game'
mesh.data.uv_layers.active_index = 0
mesh.data.uv_layers[0].active_render = True
# Join duplicates slots: consolidate to exactly three slots/primitives.
materials = [palette, face, hair_palette]
indices = [materials.index(mesh.data.materials[p.material_index]) for p in mesh.data.polygons]
mesh.data.materials.clear()
for material in materials:
    mesh.data.materials.append(material)
for poly, index in zip(mesh.data.polygons, indices):
    poly.material_index = index

arm_data = bpy.data.armatures.new('Lily_Game_Skeleton')
arm = bpy.data.objects.new('Lily_Rig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
mesh.select_set(False)
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, (parent, point) in JOINTS.items():
    bone = arm_data.edit_bones.new(name)
    bone.head = blender_point(point)
    length = .10
    if name.endswith('-upper'):
        length = .31 if '-arm-' in name else .43
    elif name.endswith('-lower'):
        length = .30 if '-arm-' in name else .40
    bone.tail = bone.head + Vector((0, 0, -length))
    bone.roll = 0
    if parent:
        bone.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
modifier = mesh.modifiers.new('Lily skin', 'ARMATURE')
modifier.object = arm
# Linear blend is exactly what glTF uses; no preserve-volume preview shortcut.
modifier.use_deform_preserve_volume = False
mesh.parent = arm
for bone in arm.pose.bones:
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = Quaternion()
arm['game_axes'] = 'glTF +Y up, +Z forward; native bone axes are rebased by normalize_glb.py'
arm['pose_preview'] = 'Game quaternions are conjugated into native edit-bone frames by build_lily_game.py'

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active = arm
out = ROOT / 'public' / 'assets' / 'lily.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                          export_yup=True, export_animations=False, export_cameras=False,
                          export_lights=False, export_all_influences=False,
                          export_def_bones=True, export_extras=False)
print('LILY_REDUCED_TRIANGLES', sum(item['after'] for item in reduction))
stats = normalize_glb(out, JOINTS)
stats['reduction'] = reduction
stats['source'] = 'character-assets/lily/lily.blend'
stats['source_sha256'] = hashlib.sha256((ASSET / 'lily.blend').read_bytes()).hexdigest()
stats['height_scale'] = height_scale
(HERE / 'build_report.json').write_text(json.dumps(stats, indent=2) + '\n')

scene = bpy.context.scene
scene.render.resolution_x = 810
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.engine = 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
scene.camera.location *= height_scale
pivot = bpy.data.objects['Stage_Pivot']
pivot.rotation_euler.z = 0
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'lily_game.blend'))


def pose(rotations):
    conversion = Matrix.Rotation(-math.pi / 2, 4, 'X').to_quaternion()
    for name, bone in arm.pose.bones.items():
        game = Quaternion((1, 0, 0, 0))
        if name in rotations:
            game = Quaternion(Vector((1, 0, 0)), math.radians(rotations[name]))
        basis = conversion @ bone.bone.matrix_local.to_quaternion()
        bone.rotation_quaternion = basis.inverted() @ game @ basis
    bpy.context.view_layer.update()


if '--skip-renders' not in sys.argv:
    previews = ASSET / 'renders' / 'game'
    previews.mkdir(parents=True, exist_ok=True)
    walking = {'left-leg-upper': -28, 'left-leg-lower': 12, 'left-leg-end': 16,
               'right-leg-upper': 24, 'right-leg-lower': 28, 'right-leg-end': -52,
               'left-arm-upper': 24, 'left-arm-lower': -12, 'right-arm-upper': -24,
               'right-arm-lower': -15, 'right-arm-end': 39, 'left-arm-end': -12}
    pedalling = {'left-leg-upper': -70, 'right-leg-upper': -70,
                 'left-leg-lower': 95, 'right-leg-lower': 110,
                 'left-leg-end': -25, 'right-leg-end': -40,
                 'left-arm-upper': -58, 'right-arm-upper': -58,
                 'left-arm-lower': -12, 'right-arm-lower': -12,
                 'left-arm-end': 70, 'right-arm-end': 70}
    holding = {'right-arm-upper': -82, 'right-arm-lower': -15, 'right-arm-end': 97}
    views = [('front', 0, {}), ('three_quarter', 35, {}), ('back', 180, {}),
             ('walking_stride', 35, walking), ('seated_pedalling', 55, pedalling),
             ('seated_pedalling_front', 25, pedalling),
             ('right_arm_holding', 35, holding)]
    for name, angle, rotations in views:
        pose(rotations)
        pivot.rotation_euler.z = math.radians(angle)
        scene.render.filepath = str(previews / f'{name}.png')
        bpy.ops.render.render(write_still=True)
    pose({})
    pivot.rotation_euler.z = 0
print('LILY_GAME_REPORT', json.dumps({k: v for k, v in stats.items() if k != 'reduction'}))
