"""Build the game asset from the editable Lily source.

    blender -b lily_q.blend --python scripts/build_lily_game.py -- <game.blend> <lily-child.glb>

Flattens lily_q.blend the way the game expects (see DESIGN_DECISIONS.md,
"Quaternius Lily integrated in game"): the five part meshes are joined into one
skinned mesh, every material's base colour is baked into a linear per-corner
colour attribute, one double-sided vertex-colour material remains, and only the
Idle, Walk and Run clips are kept. Blush discs fade from their centre colour to
the skin colour at the rim, so they read as soft blush rather than stickers.
The source file is never saved.
"""
import sys
from pathlib import Path

import bmesh
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
GAME_BLEND, GLB = Path(argv[0]).resolve(), Path(argv[1]).resolve()
CLIPS = ('Idle', 'Walk', 'Run')
PARTS = ('Casual_Body', 'Casual_Feet', 'Formal_Legs', 'Lily_Backpack', 'Soldier_Head')

arm = bpy.data.objects['Lily_Armature']
assert arm.get('lily_polish'), 'run polish_lily.py on the source first'


def base_colour(mat):
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    return tuple(bsdf.inputs['Base Color'].default_value)


skin = base_colour(bpy.data.materials['Lily_Skin'])
for name in PARTS:
    ob = bpy.data.objects[name]
    me = ob.data
    colours = [base_colour(m) for m in me.materials]
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    bm = bmesh.new(); bm.from_mesh(me)
    layer = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
    blush = [i for i, m in enumerate(me.materials) if m.name == 'Lily_Blush']
    for face in bm.faces:
        for loop in face.loops:
            loop[layer] = colours[face.material_index]
    if blush:
        fan = [f for f in bm.faces if f.material_index == blush[0]]
        centres = {v for f in fan for v in f.verts if sum(1 for g in v.link_faces if g in fan) > 2}
        for centre in centres:
            disc = [f for f in centre.link_faces if f in fan]
            radius = max((v.co - centre.co).length for f in disc for v in f.verts)
            for f in disc:
                for loop in f.loops:
                    t = 1 - (loop.vert.co - centre.co).length / radius  # 1 at the centre, 0 at the rim
                    b = colours[blush[0]]
                    loop[layer] = tuple(s + (c - s) * t ** 1.5 for s, c in zip(skin, b))
    bm.to_mesh(me); bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.active_color_index

# Join into one skinned mesh with one vertex-colour material.
bpy.ops.object.select_all(action='DESELECT')
for name in PARTS:
    bpy.data.objects[name].select_set(True)
body = bpy.data.objects['Casual_Body']
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = body.data.name = 'Lily_Body'
for mod in [m for m in body.modifiers if m.type == 'ARMATURE'][1:]:
    body.modifiers.remove(mod)
vertex = bpy.data.materials.new('Lily_Vertex')
vertex.use_backface_culling = False
nodes = vertex.node_tree.nodes
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.8
attribute = nodes.new('ShaderNodeVertexColor')
attribute.layer_name = 'Col'
vertex.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
body.data.materials.clear()
body.data.materials.append(vertex)
for uv in list(body.data.uv_layers):
    body.data.uv_layers.remove(uv)

for action in list(bpy.data.actions):
    if action.name not in CLIPS:
        bpy.data.actions.remove(action)
arm.animation_data.action = bpy.data.actions['Idle']
bpy.context.scene.frame_set(0)
for orphan in [m for m in bpy.data.materials if m.users == 0]:
    bpy.data.materials.remove(orphan)

triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
bpy.ops.wm.save_as_mainfile(filepath=str(GAME_BLEND), copy=True)

wanted = dict(
    filepath=str(GLB), export_format='GLB', use_selection=False, export_yup=True, export_apply=False,
    export_texcoords=False, export_normals=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
    export_materials='EXPORT', export_cameras=False, export_lights=False, export_skins=True, export_morph=False,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
    export_def_bones=False, export_extras=False,
)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in props})
print('BUILD', f'triangles={triangles}', 'blend', GAME_BLEND, 'glb', GLB, f'{GLB.stat().st_size} bytes',
      'skipped options', [k for k in wanted if k not in props])
