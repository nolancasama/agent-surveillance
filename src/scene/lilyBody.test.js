import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPerson, updatePerson, PERSON_HEIGHT } from './people.js';
import { attachLilyChildBody, lilyClipName, lilyClipTime, LILY_RUN_SPEED } from './lilyBody.js';
import { poseAt, SEGMENT_WINDOWS } from '../sim/markRoute.js';

const FILE = new URL('../../public/assets/lily-child.glb', import.meta.url);
async function loadAsset() {
  const bytes = readFileSync(FILE);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}
async function lily() {
  const person = createPerson({ id: 'lily' });
  attachLilyChildBody(person, await loadAsset(), PERSON_HEIGHT);
  return person;
}
const bone = (person, name) => person.userData.rig.childBody.bones[name];
const world = object => object.getWorldPosition(new THREE.Vector3());

test('locomotion picks Walk/Run by travel speed; other actions stand on Idle', () => {
  assert.equal(lilyClipName({ walk: true }, { travelSpeed: 1.3 }), 'Walk');
  assert.equal(lilyClipName({ walk: true }, { travelSpeed: LILY_RUN_SPEED + .1 }), 'Run');
  assert.equal(lilyClipName({ walk: true, ride: true }, { travelSpeed: 3 }), 'Idle');
  assert.equal(lilyClipName({ walk: false }, { travelSpeed: 3 }), 'Idle');
});

test('clip phase follows travelled distance and wraps', () => {
  assert.equal(lilyClipTime('Idle', 2, {}, 5), 1);
  assert.equal(lilyClipTime('Walk', 2, { travelDistance: 1.266 / 2 }, 99, 1), 1);
  assert.equal(lilyClipTime('Walk', 2, { travelDistance: 1.266 * 3 }, 0, 1), 0);
  assert.ok(Math.abs(lilyClipTime('Walk', 2, { travelDistance: 1.266 }, 0, 2) - 1) < 1e-9);
  assert.equal(lilyClipTime('Walk', 0, {}, 1), 0);
});

test('child body stands PERSON_HEIGHT tall, grounded, and replaces only the procedural body meshes', async () => {
  const person = await lily();
  const rig = person.userData.rig;
  updatePerson(person, { animation: 'idle' }, 0);
  person.updateMatrixWorld(true);
  const wrapper = person.getObjectByName('lily-child-body');
  const bounds = new THREE.Box3().setFromObject(wrapper, true);
  assert.ok(Math.abs(bounds.min.y) < .02, `min ${bounds.min.y}`);
  assert.ok(Math.abs(bounds.max.y - PERSON_HEIGHT) < .03, `max ${bounds.max.y}`);
  let skinned = 0;
  wrapper.traverse(o => {
    if (!o.isSkinnedMesh) return;
    skinned++;
    assert.ok(o.material.isMeshLambertMaterial && o.material.vertexColors);
    assert.equal(o.frustumCulled, false);
  });
  assert.equal(skinned, 1);
  assert.equal(rig.torso.visible, false);
  assert.equal(rig.hips.visible, false);
  // Props keep their procedural parents and can still be shown.
  updatePerson(person, { animation: 'phone', props: ['phone'] }, 1);
  assert.ok(rig.phone.visible);
  const npc = createPerson({ id: 'npc' });
  attachLilyChildBody(npc, await loadAsset(), PERSON_HEIGHT);
  assert.equal(npc.userData.rig.childBody, undefined);
  assert.ok(npc.userData.rig.torso.visible);
});

test('walking along the route keeps the stance foot planted in the world', async () => {
  const person = await lily();
  const window = SEGMENT_WINDOWS[0];
  for (const side of ['FootL', 'FootR']) {
    let worst = 0, planted = 0;
    let previous = null;
    // A straight stretch: headings snap at path corners for every character.
    for (let t = window.start + 4; t < window.start + 7; t += 1 / 60) {
      updatePerson(person, poseAt(t), t);
      person.updateMatrixWorld(true);
      const foot = world(bone(person, side));
      if (previous && foot.y < .045 && previous.y < .045) {
        worst = Math.max(worst, Math.hypot(foot.x - previous.x, foot.z - previous.z) * 60);
        planted++;
      }
      previous = foot;
    }
    assert.ok(planted > 20, `${side} planted frames ${planted}`);
    // Route speed is ~1.34 units/s; a planted foot should barely move.
    assert.ok(worst < .5, `${side} planted slide speed ${worst.toFixed(3)}`);
  }
});

test('riding puts hands near the bars and feet on the moving pedals', async () => {
  const person = await lily();
  const rig = person.userData.rig;
  let hands = 0, feet = 0;
  for (let i = 0; i < 12; i++) {
    const time = 200 + i * .37;
    updatePerson(person, { animation: 'ride_bike', props: ['bike'] }, time);
    person.updateMatrixWorld(true);
    for (const limb of rig.childBody.limbs) {
      const gap = world(bone(person, limb.end)).distanceTo(world(limb.proc.end));
      if (limb.arm) hands = Math.max(hands, gap); else feet = Math.max(feet, gap);
    }
  }
  assert.ok(hands < .12, `hand gap ${hands.toFixed(3)}`);
  assert.ok(feet < .12, `foot gap ${feet.toFixed(3)}`);
});

test('special poses stay finite and seated hips drop', async () => {
  const person = await lily();
  const heights = {};
  for (const [i, animation] of ['idle', 'sit_phone', 'smell', 'water_flowers', 'buy_flowers', 'wave', 'tie_shoe', 'push_bike'].entries()) {
    updatePerson(person, { animation, segmentProgress: .5, props: animation === 'push_bike' ? ['bike'] : [] }, 10 + i * 5);
    person.updateMatrixWorld(true);
    for (const name of ['Body', 'Head', 'WristL', 'WristR', 'FootL', 'FootR']) {
      const p = world(bone(person, name));
      assert.ok([p.x, p.y, p.z].every(Number.isFinite), `${animation} ${name}`);
    }
    heights[animation] = world(bone(person, 'Body')).y;
  }
  assert.ok(heights.sit_phone < heights.idle - .2, JSON.stringify(heights));
});

test('poses are absolute: repeated and backward-seeked samples match exactly', async () => {
  const person = await lily();
  const snapshot = () => Object.values(person.userData.rig.childBody.bones)
    .flatMap(b => [...b.quaternion.toArray(), ...b.position.toArray()]);
  const times = [3, 50, 120, 150, 175];
  const first = times.map(t => { updatePerson(person, poseAt(t), t); return snapshot(); });
  for (const [i, t] of [...times.entries()].reverse()) {
    updatePerson(person, poseAt(t), t);
    updatePerson(person, poseAt(t), t);
    assert.deepEqual(snapshot(), first[i], `t=${t}`);
  }
});

test('a GLB without the skeleton leaves the procedural fallback intact', () => {
  const person = createPerson({ id: 'lily' });
  assert.throws(() => attachLilyChildBody(person, { scene: new THREE.Group(), animations: [] }, PERSON_HEIGHT),
    /missing bone Root/);
  assert.ok(person.userData.rig.torso.visible);
  assert.equal(person.userData.rig.childBody, undefined);
});
