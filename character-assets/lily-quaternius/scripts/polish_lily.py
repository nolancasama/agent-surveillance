"""Polish pass on the editable Lily source (lily_q.blend). Runs once.

    blender -b lily_q.blend --python scripts/polish_lily.py -- [--save]

Reference: public/assets/lily.png (almond brown eyes, soft arched brows, open
smile, blush). Keeps the skeleton, clips, palette and silhouette identity.

1. Hands 0.8 and shoes 0.8 long / 0.85 wide / 0.9 tall, with their bones, blended by
   skin weight so wrists and ankles stay continuous. Soles stay on the ground.
2. Skirt top tucked inside the shirt so the shirt hem, not a jagged
   intersection, is the visible waist line.
3. Front backpack straps rebuilt as one continuous ribbon per side, projected
   onto the shirt (the old five-piece straps left stepped gaps).
4. Face: brows thinned and arched, eyes narrowed to an almond shape with a
   longer lash line and darker iris, an open smile with teeth and tongue, and
   cheek blush discs (coloured as a gradient into the skin by build_lily_game.py).
5. Child-soft arms and legs (light Laplacian smoothing of skin away from seams)
   and smooth shading with creases kept sharp above 50 degrees.

The armature gets lily_polish = 1; a second run refuses to change anything.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SAVE = '--save' in sys.argv
HAND_SCALE = 0.8
SHOE_SCALE = Vector((0.85, 0.8, 0.9))  # width, length (Blender -Y is forward), height
SMOOTH_ANGLE = math.radians(50)

arm = bpy.data.objects['Lily_Armature']
if arm.get('lily_polish'):
    raise SystemExit('lily_q.blend is already polished (lily_polish set); refusing to run twice.')
meshes = {name: bpy.data.objects[name] for name in ['Casual_Body', 'Casual_Feet', 'Formal_Legs', 'Lily_Backpack', 'Soldier_Head']}
for ob in meshes.values():
    assert ob.matrix_world.is_identity or (ob.matrix_world.to_translation().length < 1e-6), ob.name
report = []


def material(name, rgb):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    return mat


def slot(ob, mat):
    if mat.name not in [m.name for m in ob.data.materials if m]:
        ob.data.materials.append(mat)
    return [m.name if m else None for m in ob.data.materials].index(mat.name)


def bone_head(name):
    return arm.data.bones[name].head_local.copy()


def weights(ob, names):
    groups = {ob.vertex_groups[n].index for n in names if n in ob.vertex_groups}
    return [sum(g.weight for g in v.groups if g.group in groups) for v in ob.data.vertices]


def loose_parts(bm):
    seen, parts = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        parts.append(comp)
    return parts


# 1. Hands and shoes ------------------------------------------------------------
FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']
hand_bones = {s: [f'Wrist.{s}'] + [f'{f}{i}.{s}' for f in FINGERS for i in range(1, 5) if f'{f}{i}.{s}' in arm.data.bones]
              for s in 'LR'}
body = meshes['Casual_Body']
for side, names in hand_bones.items():
    pivot = bone_head(f'Wrist.{side}')
    for v, w in zip(body.data.vertices, weights(body, names)):
        if w > 0:
            v.co = pivot + (v.co - pivot) * (1 - min(w, 1) * (1 - HAND_SCALE))
feet = meshes['Casual_Feet']
ground = min(v.co.z for v in feet.data.vertices)
for side in 'LR':
    head = bone_head(f'Foot.{side}')
    pivot = Vector((head.x, head.y, ground))
    for v, w in zip(feet.data.vertices, weights(feet, [f'Foot.{side}'])):
        if w > 0:
            k = Vector(1 - min(w, 1) * (1 - s) for s in SHOE_SCALE)
            v.co = pivot + Vector(a * b for a, b in zip(v.co - pivot, k))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for side, names in hand_bones.items():
    pivot = eb[f'Wrist.{side}'].head.copy()
    for name in names:
        bone = eb[name]
        bone.tail = pivot + (bone.tail - pivot) * HAND_SCALE
        if name != f'Wrist.{side}':
            bone.head = pivot + (bone.head - pivot) * HAND_SCALE
    foot = eb[f'Foot.{side}']
    foot.tail = foot.head + (foot.tail - foot.head) * SHOE_SCALE.y
bpy.ops.object.mode_set(mode='OBJECT')
report.append(f'hands x{HAND_SCALE}, shoes x{tuple(SHOE_SCALE)} about the ankle on the ground (z={ground:.3f})')

# Surface helpers ------------------------------------------------------------------


def bvh_for(ob, material_names=None):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    if material_names is not None:
        keep = {i for i, m in enumerate(ob.data.materials) if m and m.name in material_names}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in keep], context='FACES')
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def onto(tree, point, offset):
    location, normal, _, _ = tree.find_nearest(point)
    return location + normal * offset, normal


def front(tree, x, z, offset):
    """New face details: first skin hit looking from in front (-Y), lifted along its normal."""
    location, normal, _, _ = tree.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)), 1.0)
    assert location is not None, (x, z)
    return location + normal * offset


# Anything resting on the shirt copies the shirt's skin weights, so it follows
# the shirt from the T-pose rest into every pose instead of sinking into it.
shirt_polys = [p for p in body.data.polygons if body.data.materials[p.material_index].name == 'Lily_Shirt']
shirt_tree = BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices], [tuple(p.vertices) for p in shirt_polys])


def shirt_weights(point):
    _, _, index, _ = shirt_tree.find_nearest(point)
    poly = shirt_polys[index]
    inverse = [1 / max((body.data.vertices[i].co - point).length, 1e-5) for i in poly.vertices]
    total, result = sum(inverse), {}
    for i, k in zip(poly.vertices, inverse):
        for g in body.data.vertices[i].groups:
            name = body.vertex_groups[g.group].name
            result[name] = result.get(name, 0) + g.weight * k / total
    return result


def set_weights(ob, index, named, keep=0.0):
    """Blend ob's vertex `index` towards `named` weights (keep = share of its own weights)."""
    own = {ob.vertex_groups[g.group].name: g.weight for g in ob.data.vertices[index].groups}
    for name in set(own) | set(named):
        group = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        w = keep * own.get(name, 0) + (1 - keep) * named.get(name, 0)
        if w > 1e-4:
            group.add([index], w, 'REPLACE')
        elif name in own:
            group.remove([index])


