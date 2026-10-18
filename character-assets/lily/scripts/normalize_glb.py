"""Rebase Blender's downward-bone axes to the game's identity-axis GLB rig.

Call normalize_glb(path, {bone_name: (parent_name_or_None, (x, y, z))}).
Only joint node transforms and the existing inverse-bind matrix bytes change;
mesh data, accessor layouts, skin joint order and material assignments survive.
The caller is responsible for recording the returned JSON-compatible report.
"""

import json
import math
from pathlib import Path
import struct


IDENTITY = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.]
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
              5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def _require(condition, message):
    if not condition:
        raise ValueError('Lily GLB normalization: ' + message)


def _multiply(a, b):
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
            for c in range(4) for r in range(4)]


def _trs(node):
    if 'matrix' in node:
        return list(node['matrix'])
    x, y, z, w = node.get('rotation', (0, 0, 0, 1))
    sx, sy, sz = node.get('scale', (1, 1, 1))
    tx, ty, tz = node.get('translation', (0, 0, 0))
    return [(1 - 2 * (y*y + z*z))*sx, 2*(x*y + z*w)*sx, 2*(x*z - y*w)*sx, 0.,
            2*(x*y - z*w)*sy, (1 - 2*(x*x + z*z))*sy, 2*(y*z + x*w)*sy, 0.,
            2*(x*z + y*w)*sz, 2*(y*z - x*w)*sz, (1 - 2*(x*x + y*y))*sz, 0.,
            tx, ty, tz, 1.]


def _point(matrix, point):
    return tuple(sum(matrix[c * 4 + r] * point[c] for c in range(3)) + matrix[12 + r]
                 for r in range(3))


def _distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))


def _qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by,
            aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw,
            aw*bw - ax*bx - ay*by - az*bz)


def _qrotate(q, point):
    # Vector formula, deliberately independent of the matrix skinning path.
    x, y, z, w = q
    px, py, pz = point
    tx, ty, tz = 2*(y*pz-z*py), 2*(z*px-x*pz), 2*(x*py-y*px)
    return (px+w*tx+y*tz-z*ty, py+w*ty+z*tx-x*tz, pz+w*tz+x*ty-y*tx)


def _axis(axis, degrees):
    half = math.radians(degrees) / 2
    xyz = [0., 0., 0.]
    xyz[axis] = math.sin(half)
    return (*xyz, math.cos(half))


