import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPerson, updatePerson, PERSON_HEIGHT } from './people.js';
import { attachWorkerBody, workerAnimation, workerClipTime } from './workerBody.js';

test('worker maps travel to Walk and stationary phone/waypoints to Idle', () => {
  for (const animation of ['idle', 'phone', 'wander', 'Interact', undefined]) {
    assert.equal(workerAnimation({ animation, moving: false }), 'Idle');
    assert.equal(workerAnimation({ animation, moving: true }), 'Walk');
  }
  assert.equal(workerAnimation({ animation: 'walk' }), 'Walk');
  assert.equal(workerAnimation({ animation: 'walk', moving: false }), 'Idle');
  assert.equal(workerAnimation({ animationState: 'walk' }), 'Walk');
});

test('clip time wraps absolute mission seconds and matches travel speed', () => {
  assert.equal(workerClipTime(4.25, 2, 'Idle'), .25);
  assert.equal(workerClipTime(-.25, 2, 'Idle'), 1.75);
  assert.equal(workerClipTime(1.75, 2, 'Walk'), 0);
  assert.equal(workerClipTime(.4375, 2, 'Walk'), .5);
  assert.equal(workerClipTime(.875, 2, 'Walk', .6), .5);
  assert.equal(workerClipTime(Infinity, 2, 'Walk'), 0);
  assert.equal(workerClipTime(2, 0, 'Idle'), 0);
});

function asset() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: '#ffc220' }));
  mesh.position.y = 1;
  scene.add(mesh);
  const bone = new THREE.Bone();
  bone.name = 'sample';
  scene.add(bone);
  const animations = ['Walk', 'Idle'].map((name, index) => new THREE.AnimationClip(name, 2, [
    new THREE.NumberKeyframeTrack('sample.position[x]', [0, 1, 2], [index * 3, index * 3 + 1, index * 3]),
  ]));
  return { scene, animations, bone, mesh };
}

test('mixer reproduces poses after switches, repeated paused samples and backward seeks', () => {
  const person = createPerson({ id: 'lawn_walker' });
  const gltf = asset();
  attachWorkerBody(person, gltf, PERSON_HEIGHT);
  const pose = { animation: 'walk', moving: true, position: { x: 9, y: 0, z: 24 }, heading: .4 };
  updatePerson(person, pose, .4375);
  const expected = gltf.bone.position.x;
  assert.ok(Math.abs(expected - .5) < 1e-6);
  updatePerson(person, { animation: 'phone', moving: false }, 8.5);
  assert.equal(gltf.bone.position.x, 3.5);
  updatePerson(person, pose, .4375);
  assert.equal(gltf.bone.position.x, expected);
  updatePerson(person, pose, .4375);
  assert.equal(gltf.bone.position.x, expected);
  assert.deepEqual(person.position.toArray(), [9, 0, 24]);
  assert.equal(person.rotation.y, .4);
  updatePerson(person, { ...pose, visible: false }, .25);
  assert.equal(person.visible, false);
  assert.equal(person.userData.rig.pelvis.visible, false);
  assert.equal(gltf.mesh.material.type, 'MeshLambertMaterial');
  assert.equal(gltf.mesh.material.color.getHexString(), 'ffc220');
  person.position.set(0, 0, 0);
  const bounds = new THREE.Box3().setFromObject(person.getObjectByName('worker-body'), true);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - PERSON_HEIGHT) < 1e-6);
});

test('worker attachment leaves every other character procedural', () => {
  for (const id of ['lily', 'yellow_short', 'orange_long_hair', 'scooter_rider', 'bloom_shopkeeper', 'art_student']) {
    const person = createPerson({ id });
    attachWorkerBody(person, asset(), PERSON_HEIGHT);
    assert.equal(person.userData.workerBody, undefined);
    assert.equal(person.userData.rig.pelvis.visible, true);
  }
});