# 2. Skirt: rounder hem, waistband over the shirt ---------------------------------------
legs = meshes['Formal_Legs']


def subdivide_material(ob, material_name, levels=1):
    """One Catmull-Clark level on one material's faces; weights and UVs are interpolated."""
    index = [m.name for m in ob.data.materials].index(material_name)
    part, rest = ob.data.copy(), ob.data.copy()
    for mesh, drop in ((part, lambda f: f.material_index != index), (rest, lambda f: f.material_index == index)):
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if drop(f)], context='FACES')
        bm.to_mesh(mesh); bm.free()
    tmp = bpy.data.objects.new('subdivide_tmp', part)
    bpy.context.scene.collection.objects.link(tmp)
    for group in ob.vertex_groups:  # same order, so deform indices still match
        tmp.vertex_groups.new(name=group.name)
    mod = tmp.modifiers.new('subdivide', 'SUBSURF')
    mod.levels = mod.render_levels = levels
    depsgraph = bpy.context.evaluated_depsgraph_get()
    smooth = bpy.data.meshes.new_from_object(tmp.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    bm = bmesh.new(); bm.from_mesh(rest); bm.from_mesh(smooth); bm.to_mesh(ob.data); bm.free()
    bpy.data.objects.remove(tmp); bpy.data.meshes.remove(part); bpy.data.meshes.remove(rest); bpy.data.meshes.remove(smooth)


before = sum(len(p.vertices) - 2 for p in legs.data.polygons)
subdivide_material(legs, 'Lily_Skirt')
report.append(f'skirt: one subdivision level for a round hem ({before} -> {sum(len(p.vertices) - 2 for p in legs.data.polygons)} triangles in Formal_Legs)')

# The coarse 14-vertex shirt hem cut the skirt top into a saw-tooth. The skirt's
# top now sits level, 4 mm outside the shirt, and moves with it.
skirt_index = [m.name for m in legs.data.materials].index('Lily_Skirt')
skirt_verts = sorted({i for p in legs.data.polygons if p.material_index == skirt_index for i in p.vertices})
top = max(legs.data.vertices[i].co.z for i in skirt_verts)
WAIST, BLEND_FROM = top - 0.008, 0.76
moved = 0
for i in skirt_verts:
    v = legs.data.vertices[i]
    if v.co.z < BLEND_FROM:
        continue
    t = min(1.0, (v.co.z - BLEND_FROM) / (WAIST - BLEND_FROM))
    if v.co.z > WAIST - 0.004:
        v.co.z = WAIST  # level waistband
    axis = Vector((0, -0.07, max(v.co.z, 0.805)))
    out = v.co - Vector((0, -0.07, v.co.z)); out.z = 0
    hit, _, _, _ = shirt_tree.ray_cast(axis + out.normalized() * 0.3, -out.normalized(), 0.6)
    if hit is not None:
        need = (hit - axis).length + 0.004
        if out.length < need:
            v.co = Vector((0, -0.07, v.co.z)) + out.normalized() * need
    set_weights(legs, i, shirt_weights(v.co), keep=1 - t)
    moved += 1
report.append(f'skirt: {moved} waist vertices levelled at z={WAIST:.3f}, 4 mm over the shirt, shirt weights blended in')

# 3. Continuous backpack straps ------------------------------------------------------
pack = meshes['Lily_Backpack']
bm = bmesh.new(); bm.from_mesh(pack.data)
dark = [m.name for m in pack.data.materials].index('Lily_BackpackDark')
straps = [p for p in loose_parts(bm) if len(p) == 6 and all(f.material_index == dark for f in p)]
assert len(straps) == 10, len(straps)
centres = {'L': [], 'R': []}
for part in straps:
    c = sum((v.co for f in part for v in f.verts), Vector()) / sum(len(f.verts) for f in part)
    centres['L' if c.x > 0 else 'R'].append(c)
bmesh.ops.delete(bm, geom=list({f for p in straps for f in p}), context='FACES')
for name in body.vertex_groups.keys():
    if name not in pack.vertex_groups:
        pack.vertex_groups.new(name=name)
group_index = {g.name: g.index for g in pack.vertex_groups}
deform = bm.verts.layers.deform.verify()


def catmull(points, samples):
    out = []
    pts = [points[0]] + points + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1:i + 3]
        for j in range(samples):
            t = j / samples
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(points[-1])
    return out


