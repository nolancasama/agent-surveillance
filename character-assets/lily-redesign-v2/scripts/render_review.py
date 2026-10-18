"""Render all approval views and audit this design, without rebuilding it.

blender --background lily_redesign_v2.blend --python scripts/render_review.py
Also callable through Blender MCP. No game files are read or written here.
"""
from pathlib import Path
import json
import math
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'renders'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes['Lily_Design_02']
if bpy.context.window:
    bpy.context.window.scene = scene
character = next(c for c in scene.collection.children if c.name.startswith('L2_Character'))
camera = scene.camera
pivot = next(o for o in scene.objects if o.name.startswith('L2_Light pivot'))
VIEWS = {
    'front': ((0, -6, 1.60), (0, 0, 1.06), 2.34),
    'left': ((-6, 0, 1.60), (0, 0, 1.06), 2.34),
    'rear': ((0, 6, 1.60), (0, 0, 1.06), 2.34),
    'three_quarter': ((3.8, -6, 1.75), (0, 0, 1.07), 2.36),
    'face': ((.28, -4, 1.86), (0, -.025, 1.815), .66),
}


def view(name):
    position, target, scale = VIEWS[name]
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale
    pivot.rotation_euler.z = math.atan2(position[0], -position[1])
    scene.render.resolution_x = 1080 if name == 'face' else 1120
    scene.render.resolution_y = 1080 if name == 'face' else 1440
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(OUT / f'lily_{name}.png')
    bpy.context.view_layer.update()


dg = bpy.context.evaluated_depsgraph_get()
parts, positions, materials = [], [], set()
for obj in character.objects:
    assert obj.type == 'MESH', f'Unexpected character object: {obj.name}'
    assert obj.animation_data is None, f'Unexpected animation: {obj.name}'
    assert all(m.type != 'ARMATURE' for m in obj.modifiers)
    evaluated = obj.evaluated_get(dg)
    data = evaluated.to_mesh()
    data.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(data)
    parts.append({
        'name': obj.name,
        'vertices': len(data.vertices),
        'triangles': len(data.loop_triangles),
        'open_boundary_edges': sum(e.is_boundary for e in bm.edges),
        'edges_with_more_than_two_faces': sum(len(e.link_faces) > 2 for e in bm.edges),
        'zero_area_faces': sum(f.calc_area() < 1e-12 for f in bm.faces),
        'editable_modifiers': [m.type for m in obj.modifiers],
    })
    bm.free()
    for v in data.vertices:
        p = obj.matrix_world @ v.co
        assert all(math.isfinite(c) for c in p), obj.name
        positions.append(p)
    materials.update(m.name for m in data.materials if m)
    evaluated.to_mesh_clear()

minimum = [min(p[i] for p in positions) for i in range(3)]
maximum = [max(p[i] for p in positions) for i in range(3)]
triangles = sum(p['triangles'] for p in parts)
assert triangles <= 12000, f'Character exceeds target: {triangles}'
assert 2.04 < maximum[2] < 2.12, f'Unexpected crown height: {maximum[2]}'
assert minimum[2] >= -.001, 'Geometry below the ground'
assert not any(p['edges_with_more_than_two_faces'] for p in parts)
assert not any(p['zero_area_faces'] for p in parts)

# Regression points were previously visible scalp intersections in the fringe.
head = next(o for o in character.objects if o.name.startswith('L2_Head sculpted'))
hair = next(o for o in character.objects if o.name.startswith('L2_Hair unified'))
head_eval, hair_eval = head.evaluated_get(dg), hair.evaluated_get(dg)
clearances = []
for x, z in [(-.15, 1.96), (-.16, 1.98), (-.13, 2.0), (-.12, 1.96), (0, 2.0), (-.18, 1.95)]:
    head_hit, hp, _, _ = head_eval.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
    hair_hit, cp, _, _ = hair_eval.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
    assert head_hit and hair_hit
    clearance = hp.y - cp.y
    assert clearance > .001, f'Scalp exposed at {x}, {z}: {clearance}'
    clearances.append({'x': x, 'z': z, 'hair_in_front_of_head': clearance})

for name in VIEWS:
    view(name)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    assert Path(scene.render.filepath).stat().st_size > 10000

view('three_quarter')
# Opening the blend presents the design through its review camera.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.region_3d.view_camera_zoom = 0
            area.spaces.active.overlay.show_overlays = False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'lily_redesign_v2.blend'), check_existing=False)

report = {
    'asset': 'Lily redesign v2 - unrigged visual review',
    'blender_version': bpy.app.version_string,
    'scene': scene.name,
    'mesh_objects': len(parts),
    'evaluated_triangles': triangles,
    'triangle_budget': 12000,
    'material_count': len(materials),
    'bounds_min': minimum,
    'bounds_max': maximum,
    'dimensions_xyz': [maximum[i] - minimum[i] for i in range(3)],
    'coordinate_convention': '-Y forward, +Z up',
    'armatures': 0,
    'animations': 0,
    'checks_passed': ['finite_geometry', 'triangle_budget', 'crown_height', 'ground_clearance',
                      'no_edges_with_more_than_two_faces', 'no_zero_area_faces',
                      'no_rig_or_animation', 'fringe_clearance_regression', 'five_renders_written'],
    'fringe_clearance_samples': clearances,
    'renders': [{'file': f'renders/lily_{name}.png',
                 'resolution': [1080, 1080] if name == 'face' else [1120, 1440],
                 'camera_position': value[0], 'target': value[1], 'orthographic_scale': value[2]}
                for name, value in VIEWS.items()],
    'parts': parts,
    'limits': ['Editable components and material slots are not a final draw-call budget.',
               'Materials must be consolidated or baked before game export.',
               'Neutral design only; seated and bicycle deformation require future rig testing.',
               'No Chromebook runtime performance measurement has been performed.',
               'Open boundaries on fitted face graphics, hems and shoe openings are intentional.',
               'Final aesthetic approval belongs to the user / Claude.'],
}
(ROOT / 'validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: report[k] for k in ['evaluated_triangles', 'mesh_objects', 'material_count', 'checks_passed']}))
