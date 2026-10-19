import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Model units per full clip cycle (planted-foot speed x duration), measured on
// the exported lily-child.glb. Scaled by the body's game scale at runtime.
export const LILY_CLIP_STRIDE = Object.freeze({ Walk: 1.266, Run: 1.739 });
// Geometric mean of the clips' native game speeds (~1.2 and ~2.8 units/s).
export const LILY_RUN_SPEED = 1.8;
export const LILY_CLIPS = Object.freeze(['Idle', 'Walk', 'Run']);
export const LILY_BONES = Object.freeze(['Root', 'Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head',
  'UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR',
  'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR']);
const BLEND_SECONDS = .35;

/** Locomotion uses authored clips; everything else stands on Idle. */
export function lilyClipName(frame = {}, state = {}) {
  if (!frame.walk || frame.ride || frame.scooter) return 'Idle';
  return (state.travelSpeed ?? 0) > LILY_RUN_SPEED ? 'Run' : 'Walk';
}

/** Absolute sampling: the clip phase follows distance travelled, so feet stay planted. */
export function lilyClipTime(name, duration, state = {}, time = 0, scale = 1) {
  if (!(duration > 0)) return 0;
  let seconds = time;
  if (name !== 'Idle') {
    const distance = Number.isFinite(state.travelDistance) ? state.travelDistance
      : time * (state.travelSpeed ?? 1.2);
    seconds = distance / (LILY_CLIP_STRIDE[name] * scale) * duration;
  }
  return Number.isFinite(seconds) ? ((seconds % duration) + duration) % duration : 0;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _axis = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();

const world = object => object.getWorldPosition(new THREE.Vector3());
function rotateWorld(bone, delta) {
  bone.getWorldQuaternion(_q2);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(delta.clone().multiply(_q2)));
  bone.updateMatrixWorld(true);
}
function setWorldQuaternion(bone, world) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(world));
  bone.updateMatrixWorld(true);
}
function setWorldPosition(bone, world) {
  bone.position.copy(bone.parent.worldToLocal(_v.copy(world)));
  bone.updateMatrixWorld(true);
}
function aim(bone, tip, target) {
  bone.getWorldPosition(_a);
  const current = _b.copy(tip).sub(_a), wanted = _c.copy(target).sub(_a);
  if (current.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) return;
  rotateWorld(bone, _q.setFromUnitVectors(current.normalize(), wanted.normalize()));
}

/**
 * Two-bone IK in world space; the procedural elbow/knee gives the bend side.
 * The tip comes from the lower bone itself (feet are Root-parented IK targets). Returns it.
 */
function twoBone(upper, lower, tipLocal, target, pole, out) {
  const root = upper.getWorldPosition(new THREE.Vector3());
  const joint = lower.getWorldPosition(new THREE.Vector3());
  const tip = lower.localToWorld(tipLocal.clone());
  const a = root.distanceTo(joint), b = joint.distanceTo(tip);
  _t.copy(target).sub(root);
  const d = THREE.MathUtils.clamp(_t.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const dir = _t.normalize();
  const bend = _p.copy(pole).sub(root);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-10) bend.copy(joint).sub(root).addScaledVector(dir, -_e.copy(joint).sub(root).dot(dir));
  bend.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  _e.copy(root).addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(upper, joint, _e);
  out.copy(root).addScaledVector(dir, d);
  aim(lower, lower.localToWorld(tipLocal.clone()), out);
  return out;
}

function sampleClip(clip, time) {
  for (const { value, interpolant } of clip.tracks) value.fromArray(interpolant.evaluate(time));
}

