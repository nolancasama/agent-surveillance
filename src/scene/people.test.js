import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPerson, updatePerson, PERSON_HEIGHT, rigBoneGroups, copyRigToBones, attachLilyBody } from './people.js';

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

const BONE_NAMES = [
  'pelvis', 'body', 'head',
  'left-arm-upper', 'left-arm-lower', 'left-arm-end',
  'right-arm-upper', 'right-arm-lower', 'right-arm-end',
  'left-leg-upper', 'left-leg-lower', 'left-leg-end',
  'right-leg-upper', 'right-leg-lower', 'right-leg-end',
];

test('frozen bone mapping copies local rotations and animated translations without changing limb offsets', () => {
  const rig = createPerson({ id: 'lily' }).userData.rig;
  const groups = rigBoneGroups(rig);
  assert.deepEqual(Object.keys(groups).sort(), [...BONE_NAMES].sort());
  assert.equal(groups['left-arm-upper'], rig.leftArm.upper);
  assert.equal(groups['left-leg-upper'], rig.leftLeg.upper);
  assert.equal(rig.leftArm.side, -1);
  assert.equal(rig.leftLeg.side, -1);
  const bones = Object.fromEntries(BONE_NAMES.map(name => [name, new THREE.Bone()]));
  for (const [i, name] of BONE_NAMES.entries()) {
    groups[name].rotation.set(i * .07, i * -.04, i * .03);
    bones[name].position.set(3, 4, 5);
  }
  rig.pelvis.position.set(.1, .63, -.28);
  rig.body.position.set(.02, .03, .04);
  rig.head.position.set(.01, .87, -.02);
  copyRigToBones(rig, bones);
  for (const name of BONE_NAMES) {
    assert.ok(bones[name].quaternion.equals(groups[name].quaternion), name);
    assert.ok(bones[name].position.equals(['pelvis', 'body', 'head'].includes(name)
      ? groups[name].position : new THREE.Vector3(3, 4, 5)), name);
    assert.notEqual(bones[name].quaternion, groups[name].quaternion);
  }
});

function mockLilyBody(rig) {
  const model = new THREE.Group();
  for (const [name, group] of Object.entries(rigBoneGroups(rig))) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.copy(group.position);
    model.add(bone);
  }
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({
    vertexColors: true, map: new THREE.Texture(),
  }), new THREE.MeshStandardMaterial({ name: 'Lily_Game_Hair', vertexColors: true })]);
  model.add(mesh);
  return { model, mesh };
}

test('Lily skin hides only her old body, inherits scale and follows final IK with props intact', () => {
  const person = createPerson({ id: 'lily', scale: .8, scooter: true });
  const rig = person.userData.rig;
  const { model, mesh } = mockLilyBody(rig);
  const originalMeshes = [];
  rig.pelvis.traverseVisible(object => { if (object.isMesh) originalMeshes.push(object); });
  const props = [rig.bouquet, rig.wateringCan, rig.waterStream, rig.phone, rig.money,
    rig.shoppingBag, rig.bike, rig.scooter];
  const parents = props.map(prop => prop.parent);
  attachLilyBody(person, model);
  assert.ok(originalMeshes.every(object => !object.visible));
  assert.equal(model.parent, person);
  assert.equal(person.scale.x, .8);
  assert.equal(model.scale.x, 1);
  assert.ok(mesh.material.every(material => material.isMeshLambertMaterial && material.vertexColors));
  assert.equal(mesh.material[0].map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(mesh.material[1].color.getHexString(), '241a12');
  assert.equal(mesh.frustumCulled, false);
  for (const [i, animation] of ['walk', 'smell_flowers', 'buy_flowers', 'water_flowers', 'phone', 'ride_bike', 'ride_scooter'].entries()) {
    updatePerson(person, { animation, segmentProgress: .5 }, i * 10 + 1);
    for (const [name, group] of Object.entries(rigBoneGroups(rig))) {
      assert.ok(rig.skinBones[name].quaternion.equals(group.quaternion), `${animation}: ${name}`);
    }
    assert.deepEqual(props.map(prop => prop.parent), parents);
    if (animation === 'water_flowers') assert.ok(rig.wateringCan.visible && rig.waterStream.visible);
    if (animation === 'phone') assert.ok(rig.phone.visible);
    if (animation === 'ride_bike') assert.ok(rig.bike.visible);
  }
  const npc = createPerson({ id: 'npc' });
  attachLilyBody(npc, model);
  assert.equal(model.parent, person);
  assert.ok(npc.userData.rig.torso.visible);
});

test('invalid Lily skeleton leaves the procedural fallback body intact', () => {
  const person = createPerson({ id: 'lily' });
  assert.throws(() => attachLilyBody(person, new THREE.Group()), /missing bone pelvis/);
  assert.ok(person.userData.rig.torso.visible);
  assert.equal(person.userData.rig.skinBones, undefined);
});
