import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { selectTarget, personVisible } from './visibility.js';
import { judgePhoto } from './photo.js';

const person = (id, x = 0, height = 0.2) => ({ id, projection: { x, y: 0, z: 0, height } });

test('mark selects nearest centred Lily or decoy, without preferring identity', () => {
  assert.equal(selectTarget([person('lily'), person('decoy', 0.1)]).id, 'lily');
  assert.equal(selectTarget([person('lily', 0.1), person('yellow_short')]).id, 'yellow_short');
});

test('empty, off-centre, too-small and blocked people cannot be marked', () => {
  assert.equal(selectTarget([]).id, null);
  assert.equal(selectTarget([person('lily', 0.3)]).id, null);
  assert.deepEqual(selectTarget([person('lily', 0, 0.1)]), { id: null, reason: 'too-small' });
  assert.equal(selectTarget([person('lily')], { isUnblocked: () => false }).id, null);
});

test('shared photo visibility uses framing, size and building occlusion, regardless of event', () => {
  const camera = new THREE.PerspectiveCamera(15, 1, 0.1, 100);
  camera.position.set(0, 1.2, 10);
  camera.lookAt(0, 1.2, 0);
  const state = { position: { x: 0, y: 0, z: 0 }, height: 2.1 };
  assert.equal(personVisible(camera, state), true);
  assert.equal(personVisible(camera, { ...state, eventId: 'ride_bike' }), true);
  assert.equal(judgePhoto(camera, state), null);
  assert.equal(judgePhoto(camera, { ...state, eventId: 'ride_bike' }), 'ride_bike');
  assert.equal(judgePhoto(camera, { ...state, eventId: 'push_bike' }), null);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.2, 5);
  wall.updateMatrixWorld();
  assert.equal(personVisible(camera, state, { occluders: [wall] }), false);
  assert.equal(selectTarget([{ id: 'lily', state }], {
    project: () => ({ x: 0, y: 0, z: 0, height: 0.2 }),
    isUnblocked: () => personVisible(camera, state, { occluders: [wall] }),
  }).id, null);
  assert.equal(personVisible(camera, { ...state, position: { x: 8, y: 0, z: 0 } }), false);
  camera.fov = 70;
  camera.updateProjectionMatrix();
  assert.equal(personVisible(camera, state), false);
});
