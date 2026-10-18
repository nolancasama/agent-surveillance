import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Measured planted-foot speed ~1.1 source units/s, scaled from Idle height
// 1.821 to 2.09, over the native 1.667-second two-step cycle.
export const WORKER_STRIDE = 2.1;

export function workerAnimation(state = {}) {
  const animation = state.animationState || state.animation || state.action;
  return state.moving === true || (state.moving !== false && animation === 'walk') ? 'Walk' : 'Idle';
}

export function workerClipTime(time, duration, clipName, speed = 1.2) {
  if (!(duration > 0) || !Number.isFinite(time)) return 0;
  const seconds = clipName === 'Walk' ? time * speed * duration / WORKER_STRIDE : time;
  return ((seconds % duration) + duration) % duration;
}

/** Absolute sampling: switching, pausing and seeking require no frame history. */
export function sampleWorkerBody(body, state, time) {
  const name = workerAnimation(state);
  for (const [key, action] of Object.entries(body.actions)) {
    action.enabled = true;
    action.setEffectiveWeight(key === name ? 1 : 0);
    action.time = workerClipTime(time, action.getClip().duration, key);
  }
  body.mixer.update(0);
}

export function attachWorkerBody(person, gltf, height) {
  if (person.userData.personId !== 'lawn_walker') return;
  const idle = gltf.animations.find(clip => clip.name === 'Idle')
    || gltf.animations.find(clip => clip.name === 'Idle_Neutral');
  const walk = gltf.animations.find(clip => clip.name === 'Walk');
  if (!idle || !walk) throw new Error('Worker needs Walk and an idle clip');
  const model = gltf.scene;
  const mixer = new THREE.AnimationMixer(model);
  const body = { mixer, actions: { Walk: mixer.clipAction(walk).play(), Idle: mixer.clipAction(idle).play() } };
  sampleWorkerBody(body, { animation: 'idle' }, 0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (!(bounds.max.y > bounds.min.y)) throw new Error('Worker has no measurable standing height');
  const wrapper = new THREE.Group();
  wrapper.name = 'worker-body';
  const scale = height / (bounds.max.y - bounds.min.y);
  wrapper.scale.setScalar(scale);
  wrapper.position.y = -bounds.min.y * scale;
  wrapper.add(model);
  const materials = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const convert = source => {
      if (!materials.has(source)) {
        if (source.map) source.map.colorSpace = THREE.SRGBColorSpace;
        materials.set(source, new THREE.MeshLambertMaterial({
          color: source.color, map: source.map, vertexColors: source.vertexColors,
          side: source.side, transparent: source.transparent, opacity: source.opacity,
          alphaTest: source.alphaTest, depthWrite: source.depthWrite,
        }));
      }
      return materials.get(source);
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  // Keep the procedural rig intact for fallback, but suppress its whole body/props.
  person.userData.rig.pelvis.visible = false;
  person.add(wrapper);
  person.userData.workerBody = body;
}

export async function loadWorkerBody(person, height) {
  try {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/npc-worker.glb`);
    attachWorkerBody(person, gltf, height);
  } catch (error) {
    console.warn('Worker GLB could not be loaded; keeping the procedural body.', error);
  }
}