for side, cs in centres.items():
    sign = 1 if side == 'L' else -1
    cs.sort(key=lambda c: c.y, reverse=True)  # back (+Y) to front (-Y)
    start = Vector((cs[0].x - sign * 0.004, cs[0].y + 0.03, cs[0].z - 0.05))
    end = Vector((cs[-1].x + sign * 0.002, cs[-1].y - 0.004, cs[-1].z - 0.055))
    path = catmull([start] + cs + [end], 4)
    rows = []
    for k, p in enumerate(path):
        q, n = onto(shirt_tree, p, 0.0045)
        t = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
        across = t.cross(n).normalized() * 0.0085
        row = [bm.verts.new(q - across), bm.verts.new(q + across)]
        for v in row:
            for name, w in shirt_weights(v.co).items():
                if w > 1e-4:
                    v[deform][group_index[name]] = w
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        face = bm.faces.new((a[0], a[1], b[1], b[0]))
        face.material_index = dark
bm.to_mesh(pack.data); bm.free()
report.append('straps: 10 stepped pieces replaced by 2 continuous projected ribbons')

# 4. Face ----------------------------------------------------------------------------
head = meshes['Soldier_Head']
mats = [m.name for m in head.data.materials]
skin_tree = bvh_for(head, {'Lily_Skin'})
bm = bmesh.new(); bm.from_mesh(head.data)
deform = bm.verts.layers.deform.verify()
head_group = head.vertex_groups['Head'].index
parts = loose_parts(bm)


def centre(part):
    vs = {v for f in part for v in f.verts}
    return sum((v.co for v in vs), Vector()) / len(vs), vs


def kind(part):
    names = {mats[f.material_index] for f in part}
    return names.pop() if len(names) == 1 else None


