import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPerson, updatePerson, PERSON_HEIGHT } from './people.js';
import { CHILD_BIKE_SCALE as S } from './personProps.js';

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

test('rider hands stay on the grips and both feet follow a complete pedal revolution', () => {
  const person = createPerson({ id: 'lily' });
  for (let i = 0; i <= 24; i++) {
    // Separate absolute seeks avoid transition blending in this geometric check.
    const time = i * Math.PI * 2 / 5 + i * Math.PI / 60;
    updatePerson(person, { animation: 'ride_bike', props: ['bike'] }, time);
    person.updateMatrixWorld(true);
    const r = person.userData.rig;
    assert.equal(r.bike.scale.x, S);
    for (const [index, side] of [-1, 1].entries()) {
      const hand = localEnd(person, [r.leftArm, r.rightArm][index]);
      assert.ok(hand.distanceTo(new THREE.Vector3(side * .24 * S, 1.42 * S, .6 * S)) < .002);
      const ankle = localEnd(person, [r.leftLeg, r.rightLeg][index]);
      const expected = new THREE.Vector3(side * .19 * S,
        (.46 - side * Math.cos(time * 5) * .21) * S + .113,
        (-.1 - side * Math.sin(time * 5) * .21) * S - .055);
      assert.ok(ankle.distanceTo(expected) < .002);
    }
  }
});

test('pushing steers with the near hand on the near grip while the far arm swings', () => {
  const person = createPerson({ id: 'lily' });
  updatePerson(person, { animation: 'push_bike', props: ['bike'] }, 145.1);
  person.updateMatrixWorld(true);
  const r = person.userData.rig;
  const near = localEnd(person, r.rightArm), far = localEnd(person, r.leftArm);
  assert.ok(near.distanceTo(new THREE.Vector3(.48 - .24 * S, 1.42 * S, .6 * S - .26)) < .002);
  assert.ok(far.x < 0 && far.y < 1.05, `far hand ${far.toArray()}`);
  assert.ok(r.bike.position.x > .4);
});