def normalize_glb(path, joints):
    """Validate and rewrite a Blender export; return serializable QA statistics.

    Raises ValueError before writing if geometry, the frozen joint layout, skin
    weights, exporter transforms or budget checks fail. Input mesh vertices must
    already be baked into game coordinates by Blender's default Y-up exporter.
    """
    path = Path(path)
    data = path.read_bytes()
    _require(len(data) >= 28, 'file is too short')
    magic, version, declared_length = struct.unpack_from('<III', data)
    _require(magic == 0x46546C67 and version == 2 and declared_length == len(data),
             'expected a complete GLB 2.0 file')
    chunks = []
    offset = 12
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        _require(offset + 8 + length <= len(data), 'truncated GLB chunk')
        chunks.append([kind, bytearray(data[offset + 8:offset + 8 + length])])
        offset += 8 + length
    _require(chunks[0][0] == 0x4E4F534A, 'first chunk is not JSON')
    gltf = json.loads(chunks[0][1].decode('utf8'))
    bins = [chunk for chunk in chunks if chunk[0] == 0x004E4942]
    _require(len(bins) == 1 and len(gltf.get('buffers', [])) == 1,
             'expected one embedded binary buffer')
    _require('uri' not in gltf['buffers'][0], 'external buffers are unsupported')
    binary = bins[0][1]

    def accessor_layout(index):
        accessor = gltf['accessors'][index]
        _require('sparse' not in accessor, 'sparse accessor is unsupported')
        view = gltf['bufferViews'][accessor['bufferView']]
        _require(view.get('buffer', 0) == 0, 'accessor references another buffer')
        code, size = COMPONENTS[accessor['componentType']]
        width = WIDTHS[accessor['type']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', size * width)
        end = start + max(0, accessor['count'] - 1) * stride + size * width
        _require(end <= len(binary), 'accessor extends beyond binary buffer')
        return accessor, start, stride, code, width

    def read_accessor(index):
        accessor, start, stride, code, width = accessor_layout(index)
        values = [struct.unpack_from('<' + code * width, binary, start + i * stride)
                  for i in range(accessor['count'])]
        if accessor.get('normalized') and accessor['componentType'] != 5126:
            divisor = {5120: 127., 5121: 255., 5122: 32767., 5123: 65535.}[accessor['componentType']]
            values = [tuple(max(-1., value/divisor) for value in row) for row in values]
        return values

    nodes = gltf.get('nodes', [])
    parents = {}
    for i, node in enumerate(nodes):
        for child in node.get('children', []):
            _require(child not in parents, 'node has multiple parents')
            parents[child] = i

    def worlds(overrides=None):
        result = {}
        visiting = set()

        def world(index):
            if index in result:
                return result[index]
            _require(index not in visiting, 'node hierarchy has a cycle')
            visiting.add(index)
            matrix = _trs((overrides or {}).get(index, nodes[index]))
            if index in parents:
                matrix = _multiply(world(parents[index]), matrix)
            result[index] = matrix
            visiting.remove(index)
            return matrix

        for i in range(len(nodes)):
            world(i)
        return result

    _require(len(joints) == 15 and set(joints) == {'pelvis', 'body', 'head'} |
             {f'{side}-{limb}-{part}' for side in ('left', 'right')
              for limb in ('arm', 'leg') for part in ('upper', 'lower', 'end')},
             'frozen joint contract must contain exactly the 15 expected names')
    _require(len(gltf.get('skins', [])) == 1, 'expected exactly one skin')
    skin = gltf['skins'][0]
    indices = skin['joints']
    _require(len(indices) == 15 and len(set(indices)) == 15,
             'skin must contain exactly 15 unique joints')
    by_name = {nodes[i].get('name'): i for i in indices}
    _require(set(by_name) == set(joints), 'skin joint names do not match the frozen interface')
    for name in joints:
        _require(sum(node.get('name') == name for node in nodes) == 1,
                 'duplicate joint node name ' + name)
    old_worlds = worlds()
    for name, (parent, position) in joints.items():
        index = by_name[name]
        if parent:
            _require(parents.get(index) == by_name[parent], name + ' has the wrong parent')
        else:
            _require(parents.get(index) not in indices, name + ' is not a root joint')
        _require(_distance(old_worlds[index][12:15], position) <= .01,
                 name + ' original exported head differs from the frozen joint position')
        ancestor = parents.get(index)
        while ancestor is not None:
            if ancestor not in indices:
                _require(max(abs(a-b) for a, b in zip(_trs(nodes[ancestor]), IDENTITY)) < 1e-5,
                         'nonjoint parent ' + str(nodes[ancestor].get('name', ancestor)) +
                         ' has a transform; bake the armature at the world origin before export')
            ancestor = parents.get(ancestor)

    _require(not gltf.get('animations') and not gltf.get('cameras'), 'animations/cameras must not be exported')
    _require('KHR_lights_punctual' not in gltf.get('extensions', {}) and
             all('camera' not in n and 'KHR_lights_punctual' not in n.get('extensions', {}) for n in nodes),
             'camera/light nodes must not be exported')
    mesh_nodes = [i for i, node in enumerate(nodes) if 'mesh' in node]
    _require(len(mesh_nodes) == 1 and nodes[mesh_nodes[0]].get('skin') == 0,
             'expected one joined skinned mesh node')
    _require(max(abs(a-b) for a, b in zip(old_worlds[mesh_nodes[0]], IDENTITY)) < 1e-5,
             'mesh world transform must be identity; bake vertex coordinates before export')
    _require(len(gltf.get('materials', [])) <= 4, 'more than four materials')
    primitives = [p for mesh in gltf.get('meshes', []) for p in mesh['primitives']]
    _require(0 < len(primitives) <= 4, 'expected at most four draw primitives')
    triangles = 0
    vertices = []
    seen_accessors = set()
    max_influences = 0
    max_weight_error = 0.
    for primitive in primitives:
        _require(primitive.get('mode', 4) == 4, 'mesh primitive is not TRIANGLES')
        attrs = primitive['attributes']
        material = gltf.get('materials', [])[primitive['material']] if 'material' in primitive else {}
        base_texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if base_texture is not None:
            uv_channel = base_texture.get('texCoord', 0)
            _require(isinstance(uv_channel, int) and uv_channel >= 0 and
                     f'TEXCOORD_{uv_channel}' in attrs,
                     'base-color texture references a missing or invalid texture-coordinate channel')
        _require('POSITION' in attrs and 'JOINTS_0' in attrs and 'WEIGHTS_0' in attrs,
                 'every primitive must have positions and skin weights')
        _require(not any(key.startswith(('JOINTS_', 'WEIGHTS_')) and key not in ('JOINTS_0', 'WEIGHTS_0')
                         for key in attrs), 'more than four skin influences are exported')
        count = gltf['accessors'][primitive['indices']]['count'] if 'indices' in primitive else gltf['accessors'][attrs['POSITION']]['count']
        _require(count % 3 == 0, 'triangle index count is not divisible by three')
        triangles += count // 3
        key = (attrs['POSITION'], attrs['JOINTS_0'], attrs['WEIGHTS_0'])
        if key in seen_accessors:
            continue
        seen_accessors.add(key)
        positions, joint_rows, weight_rows = (read_accessor(index) for index in key)
        _require(len(positions) == len(joint_rows) == len(weight_rows), 'skin accessor counts differ')
        for point, joint_row, weights in zip(positions, joint_rows, weight_rows):
            _require(len(joint_row) == len(weights) == 4, 'skin data must use VEC4 accessors')
            _require(all(math.isfinite(v) for v in (*point, *weights)), 'nonfinite mesh/weight value')
            _require(all(0 <= weight <= 1 for weight in weights), 'skin weight is outside [0,1]')
            _require(all(0 <= joint < 15 and joint == int(joint) for joint in joint_row), 'invalid skin joint index')
            weight_error = abs(sum(weights) - 1)
            max_weight_error = max(max_weight_error, weight_error)
            _require(weight_error <= 1e-4, 'skin weights are not normalized')
            max_influences = max(max_influences, sum(weight > 1e-7 for weight in weights))
            vertices.append((point, joint_row, weights))
    _require(vertices and triangles <= 12000, 'empty mesh or triangle budget exceeded')
    bounds_min = [min(vertex[0][axis] for vertex in vertices) for axis in range(3)]
    bounds_max = [max(vertex[0][axis] for vertex in vertices) for axis in range(3)]
    height = bounds_max[1] - bounds_min[1]
    _require(abs(height - 2.09) <= .06 and abs(bounds_min[1]) <= .035,
             f'neutral height/ground differs from game scale: bounds {bounds_min} to {bounds_max}')

    bind_index = skin.get('inverseBindMatrices')
    _require(bind_index is not None, 'skin needs an inverse-bind accessor')
    bind_accessor, bind_start, bind_stride, bind_code, bind_width = accessor_layout(bind_index)
    _require(bind_code == 'f' and bind_width == 16 and bind_accessor['count'] == 15,
             'inverse binds must contain 15 FLOAT MAT4 values')
    old_binds = read_accessor(bind_index)
    old_skin_matrices = [_multiply(old_worlds[index], inverse) for index, inverse in zip(indices, old_binds)]
    old_rest_error = 0.
    for point, joint_row, weights in vertices:
        transformed = [0., 0., 0.]
        for joint, weight in zip(joint_row, weights):
            moved = _point(old_skin_matrices[joint], point)
            for axis in range(3):
                transformed[axis] += weight * moved[axis]
        old_rest_error = max(old_rest_error, _distance(transformed, point))
    _require(old_rest_error <= 2e-4, 'original exported skin does not preserve its neutral mesh')

    new_binds = []
    for index in indices:
        name = nodes[index]['name']
        parent, position = joints[name]
        parent_position = joints[parent][1] if parent else (0., 0., 0.)
        node = nodes[index]
        node.pop('matrix', None)
        node['translation'] = [float(a-b) for a, b in zip(position, parent_position)]
        node['rotation'] = [0., 0., 0., 1.]
        node['scale'] = [1., 1., 1.]
        inverse = IDENTITY.copy()
        inverse[12:15] = [-float(value) for value in position]
        new_binds.append(inverse)
    new_worlds = worlds()
    _require(all(max(abs(a-b) for a, b in zip(_multiply(new_worlds[index], inverse), IDENTITY)) < 1e-6
                 for index, inverse in zip(indices, new_binds)), 'rebased rest skin matrix is not identity')

    # Exercise direct local-quaternion copying. The reference path independently
    # composes quaternion rotations and pivot positions, then blends rotated
    # offsets. This catches hierarchy, basis, bind and local/world mistakes.
    walking = {'pelvis': _axis(2, 3), 'body': _axis(0, 8), 'head': _axis(1, 20)}
    for side, sign in (('left', 1), ('right', -1)):
        walking[f'{side}-leg-upper'] = _axis(0, sign * 28)
        walking[f'{side}-leg-lower'] = _axis(0, 30 if sign > 0 else 8)
        walking[f'{side}-arm-upper'] = _axis(0, -sign * 24)
    seated = {'body': _axis(0, 20)}
    for side in ('left', 'right'):
        seated[f'{side}-leg-upper'] = _axis(0, -70)
        seated[f'{side}-leg-lower'] = _axis(0, 90)
        seated[f'{side}-leg-end'] = _axis(0, -20)
        seated[f'{side}-arm-upper'] = _axis(0, -55)
        seated[f'{side}-arm-lower'] = _axis(0, -20)
    raised = {'right-arm-upper': _axis(0, -75), 'right-arm-lower': _axis(0, -25),
              'right-arm-end': _axis(0, 100), 'head': _axis(1, -25)}
    pose_reports = []
    for label, rotations in (('walking_stride', walking), ('seated_pedalling', seated), ('right_arm_raised', raised)):
        overrides = {by_name[name]: dict(nodes[by_name[name]], rotation=list(rotation))
                     for name, rotation in rotations.items()}
        pose_worlds = worlds(overrides)
        matrices = [_multiply(pose_worlds[index], inverse) for index, inverse in zip(indices, new_binds)]
        references = {}

        def reference(name):
            if name in references:
                return references[name]
            parent, bind_position = joints[name]
            local_q = rotations.get(name, (0., 0., 0., 1.))
            if parent:
                parent_q, parent_position = reference(parent)
                offset = tuple(a-b for a, b in zip(bind_position, joints[parent][1]))
                rotated = _qrotate(parent_q, offset)
                world_position = tuple(a+b for a, b in zip(parent_position, rotated))
                world_q = _qmul(parent_q, local_q)
            else:
                world_q, world_position = local_q, bind_position
            references[name] = (world_q, world_position)
            return references[name]

        for name in joints:
            reference(name)
        max_error, max_displacement, rigid_head_vertices = 0., 0., 0
        for point, joint_row, weights in vertices:
            actual, expected = [0., 0., 0.], [0., 0., 0.]
            for joint, weight in zip(joint_row, weights):
                name = nodes[indices[joint]]['name']
                world_q, pivot = references[name]
                offset = tuple(a-b for a, b in zip(point, joints[name][1]))
                rotated = _qrotate(world_q, offset)
                transformed = _point(matrices[joint], point)
                for axis in range(3):
                    actual[axis] += weight * transformed[axis]
                    expected[axis] += weight * (rotated[axis] + pivot[axis])
                if name == 'head' and weight >= 1 - 1e-5:
                    rigid_head_vertices += 1
            max_error = max(max_error, _distance(actual, expected))
            max_displacement = max(max_displacement, _distance(actual, point))
        _require(max_error < 1e-5 and max_displacement > .05, label + ' CPU skinning verification failed')
        _require(rigid_head_vertices > 0, 'head has no rigidly attached vertices')
        pose_reports.append({'pose': label, 'max_reference_error': max_error,
                             'max_vertex_displacement': max_displacement,
                             'rigid_head_vertices': rigid_head_vertices})

    for i, inverse in enumerate(new_binds):
        struct.pack_into('<16f', binary, bind_start + i * bind_stride, *inverse)
    json_chunk = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    json_chunk += b' ' * (-len(json_chunk) % 4)
    chunks[0][1] = json_chunk
    payload = b''.join(struct.pack('<II', len(chunk), kind) + bytes(chunk) for kind, chunk in chunks)
    output = struct.pack('<III', 0x46546C67, 2, 12 + len(payload)) + payload
    _require(len(output) <= 1.5 * 1024 * 1024, 'GLB exceeds 1.5 MB')
    path.write_bytes(output)
    return {'triangles': triangles, 'materials': len(gltf.get('materials', [])),
            'draw_primitives': len(primitives), 'vertices': len(vertices),
            'joints': len(indices), 'bytes': len(output),
            'bounds_min': bounds_min, 'bounds_max': bounds_max, 'neutral_height': height,
            'max_influences': max_influences, 'max_weight_sum_error': max_weight_error,
            'original_bind_max_vertex_error': old_rest_error,
            'rest_rotations_identity': True, 'rest_scales_identity': True,
            'cpu_pose_checks': pose_reports}