def reproject(vs, moved):
    """Move vertices to new x/z and put them back on the skin at their old height above it."""
    for v in vs:
        old, n_old = onto(skin_tree, v.co, 0)
        lift = (v.co - old).dot(n_old)
        target = moved(v.co)
        v.co, _ = onto(skin_tree, target, lift)


face_parts = []
for part in parts:
    c, vs = centre(part)
    face_parts.append((part, c, vs, kind(part), len(part)))

for side in (1, -1):
    mine = [p for p in face_parts if p[1].x * side > 0.02 and p[1].y < -0.18 and 1.39 < p[1].z < 1.52]
    whites = [p for p in mine if p[3] == 'Lily_EyeWhite' and p[4] == 20]  # 20 triangles; the highlight has 12
    assert len(whites) == 1, [(p[3], p[4]) for p in mine]
    eye_c = whites[0][1]
    eye = [p for p in mine if p[3] in {'Lily_EyeWhite', 'Lily_Iris', 'Lily_EyeDark'}]
    brows = [p for p in mine if p[3] == 'Lily_Hair' and p[4] <= 10]  # not the front hair strands
    assert len(eye) == 5 and len(brows) == 2, (len(eye), len(brows))
    for part, c, vs, name, n in eye:
        if name == 'Lily_EyeDark' and n == 8:  # upper lash line: longer, bolder, flicked at the outer corner
            def moved(p, c=c):
                u = (p.x - eye_c.x) * side
                return Vector((eye_c.x + (p.x - eye_c.x) * 1.12, p.y,
                               eye_c.z + (c.z - eye_c.z) * 0.78 - 0.003 + (p.z - c.z) * 1.7 + max(0.0, u) * 0.07))
        elif name in {'Lily_Iris', 'Lily_EyeDark'}:  # iris and pupil fill the narrower eye
            def moved(p, c=c):
                return Vector((c.x + (p.x - c.x) * 1.0, p.y, eye_c.z + (c.z - eye_c.z) * 0.8 - 0.002 + (p.z - c.z) * 0.86))
        else:  # white and highlight
            def moved(p, c=c, n=n):
                k = 0.78 if n == 20 else 1.0
                return Vector((p.x, p.y, eye_c.z + (c.z - eye_c.z) * 0.78 + (p.z - c.z) * k))
        reproject(vs, moved)
    # Brows: one centre line for both slivers; thinner, raised and softly arched.
    bvs = set().union(*(p[2] for p in brows))
    bc = sum((v.co for v in bvs), Vector()) / len(bvs)
    xs = [v.co.x for v in bvs]
    half = (max(xs) - min(xs)) / 2
    sxx = sum((v.co.x - bc.x) ** 2 for v in bvs)
    slope = sum((v.co.x - bc.x) * (v.co.z - bc.z) for v in bvs) / sxx

    def brow(p):
        u = (p.x - bc.x) / half * side  # -1 inner, +1 outer
        line = bc.z + slope * (p.x - bc.x)
        return Vector((p.x, p.y, bc.z + 0.006 + 0.0055 * (1 - u * u) - 0.0015 * u + (p.z - line) * 0.5))
    reproject(bvs, brow)
    report.append(f'eye {"LR"[side < 0]}: almond 0.78 tall, lash line x1.12; brow slope {slope:.2f} -> arched, 0.5 thick')

# A small child's nose: the long bridge is shortened towards its tip.
nose = [p for p in face_parts if p[3] == 'Lily_Skin' and p[4] == 26 and abs(p[1].x) < 0.01]
assert len(nose) == 1, [(p[3], p[4]) for p in face_parts if p[3] == 'Lily_Skin']
nose_vs = nose[0][2]
tip_z = min(v.co.z for v in nose_vs)
base_y = max(v.co.y for v in nose_vs)
for v in nose_vs:
    v.co = Vector((v.co.x * 0.85, base_y + (v.co.y - base_y) * 0.7, tip_z + 0.004 + (v.co.z - tip_z) * 0.55))
report.append('nose: bridge 0.55 long, 0.7 deep, 0.85 wide')