function convertMaterials(model) {
  const materials = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const convert = source => {
      if (!materials.has(source)) materials.set(source, new THREE.MeshLambertMaterial({
        color: source.color, map: source.map, vertexColors: source.vertexColors,
      }));
      return materials.get(source);
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
}

function hideProceduralBody(rig) {
  const props = [rig.bouquet, rig.wateringCan, rig.phone, rig.money, rig.shoppingBag];
  const groups = [rig.pelvis, rig.body, rig.head];
  for (const limb of [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg]) groups.push(limb.upper, limb.lower, limb.end);
  for (const group of groups) for (const child of group.children) {
    if (child.isMesh && !props.includes(child)) child.visible = false;
  }
}

export function attachLilyChildBody(person, gltf, height) {
  if (!person.userData.isLily) return;
  const model = gltf.scene;
  const bones = {};
  model.traverse(object => { if (object.isBone) bones[object.name] = object; });
  for (const name of LILY_BONES) if (!bones[name]) throw new Error(`Lily GLB is missing bone ${name}`);
  // The exporter drops constant channels, so overrides must not outlive a frame:
  // every frame restores the rest pose, then writes every sampled track directly.
  const rest = [];
  model.traverse(object => { if (object.isBone) rest.push([object, object.position.clone(), object.quaternion.clone()]); });
  const clips = {};
  for (const name of LILY_CLIPS) {
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) throw new Error(`Lily GLB is missing clip ${name}`);
    clips[name] = { duration: clip.duration, tracks: clip.tracks.flatMap(track => {
      const [node, property] = track.name.split('.');
      const target = model.getObjectByName(node);
      return target && ['position', 'quaternion'].includes(property)
        ? [{ value: target[property], interpolant: track.createInterpolant() }] : [];
    }) };
  }
  sampleClip(clips.Idle, 0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (!(bounds.max.y > bounds.min.y)) throw new Error('Lily has no measurable standing height');
  const wrapper = new THREE.Group();
  wrapper.name = 'lily-child-body';
  const scale = height / (bounds.max.y - bounds.min.y);
  wrapper.scale.setScalar(scale);
  // Centre the hips over the person origin, where the procedural pelvis stands.
  const hips = bones.Body.getWorldPosition(new THREE.Vector3());
  wrapper.position.set(-hips.x * scale, -bounds.min.y * scale, -hips.z * scale);
  wrapper.add(model);
  convertMaterials(model);
  person.add(wrapper);
  person.updateMatrixWorld(true);

  // Rest references in person space, sampled on Idle frame 0.
  const personQ = person.getWorldQuaternion(new THREE.Quaternion());
  const inPerson = q => personQ.clone().invert().multiply(q);
  const sideOf = name => Math.sign(person.worldToLocal(bones[name].getWorldPosition(new THREE.Vector3())).x);
  // Procedural "left" is negative X; match GLB bones by their measured side.
  const neg = sideOf('UpperArmL') < 0 ? 'L' : 'R', pos = neg === 'L' ? 'R' : 'L';
  const rig = person.userData.rig;
  const limbs = [
    { proc: rig.leftArm, upper: `UpperArm${neg}`, lower: `LowerArm${neg}`, end: `Wrist${neg}`, arm: true },
    { proc: rig.rightArm, upper: `UpperArm${pos}`, lower: `LowerArm${pos}`, end: `Wrist${pos}`, arm: true },
    { proc: rig.leftLeg, upper: `UpperLeg${neg}`, lower: `LowerLeg${neg}`, end: `Foot${neg}` },
    { proc: rig.rightLeg, upper: `UpperLeg${pos}`, lower: `LowerLeg${pos}`, end: `Foot${pos}` },
  ];
  const footRest = {};
  for (const side of ['L', 'R']) footRest[side] = inPerson(bones[`Foot${side}`].getWorldQuaternion(new THREE.Quaternion()));
  for (const limb of limbs) limb.tipLocal = bones[limb.lower].worldToLocal(bones[limb.end].getWorldPosition(new THREE.Vector3()));
  const bodyY = person.worldToLocal(bones.Body.getWorldPosition(new THREE.Vector3())).y;
  hideProceduralBody(rig);
  rig.childBody = { model, wrapper, clips, bones, rest, scale, footRest,
    bodyOffset: bodyY - rig.pelvis.position.y, limbs, mode: null, modeSince: -Infinity, prev: null, lastTime: null };
}

const handProp = (rig, limb) => (limb === rig.leftArm ? [rig.shoppingBag]
  : [rig.bouquet, rig.wateringCan, rig.phone, rig.money]).some(prop => prop.visible);

/** Runs after the procedural pose; props stay on the procedural hands. */
export function poseLilyChildBody(person, state = {}, time = 0) {
  const rig = person.userData.rig, body = rig?.childBody, frame = rig?.frame;
  if (!body || !frame) return;
  const B = body.bones;
  const clip = lilyClipName(frame, state);
  for (const [object, position, quaternion] of body.rest) {
    object.position.copy(position); object.quaternion.copy(quaternion);
  }
  body.clip = clip;
  body.clipTime = lilyClipTime(clip, body.clips[clip].duration, state, time, body.scale);
  sampleClip(body.clips[clip], body.clipTime);
  person.updateMatrixWorld(true);
  const personQ = person.getWorldQuaternion(new THREE.Quaternion());
  const procedural = frame.ride || frame.scooter || frame.sit > .001 || Math.abs(frame.lean) > .01;

  if (procedural) {
    const k = THREE.MathUtils.clamp((rig.pelvis.position.y - .62) / .30, 0, 1);
    // A child sits on the front of the saddle, nearer the bars.
    const hips = _c.copy(rig.pelvis.position).setY(rig.pelvis.position.y + k * body.bodyOffset);
    if (frame.ride) hips.z += .07;
    setWorldPosition(B.Body, person.localToWorld(hips));
    _axis.set(1, 0, 0).applyQuaternion(personQ);
    for (const [bone, share] of [[B.Abdomen, .4], [B.Torso, .3], [B.Chest, .3]]) {
      rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(_axis, frame.lean * share));
    }
    // Her shorter torso and arms lean a little further to reach bars or held targets.
    const reaching = body.limbs.filter(limb => limb.arm && (limb.proc === rig.leftArm ? frame.leftIK : frame.rightIK));
    let extra = 0;
    for (let i = 0; i < 6 && reaching.length; i++) {
      const excess = Math.max(...reaching.map(limb => {
        const shoulder = world(B[limb.upper]);
        const reach = shoulder.distanceTo(world(B[limb.lower])) + world(B[limb.lower]).distanceTo(world(B[limb.end]));
        return shoulder.distanceTo(world(limb.proc.end)) - reach * .99;
      }));
      if (excess <= 0) break;
      const step = Math.min(.06, excess * .6);
      rotateWorld(B.Abdomen, new THREE.Quaternion().setFromAxisAngle(_axis, step));
      extra += step;
    }
    // Riders look ahead rather than into the basket.
    if (frame.ride || frame.scooter) {
      rotateWorld(B.Neck, new THREE.Quaternion().setFromAxisAngle(_axis, -.7 * (frame.lean + extra)));
    }
  }
  // Head turns/nods are layered on the clip or retargeted spine.
  const bodyQ = rig.body.getWorldQuaternion(new THREE.Quaternion());
  rotateWorld(B.Head, bodyQ.clone().multiply(rig.head.quaternion).multiply(bodyQ.clone().invert()));

  const end = new THREE.Vector3(), target = new THREE.Vector3(), pole = new THREE.Vector3();
  for (const limb of body.limbs) {
    const drive = limb.arm ? procedural || (limb.proc === rig.leftArm ? frame.leftIK : frame.rightIK) || handProp(rig, limb.proc)
      : procedural;
    if (!drive) continue;
    limb.proc.end.getWorldPosition(target);
    limb.proc.lower.getWorldPosition(pole);
    // Bend toward the procedural elbow/knee, pushed outward along its own offset.
    pole.add(_v.copy(pole).sub(limb.proc.upper.getWorldPosition(_a)).multiplyScalar(.5));
    twoBone(B[limb.upper], B[limb.lower], limb.tipLocal, target, pole, end);
    if (!limb.arm) {
      setWorldPosition(B[limb.end], end);
      const side = limb.end.endsWith('L') ? 'L' : 'R';
      const procFoot = personQ.clone().invert().multiply(limb.proc.end.getWorldQuaternion(new THREE.Quaternion()));
      setWorldQuaternion(B[limb.end], personQ.clone().multiply(procFoot).multiply(body.footRest[side]));
    }
  }

  // Ease mode switches (clip <-> retarget, arm takeovers); steady states stay exact.
  const mode = `${clip}:${procedural}:${frame.leftIK}:${frame.rightIK}:${handProp(rig, rig.leftArm)}:${handProp(rig, rig.rightArm)}`;
  const dt = time - (body.lastTime ?? -Infinity);
  if (mode !== body.mode) { body.modeSince = dt >= 0 && dt < .12 ? time : -Infinity; body.mode = mode; }
  const names = LILY_BONES;
  if (body.prev && dt > 0 && dt < .12 && time - body.modeSince < BLEND_SECONDS) {
    const blend = 1 - Math.exp(-dt * 14);
    for (const name of names) {
      const bone = B[name], previous = body.prev[name];
      bone.quaternion.copy(previous.q.clone().slerp(bone.quaternion, blend));
      bone.position.copy(previous.p.clone().lerp(bone.position, blend));
    }
    body.model.updateMatrixWorld(true);
  }
  body.prev = Object.fromEntries(names.map(name => [name, { q: B[name].quaternion.clone(), p: B[name].position.clone() }]));
  body.lastTime = time;
}

/** Start during briefing; on failure the procedural body remains usable. */
export async function loadLilyChildBody(person, height) {
  try {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/lily-child.glb`);
    attachLilyChildBody(person, gltf, height);
  } catch (error) {
    console.warn('Lily GLB could not be loaded; keeping the procedural body.', error);
  }
}
