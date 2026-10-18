// Checks public/assets/lily.glb against the frozen phase 2 skeleton interface.
import { readFileSync, statSync } from 'node:fs';

const FILE = new URL('../public/assets/lily.glb', import.meta.url);
const MAX_TRIANGLES = 12000, MAX_MATERIALS = 4, MAX_BYTES = 1.5 * 1024 * 1024, TOLERANCE = .01;
const BONES = {
  pelvis: [null, [0, .92, 0]],
  body: ['pelvis', [0, .92, 0]],
  head: ['body', [0, 1.78, 0]],
};
for (const [side, x] of [['left', -1], ['right', 1]]) {
  BONES[`${side}-arm-upper`] = ['body', [x * .30, 1.48, 0]];
  BONES[`${side}-arm-lower`] = [`${side}-arm-upper`, [x * .30, 1.17, 0]];
  BONES[`${side}-arm-end`] = [`${side}-arm-lower`, [x * .30, .87, 0]];
  BONES[`${side}-leg-upper`] = ['pelvis', [x * .125, .92, 0]];
  BONES[`${side}-leg-lower`] = [`${side}-leg-upper`, [x * .125, .49, 0]];
  BONES[`${side}-leg-end`] = [`${side}-leg-lower`, [x * .125, .09, 0]];
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

let buffer;
try { buffer = readFileSync(FILE); } catch { console.error(`FAIL: cannot read ${FILE.pathname}`); process.exit(1); }
const bytes = statSync(FILE).size;
if (buffer.readUInt32LE(0) !== 0x46546c67) { console.error('FAIL: not a binary glTF file'); process.exit(1); }
const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
const nodes = gltf.nodes || [];

// Rest-pose world matrices from node TRS (column-major 4x4).
function local(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
const parentOf = new Map();
nodes.forEach((node, i) => (node.children || []).forEach(child => parentOf.set(child, i)));
function world(i) {
  const m = local(nodes[i]);
  return parentOf.has(i) ? multiply(world(parentOf.get(i)), m) : m;
}

const byName = new Map(nodes.map((node, i) => [node.name, i]));
const jointSet = new Set((gltf.skins || []).flatMap(skin => skin.joints));
check((gltf.skins || []).length > 0, 'no skin in file');
for (const [name, [parent, expected]] of Object.entries(BONES)) {
  const i = byName.get(name);
  if (i === undefined) { check(false, `missing bone ${name}`); continue; }
  check(jointSet.has(i), `${name} is not a skin joint`);
  const actualParent = parentOf.has(i) ? nodes[parentOf.get(i)].name : null;
  if (parent) check(actualParent === parent, `${name} parent is ${actualParent}, expected ${parent}`);
  const m = world(i), position = [m[12], m[13], m[14]];
  const error = Math.hypot(...position.map((value, k) => value - expected[k]));
  console.log(`${name.padEnd(15)} (${position.map(n => n.toFixed(3)).join(', ')}) error ${error.toFixed(4)}`);
  check(error <= TOLERANCE, `${name} rest position off by ${error.toFixed(4)}`);
}

let triangles = 0;
for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
  const mode = primitive.mode ?? 4;
  check(mode === 4, `primitive mode ${mode} is not TRIANGLES`);
  const count = primitive.indices !== undefined
    ? gltf.accessors[primitive.indices].count
    : gltf.accessors[primitive.attributes.POSITION].count;
  triangles += count / 3;
}
const materials = (gltf.materials || []).length;
console.log(`triangles ${triangles} (max ${MAX_TRIANGLES}), materials ${materials} (max ${MAX_MATERIALS}), ` +
  `size ${(bytes / 1024 / 1024).toFixed(2)} MB (max 1.5)`);
check(triangles <= MAX_TRIANGLES, 'too many triangles');
check(materials <= MAX_MATERIALS, 'too many materials');
check(bytes <= MAX_BYTES, 'file too large');

if (failures.length) { for (const f of failures) console.error(`FAIL: ${f}`); process.exit(1); }
console.log('lily.glb OK');