# Open smile replaces the line mouth.
mouth = [p for p in face_parts if p[3] == 'Lily_Mouth']
assert len(mouth) == 1
mouth_c = mouth[0][1]
bmesh.ops.delete(bm, geom=mouth[0][0], context='FACES')
teeth_mat = slot(head, bpy.data.materials['Lily_EyeWhite'])
mouth_mat = slot(head, bpy.data.materials['Lily_Mouth'])
tongue_mat = slot(head, material('Lily_Tongue', (0.80, 0.24, 0.22)))
blush_mat = slot(head, material('Lily_Blush', (0.93, 0.36, 0.30)))
W, z0 = 0.021, mouth_c.z + 0.004


def top(x):
    return z0 + 0.0045 * (x / W) ** 2


def bottom(x):
    return z0 + 0.0045 - 0.0165 * math.sqrt(max(0.0, 1 - (x / W) ** 2))


def strip(xs, lower, upper, mat, lift):
    rows = []
    for x in xs:
        rows.append([bm.verts.new(front(skin_tree, mouth_c.x + x, z, lift)) for z in (lower(x), upper(x))])
    for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
        if (a0.co - a1.co).length < 1e-5 and (b0.co - b1.co).length < 1e-5:
            continue
        f = bm.faces.new((a0, b0, b1, a1)); f.material_index = mat
    for row in rows:
        for v in row:
            v[deform][head_group] = 1.0


xs = [W * math.sin(math.pi / 2 * (2 * i / 12 - 1)) for i in range(13)]
strip(xs, bottom, top, mouth_mat, 0.0012)
inner = [x * 0.62 for x in xs]
strip(inner, lambda x: top(x) - 0.0034, lambda x: top(x) - 0.0004, teeth_mat, 0.0018)
low = [x * 0.5 for x in xs]
strip(low, lambda x: bottom(x) + 0.0012, lambda x: bottom(x) + 0.0062 - 0.002 * (x / (W * 0.5)) ** 2, tongue_mat, 0.0018)
report.append('mouth: line replaced by an open smile with teeth and tongue')

# Blush discs below the outer eye corners.
for side in (1, -1):
    cx, cz = side * 0.083, 1.389
    centre_v = bm.verts.new(front(skin_tree, cx, cz, 0.0009))
    ring = [bm.verts.new(front(skin_tree, cx + math.cos(a) * 0.021, cz + math.sin(a) * 0.011, 0.0009))
            for a in [i * math.tau / 14 for i in range(14)]]
    for v in [centre_v, *ring]:
        v[deform][head_group] = 1.0
    for a, b in zip(ring, ring[1:] + ring[:1]):
        f = bm.faces.new((centre_v, a, b) if side > 0 else (centre_v, b, a)); f.material_index = blush_mat
bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index in {blush_mat, mouth_mat, teeth_mat, tongue_mat}])
bm.to_mesh(head.data); bm.free()
material('Lily_Iris', (0.20, 0.075, 0.018))
report.append('blush: two 14-segment discs; iris darkened to warm brown')

# 5. Child-soft limbs and smooth shading ------------------------------------------------


def soften(ob, group_names, factor, repeat, skin_only=True):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    skin = {i for i, m in enumerate(ob.data.materials) if m and m.name == 'Lily_Skin'}
    deform = bm.verts.layers.deform.verify()
    groups = {ob.vertex_groups[n].index for n in group_names if n in ob.vertex_groups}
    verts = [v for v in bm.verts if not v.is_boundary
             and sum(w for g, w in v[deform].items() if g in groups) > 0.95
             and (not skin_only or all(f.material_index in skin for f in v.link_faces))]
    for _ in range(repeat):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data); bm.free()
    return len(verts)


n_arms = soften(body, [f'{b}.{s}' for b in ('UpperArm', 'LowerArm') for s in 'LR'], 0.5, 2)
n_legs = soften(legs, [f'{b}.{s}' for b in ('UpperLeg', 'LowerLeg') for s in 'LR'], 0.5, 2)
report.append(f'softened {n_arms} arm and {n_legs} leg skin vertices')

for ob in meshes.values():
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.set_sharp_from_angle(angle=SMOOTH_ANGLE)
    ob.data.update()
report.append('smooth shading, sharp above 50 degrees')

arm['lily_polish'] = 1
for line in report:
    print('POLISH', line)
for ob in meshes.values():
    print('POLISH tris', ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons))
if SAVE:
    bpy.ops.wm.save_mainfile()
    print('POLISH saved', bpy.data.filepath)
