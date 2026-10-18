# Renders a face close-up of the approved Lily without saving lily.blend.
# blender.exe --background character-assets/lily/lily.blend --python character-assets/lily/scripts/render_face_closeup.py
import os
import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(bpy.data.filepath), 'renders', 'lily_face_closeup.png')
scene = bpy.context.scene
target = Vector((0.0, 0.0, 1.71))

cam_data = bpy.data.cameras.new('Face_Cam')
cam_data.lens = 85
cam = bpy.data.objects.new('Face_Cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (0.0, -1.45, 1.74)
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.resolution_x = 1080
scene.render.resolution_y = 1080
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('wrote', OUT)
