// Rebuild from the unmodified CC0 Quaternius source, with Node and no dependencies:
// node character-assets/npc/worker/convert-worker.mjs
import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('./Worker.gltf', import.meta.url);
const destination = new URL('../../../public/assets/npc-worker.glb', import.meta.url);
const gltf = JSON.parse(await readFile(source, 'utf8'));
const keepClips = new Set(['Walk', 'Idle', 'Idle_Neutral']);
gltf.animations = gltf.animations.filter(clip => keepClips.has(clip.name));
if (gltf.animations.length !== keepClips.size) throw new Error('Missing required worker clips');

// Retain the full mesh, bind pose and skeleton, and copy only accessors used by
// geometry, skinning and the selected peaceful clips. Removing just the animation
// JSON would leave all of the discarded combat keyframes in the embedded buffer.
const accessorMap = new Map();
const viewMap = new Map();
const oldAccessors = gltf.accessors;
const oldViews = gltf.bufferViews;
const buffers = gltf.buffers.map(buffer => {
  if (!buffer.uri?.startsWith('data:')) throw new Error('Expected embedded source buffers');
  return Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',') + 1), 'base64');
});
const accessors = [];
const views = [];
const chunks = [];
let binaryLength = 0;

function retainView(index) {
  if (viewMap.has(index)) return viewMap.get(index);
  const view = oldViews[index];
  const padding = (4 - binaryLength % 4) % 4;
  chunks.push(Buffer.alloc(padding));
  binaryLength += padding;
  const offset = view.byteOffset ?? 0;
  chunks.push(buffers[view.buffer].subarray(offset, offset + view.byteLength));
  const next = views.length;
  views.push({ ...view, buffer: 0, byteOffset: binaryLength });
  binaryLength += view.byteLength;
  viewMap.set(index, next);
  return next;
}

function retainAccessor(index) {
  if (accessorMap.has(index)) return accessorMap.get(index);
  const accessor = structuredClone(oldAccessors[index]);
  if (accessor.bufferView !== undefined) accessor.bufferView = retainView(accessor.bufferView);
  if (accessor.sparse) {
    accessor.sparse.indices.bufferView = retainView(accessor.sparse.indices.bufferView);
    accessor.sparse.values.bufferView = retainView(accessor.sparse.values.bufferView);
  }
  const next = accessors.length;
  accessors.push(accessor);
  accessorMap.set(index, next);
  return next;
}

for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    for (const key of Object.keys(primitive.attributes)) {
      primitive.attributes[key] = retainAccessor(primitive.attributes[key]);
    }
    if (primitive.indices !== undefined) primitive.indices = retainAccessor(primitive.indices);
    for (const target of primitive.targets ?? []) {
      for (const key of Object.keys(target)) target[key] = retainAccessor(target[key]);
    }
  }
}
for (const skin of gltf.skins) {
  if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = retainAccessor(skin.inverseBindMatrices);
}
for (const clip of gltf.animations) {
  for (const sampler of clip.samplers) {
    sampler.input = retainAccessor(sampler.input);
    sampler.output = retainAccessor(sampler.output);
  }
}
if (gltf.images?.length || gltf.extensionsRequired?.length) {
  throw new Error('Unexpected source images/extensions; update retention before converting');
}
gltf.accessors = accessors;
gltf.bufferViews = views;
gltf.buffers = [{ byteLength: binaryLength }];

const jsonBytes = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
jsonBytes.copy(jsonChunk);
const binaryChunk = Buffer.concat([...chunks, Buffer.alloc((4 - binaryLength % 4) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);
function chunkHeader(length, type) {
  const result = Buffer.alloc(8);
  result.writeUInt32LE(length, 0);
  result.writeUInt32LE(type, 4);
  return result;
}
const glb = Buffer.concat([
  header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk,
  chunkHeader(binaryChunk.length, 0x004e4942), binaryChunk,
]);
await writeFile(destination, glb);
console.log(`Worker GLB: ${glb.length} bytes; clips: ${gltf.animations.map(clip => clip.name).join(', ')}`);
