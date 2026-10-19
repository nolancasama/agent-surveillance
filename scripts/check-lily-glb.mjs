// Checks public/assets/lily-child.glb: skeleton, clips and budgets the game relies on.
import { readFileSync, statSync } from 'node:fs';

const FILE = new URL('../public/assets/lily-child.glb', import.meta.url);
const MAX_TRIANGLES = 12000, MAX_MATERIALS = 2, MAX_BYTES = 1.5 * 1024 * 1024;
// glTF keeps Blender's dotted names; three.js strips the dots when loading.
const BONES = ['Root', 'Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head',
  'UpperArm.L', 'LowerArm.L', 'Wrist.L', 'UpperArm.R', 'LowerArm.R', 'Wrist.R',
  'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R'];
const CLIPS = ['Idle', 'Walk', 'Run'];

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

let buffer;
try { buffer = readFileSync(FILE); } catch { console.error(`FAIL: cannot read ${FILE.pathname}`); process.exit(1); }
const bytes = statSync(FILE).size;
if (buffer.readUInt32LE(0) !== 0x46546c67) { console.error('FAIL: not a binary glTF file'); process.exit(1); }
const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
const nodes = gltf.nodes || [];

check((gltf.skins || []).length === 1, `expected one skin, found ${(gltf.skins || []).length}`);
const joints = new Set((gltf.skins || []).flatMap(skin => skin.joints).map(i => nodes[i].name));
for (const name of BONES) check(joints.has(name), `missing skin joint ${name}`);
const clips = (gltf.animations || []).map(a => a.name);
for (const name of CLIPS) check(clips.includes(name), `missing clip ${name}`);

let triangles = 0, primitives = 0;
for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
  primitives++;
  const mode = primitive.mode ?? 4;
  check(mode === 4, `primitive mode ${mode} is not TRIANGLES`);
  check(primitive.attributes.COLOR_0 !== undefined, 'primitive has no vertex colours');
  const count = primitive.indices !== undefined
    ? gltf.accessors[primitive.indices].count
    : gltf.accessors[primitive.attributes.POSITION].count;
  triangles += count / 3;
}
const materials = (gltf.materials || []).length;
console.log(`joints ${joints.size}, clips ${clips.join('/')}, primitives ${primitives}, triangles ${triangles} ` +
  `(max ${MAX_TRIANGLES}), materials ${materials} (max ${MAX_MATERIALS}), size ${(bytes / 1024 / 1024).toFixed(2)} MB (max 1.5)`);
check(triangles <= MAX_TRIANGLES, 'too many triangles');
check(materials <= MAX_MATERIALS, 'too many materials');
check(bytes <= MAX_BYTES, 'file too large');

if (failures.length) { for (const f of failures) console.error(`FAIL: ${f}`); process.exit(1); }
console.log('lily-child.glb OK');
