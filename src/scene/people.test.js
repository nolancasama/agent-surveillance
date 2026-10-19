import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPerson, updatePerson, PERSON_HEIGHT } from './people.js';

function localEnd(person, limb) {
  return person.worldToLocal(limb.end.getWorldPosition(new THREE.Vector3()));
}

test('neutral rig silhouette matches the photo height and stays within its mesh budget', () => {
  const person = createPerson({ id: 'lily' });
  updatePerson(person, { animation: 'idle' }, 0);
  person.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let meshes = 0;
  person.traverseVisible(object => {
    if (!object.isMesh) return;
    meshes++;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  assert.ok(Math.abs(bounds.max.y - PERSON_HEIGHT) < .001);
  assert.ok(bounds.min.y > -.01 && bounds.min.y < .01);
  assert.ok(meshes <= 25);
  const second = createPerson({ id: 'lily' });
  assert.equal(person.userData.rig.head.children[0].geometry, second.userData.rig.head.children[0].geometry);
});

test('rider hands stay on the bars and both feet follow a complete pedal revolution', () => {
  const person = createPerson({ id: 'lily' });
  for (let i = 0; i <= 24; i++) {
    // Separate absolute seeks avoid transition blending in this geometric check.
    const time = i * Math.PI * 2 / 5 + i * Math.PI / 60;
    updatePerson(person, { animation: 'ride_bike', props: ['bike'] }, time);
    person.updateMatrixWorld(true);
    const r = person.userData.rig;
    for (const [index, side] of [-1, 1].entries()) {
      const hand = localEnd(person, [r.leftArm, r.rightArm][index]);
      assert.ok(hand.distanceTo(new THREE.Vector3(side * .28, 1.42, .6)) < .002);
      const ankle = localEnd(person, [r.leftLeg, r.rightLeg][index]);
      const expected = new THREE.Vector3(side * .19,
        .46 - side * Math.cos(time * 5) * .21 + .113,
        -.1 - side * Math.sin(time * 5) * .21 - .055);
      assert.ok(ankle.distanceTo(expected) < .002);
    }
  }
});

test('pushing has a separate walking stance with both hands touching the crossbar', () => {
  const person = createPerson({ id: 'lily' });
  updatePerson(person, { animation: 'push_bike', props: ['bike'] }, 145.1);
  person.updateMatrixWorld(true);
  const r = person.userData.rig;
  const near = localEnd(person, r.leftArm), inner = localEnd(person, r.rightArm);
  assert.ok(near.distanceTo(new THREE.Vector3(.20, 1.42, .34)) < .002);
  assert.ok(inner.distanceTo(new THREE.Vector3(.40, 1.42, .34)) < .002);
  assert.ok(r.bike.position.x > .4);
});
