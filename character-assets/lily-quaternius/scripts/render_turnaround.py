"""Render Lily review views from a .blend without changing it.

Usage:
  blender -b <file.blend> --python render_turnaround.py -- <out_dir> <prefix> [action] [frame] [walk]

Views: front, three_quarter, side, back, plus face, hands and feet close-ups.
With `walk`, renders <prefix>_00/10/20/30.png three-quarter frames of the
action instead, plus <prefix>.mp4 of the whole cycle.
EEVEE with the Standard view transform keeps the palette unwashed. The scene is
discarded afterwards (the file is never saved).
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(argv[0] if argv else 'renders/review')
PREFIX = argv[1] if len(argv) > 1 else 'lily'
ACTION = argv[2] if len(argv) > 2 else 'Idle'
FRAME = int(argv[3]) if len(argv) > 3 else 0
WALK = len(argv) > 4 and argv[4] == 'walk'
OUT.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
if ACTION in bpy.data.actions:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[ACTION]
    slots = getattr(bpy.data.actions[ACTION], 'slots', None)
    if slots:
        arm.animation_data.action_slot = slots[0]
scene.frame_set(FRAME)
meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render]

depsgraph = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for ob in meshes:
    ev = ob.evaluated_get(depsgraph)
    me = ev.to_mesh()
    for v in me.vertices:
        w = ob.matrix_world @ v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ev.to_mesh_clear()
centre = (lo + hi) / 2
height = hi.z - lo.z

try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    scene.render.engine = 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
world = scene.world or bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (0.42, 0.45, 0.5, 1)
bg.inputs[1].default_value = 0.9

for ob in [o for o in scene.objects if o.type in {'LIGHT', 'CAMERA'}]:
    bpy.data.objects.remove(ob, do_unlink=True)
key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
key.data.energy = 3.2
key.rotation_euler = (math.radians(50), 0, math.radians(30))
fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
fill.data.energy = 1.1
fill.rotation_euler = (math.radians(65), 0, math.radians(-130))
for light in (key, fill):
    scene.collection.objects.link(light)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.lens = 85

# Blender front is -Y (exports to glTF/three +Z).
VIEWS = {
    'front': (0, -1, 0.08), 'three_quarter': (0.7, -0.7, 0.1), 'side': (1, 0, 0.05),
    'back': (0, 1, 0.08),
}


def bone_head(name):
    pose = arm.pose.bones.get(name)
    return arm.matrix_world @ pose.head if pose else centre


CLOSE = {
    'face': (bone_head('Head') + Vector((0, 0, height * 0.09)), (0, -1, 0.05), height * 0.23),
    'hands': (bone_head('Wrist.R') + Vector((0, 0, -0.03)), (0.55, -1, 0.15), height * 0.30),
    'feet': (Vector((centre.x, centre.y, lo.z + height * 0.07)), (0.45, -1, 0.35), height * 0.30),
}


def shoot(name, target, direction, frame_height, w, h):
    direction = Vector(direction).normalized()
    fov = 2 * math.atan(cam.data.sensor_width / 2 / cam.data.lens)
    distance = frame_height * 0.5 / math.tan(fov / 2) * (h / w if w < h else 1) * 1.08
    cam.location = target + direction * distance
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = str(OUT / f'{PREFIX}_{name}.png')
    bpy.ops.render.render(write_still=True)


if WALK:
    # Fixed camera on the rest-pose centre; the cycle is in place.
    end = int(bpy.data.actions[ACTION].frame_range[1])
    for frame in range(0, end, 10):
        scene.frame_set(frame)
        shoot(f'{frame:02d}', centre, VIEWS['three_quarter'], height * 1.02, 800, 1000)
    scene.frame_start, scene.frame_end = 0, end - 1
    if hasattr(scene.render.image_settings, 'media_type'):  # Blender 5 splits images from video
        scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format, scene.render.ffmpeg.codec = 'MPEG4', 'H264'
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    scene.render.filepath = str(OUT / f'{PREFIX}.mp4')
    bpy.ops.render.render(animation=True)
else:
    for name, direction in VIEWS.items():
        shoot(name, centre, direction, height * 1.02, 800, 1000)
    for name, (target, direction, frame) in CLOSE.items():
        shoot(name, target, direction, frame, 640, 640)
print('RENDERED', OUT, PREFIX, f'height={height:.3f}')
