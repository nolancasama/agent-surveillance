import * as THREE from 'three';

// Geometry and material caches are module-wide so all of the market's people use
// the same GPU resources. Character colour is still configurable per instance.
const GEOMETRY = Object.freeze({
  head: new THREE.SphereGeometry(0.19, 10, 8),
  torso: new THREE.BoxGeometry(0.42, 0.58, 0.24),
  limb: new THREE.BoxGeometry(0.13, 0.58, 0.14),
  hairCap: new THREE.SphereGeometry(0.205, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.43),
  hairLong: new THREE.BoxGeometry(0.36, 0.42, 0.12),
  hairSide: new THREE.BoxGeometry(0.08, 0.34, 0.18),
  hairBun: new THREE.SphereGeometry(0.12, 8, 6),
  eye: new THREE.SphereGeometry(0.026, 7, 5),
  mouth: new THREE.BoxGeometry(0.075, 0.018, 0.018),
  hand: new THREE.SphereGeometry(0.075, 7, 6),
  shoe: new THREE.BoxGeometry(0.16, 0.1, 0.27),
  skirt: new THREE.CylinderGeometry(0.27, 0.36, 0.46, 8),
  ribbon: new THREE.BoxGeometry(0.16, 0.08, 0.05),
  backpack: new THREE.BoxGeometry(0.31, 0.4, 0.15),
  phone: new THREE.BoxGeometry(0.1, 0.17, 0.025),
  bag: new THREE.BoxGeometry(0.3, 0.34, 0.12),
  stem: new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6),
  flower: new THREE.SphereGeometry(0.09, 7, 5),
  canBody: new THREE.CylinderGeometry(0.17, 0.19, 0.3, 8),
  canSpout: new THREE.CylinderGeometry(0.045, 0.075, 0.46, 7),
  canHandle: new THREE.TorusGeometry(0.18, 0.03, 6, 12, Math.PI),
  waterDrop: new THREE.CylinderGeometry(0.026, 0.026, 0.2, 5),
  wheel: new THREE.TorusGeometry(0.38, 0.035, 6, 18),
  spoke: new THREE.BoxGeometry(0.018, 0.68, 0.018),
  hub: new THREE.CylinderGeometry(0.035, 0.035, 0.12, 7),
  tube: new THREE.CylinderGeometry(0.035, 0.035, 1, 7),
  thinTube: new THREE.CylinderGeometry(0.025, 0.025, 1, 7),
  basket: new THREE.BoxGeometry(0.34, 0.22, 0.3),
  bikeSeat: new THREE.BoxGeometry(0.18, 0.07, 0.28),
  handlebar: new THREE.CylinderGeometry(0.025, 0.025, 0.44, 7),
  scooterDeck: new THREE.BoxGeometry(0.22, 0.08, 0.75),
  scooterStem: new THREE.CylinderGeometry(0.025, 0.025, 0.9, 7),
  scooterBar: new THREE.CylinderGeometry(0.025, 0.025, 0.42, 7),
  scooterWheel: new THREE.TorusGeometry(0.1, 0.025, 5, 12),
});

const MATERIALS = new Map();

function material(color, options = {}) {
  const key = `${color}:${options.transparent ? options.opacity ?? 1 : 1}`;
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshLambertMaterial({
      color,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? true,
    }));
  }
  return MATERIALS.get(key);
}

function mesh(geometry, color, name) {
  const result = new THREE.Mesh(geometry, material(color));
  result.name = name;
  return result;
}

function limb(color, skin, shoeColor, isLeg = false) {
  const pivot = new THREE.Group();
  const segment = mesh(GEOMETRY.limb, color, isLeg ? 'leg' : 'arm');
  segment.position.y = -0.29;
  pivot.add(segment);
  const end = mesh(isLeg ? GEOMETRY.shoe : GEOMETRY.hand, isLeg ? shoeColor : skin, isLeg ? 'shoe' : 'hand');
  end.position.set(0, isLeg ? -0.62 : -0.61, isLeg ? 0.065 : 0);
  pivot.add(end);
  return pivot;
}

function cylinderBetween(a, b, color, radius = 0.035) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const tube = new THREE.Mesh(
    radius === 0.035 ? GEOMETRY.tube : GEOMETRY.thinTube,
    material(color),
  );
  tube.position.copy(a).addScaledVector(delta, 0.5);
  tube.scale.y = delta.length();
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return tube;
}

export function createBouquet() {
  const bouquet = new THREE.Group();
  bouquet.name = 'bouquet';
  const colours = ['#f44362', '#ffbd3f', '#f8f1df', '#bd65df', '#ff765c'];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const stem = mesh(GEOMETRY.stem, '#3f8f4e', 'flower-stem');
    stem.position.set(Math.cos(angle) * 0.055, 0, Math.sin(angle) * 0.055);
    stem.rotation.z = Math.cos(angle) * 0.12;
    bouquet.add(stem);
    const bloom = mesh(GEOMETRY.flower, colours[i % colours.length], 'flower-bloom');
    bloom.position.set(Math.cos(angle) * 0.1, 0.23 + (i % 2) * 0.04, Math.sin(angle) * 0.1);
    bouquet.add(bloom);
  }
  bouquet.rotation.z = -0.25;
  bouquet.userData.isBouquet = true;
  return bouquet;
}

export function createWateringCan() {
  const can = new THREE.Group();
  can.name = 'watering-can';
  const body = mesh(GEOMETRY.canBody, '#55d4e8', 'watering-can-body');
  body.rotation.z = Math.PI / 2;
  can.add(body);
  const spout = mesh(GEOMETRY.canSpout, '#55d4e8', 'watering-can-spout');
  spout.position.set(0.36, 0.05, 0);
  spout.rotation.z = -Math.PI / 2.8;
  can.add(spout);
  const handle = new THREE.Mesh(GEOMETRY.canHandle, material('#32a9c1'));
  handle.position.y = 0.16;
  can.add(handle);

  const stream = new THREE.Group();
  stream.name = 'water-stream';
  stream.position.set(0.62, -0.1, 0);
  for (let i = 0; i < 9; i += 1) {
    const drop = new THREE.Mesh(GEOMETRY.waterDrop, material('#8be9ff', { transparent: true, opacity: 0.9 }));
    drop.position.set((i % 3 - 1) * 0.045, -i * 0.13, (i % 2) * 0.04);
    stream.add(drop);
  }
  stream.visible = false;
  can.add(stream);
  can.userData.stream = stream;
  return can;
}

export function createBike({ color = '#d94a52', basket = true } = {}) {
  const bike = new THREE.Group();
  bike.name = 'bike';
  const wheels = [];
  for (const z of [-0.72, 0.72]) {
    const wheel = mesh(GEOMETRY.wheel, '#242c34', 'bike-wheel');
    wheel.position.set(0, 0.39, z);
    wheel.rotation.y = Math.PI / 2;
    for (let spokeIndex = 0; spokeIndex < 3; spokeIndex += 1) {
      const spoke = mesh(GEOMETRY.spoke, '#aab5ba', 'bike-spoke');
      spoke.rotation.z = spokeIndex * Math.PI / 3;
      wheel.add(spoke);
    }
    bike.add(wheel);
    const hub = mesh(GEOMETRY.hub, '#c9d1d5', 'bike-hub');
    hub.position.copy(wheel.position);
    hub.rotation.z = Math.PI / 2;
    bike.add(hub);
    wheels.push(wheel);
  }
  const rear = new THREE.Vector3(0, 0.39, 0.72);
  const front = new THREE.Vector3(0, 0.39, -0.72);
  const crank = new THREE.Vector3(0, 0.48, 0.12);
  const seat = new THREE.Vector3(0, 0.9, 0.34);
  const bars = new THREE.Vector3(0, 0.94, -0.58);
  bike.add(
    cylinderBetween(rear, crank, color), cylinderBetween(front, crank, color),
    cylinderBetween(crank, seat, color), cylinderBetween(seat, rear, color),
    cylinderBetween(seat, front, color), cylinderBetween(front, bars, '#66727a', 0.025),
  );
  const saddle = mesh(GEOMETRY.bikeSeat, '#332b28', 'bike-seat');
  saddle.position.copy(seat);
  bike.add(saddle);
  const handlebar = mesh(GEOMETRY.handlebar, '#66727a', 'bike-handlebar');
  handlebar.position.copy(bars);
  handlebar.rotation.z = Math.PI / 2;
  bike.add(handlebar);
  if (basket) {
    const basketMesh = mesh(GEOMETRY.basket, '#9b6b3f', 'bike-basket');
    basketMesh.position.set(0, 0.83, -0.78);
    bike.add(basketMesh);
    bike.userData.basket = basketMesh;
    const basketBouquet = createBouquet();
    basketBouquet.name = 'basket-bouquet';
    basketBouquet.scale.setScalar(0.48);
    basketBouquet.position.set(0, 0.98, -0.78);
    basketBouquet.rotation.z = 0;
    basketBouquet.visible = false;
    bike.add(basketBouquet);
    bike.userData.basketBouquet = basketBouquet;
  }
  bike.userData.wheels = wheels;
  bike.userData.spin = (distance) => {
    for (const wheel of wheels) wheel.rotation.x = distance / 0.38;
  };
  return bike;
}

export function createScooter({ color = '#37b7d8' } = {}) {
  const scooter = new THREE.Group();
  scooter.name = 'scooter';
  scooter.add(mesh(GEOMETRY.scooterDeck, color, 'scooter-deck'));
  const stem = mesh(GEOMETRY.scooterStem, '#65727b', 'scooter-stem');
  stem.position.set(0, 0.46, -0.31);
  stem.rotation.x = -0.08;
  scooter.add(stem);
  const bar = mesh(GEOMETRY.scooterBar, '#65727b', 'scooter-bar');
  bar.position.set(0, 0.89, -0.35);
  bar.rotation.z = Math.PI / 2;
  scooter.add(bar);
  const wheels = [];
  for (const z of [-0.3, 0.3]) {
    const wheel = mesh(GEOMETRY.scooterWheel, '#242c34', 'scooter-wheel');
    wheel.position.set(0, -0.02, z);
    wheel.rotation.y = Math.PI / 2;
    scooter.add(wheel);
    wheels.push(wheel);
  }
  scooter.userData.wheels = wheels;
  return scooter;
}

const PERSON_DEFAULTS = Object.freeze({
  skin: '#c98d68',
  shirt: '#4f93c5',
  bottoms: '#42556b',
  shoes: '#333941',
  hair: '#3b2a22',
  hairStyle: 'short',
  skirt: false,
  ribbon: null,
  backpack: null,
});

export const LILY_APPEARANCE = Object.freeze({
  shirt: '#f4c518',
  bottoms: '#3972b7',
  skirt: true,
  hair: '#241a12',
  hairStyle: 'long',
  ribbon: '#d94a52',
  backpack: '#3eaf72',
});

export function createPerson(options = {}) {
  const isLily = options.id === 'lily' || options.name?.toLowerCase() === 'lily';
  const config = { ...PERSON_DEFAULTS, ...(isLily ? LILY_APPEARANCE : {}), ...options };
  const person = new THREE.Group();
  person.name = options.name || options.id || 'person';

  const body = new THREE.Group();
  body.name = 'upper-body';
  person.add(body);
  const torso = mesh(GEOMETRY.torso, config.shirt, 'torso');
  torso.position.y = 1.2;
  body.add(torso);
  const head = mesh(GEOMETRY.head, config.skin, 'head');
  head.position.y = 1.7;
  body.add(head);

  const hairCap = mesh(GEOMETRY.hairCap, config.hair, 'hair');
  hairCap.position.set(0, 1.72, -0.005);
  hairCap.rotation.x = -0.08;
  body.add(hairCap);
  if (config.hairStyle === 'long') {
    const longHair = mesh(GEOMETRY.hairLong, config.hair, 'long-hair');
    longHair.position.set(0, 1.51, -0.145);
    const leftHair = mesh(GEOMETRY.hairSide, config.hair, 'left-hair');
    const rightHair = mesh(GEOMETRY.hairSide, config.hair, 'right-hair');
    leftHair.position.set(-0.17, 1.57, -0.02);
    rightHair.position.set(0.17, 1.57, -0.02);
    body.add(longHair, leftHair, rightHair);
  } else if (config.hairStyle === 'bun') {
    const bun = mesh(GEOMETRY.hairBun, config.hair, 'hair-bun');
    bun.position.set(0, 1.83, -0.14);
    body.add(bun);
  }

  // Local +z is the character's forward/walking direction. Keep the face on
  // that side so route headings and evidence close-ups show the same front.
  for (const x of [-0.065, 0.065]) {
    const eye = mesh(GEOMETRY.eye, '#302824', 'eye');
    eye.position.set(x, 1.72, 0.18);
    body.add(eye);
  }
  const mouth = mesh(GEOMETRY.mouth, '#7b3f43', 'mouth');
  mouth.position.set(0, 1.645, 0.187);
  body.add(mouth);
  if (config.ribbon) {
    const ribbon = mesh(GEOMETRY.ribbon, config.ribbon, 'hair-ribbon');
    ribbon.position.set(0.18, 1.78, -0.1);
    ribbon.rotation.z = -0.4;
    body.add(ribbon);
  }
  if (config.backpack) {
    const backpack = mesh(GEOMETRY.backpack, config.backpack, 'backpack');
    backpack.position.set(0, 1.2, -0.2);
    body.add(backpack);
  }

  const leftArm = limb(config.shirt, config.skin, config.shoes);
  const rightArm = limb(config.shirt, config.skin, config.shoes);
  leftArm.name = 'left-arm';
  rightArm.name = 'right-arm';
  leftArm.position.set(-0.28, 1.43, 0);
  rightArm.position.set(0.28, 1.43, 0);
  body.add(leftArm, rightArm);

  const legColor = config.bottoms;
  const leftLeg = limb(legColor, config.skin, config.shoes, true);
  const rightLeg = limb(legColor, config.skin, config.shoes, true);
  leftLeg.name = 'left-leg';
  rightLeg.name = 'right-leg';
  leftLeg.position.set(-0.12, 0.88, 0);
  rightLeg.position.set(0.12, 0.88, 0);
  person.add(leftLeg, rightLeg);
  let skirt = null;
  if (config.skirt) {
    skirt = mesh(GEOMETRY.skirt, legColor, 'skirt');
    skirt.position.y = 0.91;
    person.add(skirt);
  }

  const bouquet = createBouquet();
  bouquet.position.set(0, -0.67, -0.05);
  bouquet.scale.setScalar(0.82);
  bouquet.visible = false;
  rightArm.add(bouquet);
  const wateringCan = createWateringCan();
  wateringCan.position.set(0, -0.68, 0.08);
  wateringCan.scale.setScalar(1.15);
  wateringCan.visible = false;
  rightArm.add(wateringCan);
  // Keep the stream in person space rather than under the animated arm. That
  // lets it fall onto the bed while the can itself is held forward at +z.
  const waterStream = wateringCan.userData.stream;
  wateringCan.remove(waterStream);
  waterStream.position.set(0.7, 1.25, 1.1);
  person.add(waterStream);
  const phone = mesh(GEOMETRY.phone, '#18242f', 'phone');
  phone.position.set(0, -0.65, -0.09);
  phone.visible = false;
  rightArm.add(phone);
  const shoppingBag = mesh(GEOMETRY.bag, options.bagColor || '#ffbd3f', 'shopping-bag');
  shoppingBag.position.set(0, -0.78, 0);
  shoppingBag.visible = false;
  leftArm.add(shoppingBag);

  const bike = isLily || options.bike || options.vehicle === 'bike'
    ? createBike({ color: options.bikeColor || '#d94a52' })
    : new THREE.Group();
  bike.name = 'bike';
  bike.visible = false;
  person.add(bike);
  const scooter = options.scooter || options.vehicle === 'scooter'
    ? createScooter({ color: options.scooterColor || '#37b7d8' })
    : new THREE.Group();
  scooter.name = 'scooter';
  scooter.visible = false;
  scooter.position.x = 0.16;
  person.add(scooter);

  person.userData.isPerson = true;
  person.userData.personId = options.id || null;
  person.userData.rig = {
    body, torso, head, leftArm, rightArm, leftLeg, rightLeg, skirt,
    bouquet, wateringCan, waterStream,
    phone, shoppingBag, bike, scooter,
  };
  person.userData.baseScale = options.scale ?? 1;
  person.scale.setScalar(person.userData.baseScale);
  person.userData.update = (state, time) => updatePerson(person, state, time);
  person.userData.setPose = person.userData.update;
  return person;
}

function propEnabled(props, key) {
  if (Array.isArray(props)) return props.includes(key);
  if (typeof props === 'string') return props === key;
  return Boolean(props?.[key]);
}

function resetRig(rig) {
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  for (const part of [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg]) {
    part.rotation.set(0, 0, 0);
  }
  rig.bike.position.set(0, 0, 0);
  rig.bike.rotation.set(0, 0, 0);
  rig.scooter.position.set(0.16, 0, 0);
  rig.wateringCan.rotation.set(0, 0, 0);
}

/**
 * Apply a route/ambient pose to a person. The updater deliberately accepts the
 * common field variants used by both simulation modules (animation/action and
 * props/propsHeld), keeping the renderer independent of their data format.
 */
export function updatePerson(person, state = {}, time = 0) {
  const rig = person.userData.rig;
  if (!rig) return person;
  const position = state.position || state.pos;
  if (position) person.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  if (Number.isFinite(state.heading)) person.rotation.y = state.heading;
  const rawAction = state.animationState || state.animation || state.action || 'idle';
  const action = ({
    smell: 'smell_flowers', buy: 'buy_flowers', water: 'water_flowers',
    bike_push: 'push_bike', pushBike: 'push_bike', bike_ride: 'ride_bike',
    rideBike: 'ride_bike', scooter: 'ride_scooter', browse: 'idle',
    sit_down: 'sit', stand_up: 'sit', check_phone: 'phone',
  })[rawAction] || rawAction;
  const props = state.propsHeld || state.heldProps || state.props || {};
  const phase = state.phase ?? time;
  const swing = Math.sin(phase * 7);
  resetRig(rig);

  const hasBouquet = propEnabled(props, 'bouquet') || propEnabled(props, 'flowers') || action === 'buy_flowers';
  const hasCan = propEnabled(props, 'wateringCan') || propEnabled(props, 'watering_can') || action === 'water_flowers';
  const usesBike = propEnabled(props, 'bike') || ['push_bike', 'ride_bike', 'pedal'].includes(action);
  const usesScooter = propEnabled(props, 'scooter') || action === 'ride_scooter';
  if (usesBike && !rig.bike.userData.wheels) {
    person.remove(rig.bike);
    rig.bike = createBike({ color: state.bikeColor || '#d94a52' });
    person.add(rig.bike);
  }
  if (usesScooter && !rig.scooter.userData.wheels) {
    person.remove(rig.scooter);
    rig.scooter = createScooter({ color: state.scooterColor || '#37b7d8' });
    rig.scooter.position.x = 0.16;
    person.add(rig.scooter);
  }
  rig.bouquet.visible = hasBouquet;
  rig.wateringCan.visible = hasCan;
  rig.phone.visible = propEnabled(props, 'phone') || ['phone', 'look_phone', 'sit_phone'].includes(action);
  rig.shoppingBag.visible = propEnabled(props, 'shoppingBag') || propEnabled(props, 'bag');
  rig.bike.visible = usesBike;
  rig.scooter.visible = usesScooter;
  rig.waterStream.visible = action === 'water_flowers' || Boolean(state.waterStream);

  if (['walk', 'carry', 'push_bike'].includes(action)) {
    rig.leftArm.rotation.x = swing * 0.58;
    rig.rightArm.rotation.x = -swing * 0.58;
    rig.leftLeg.rotation.x = -swing * 0.65;
    rig.rightLeg.rotation.x = swing * 0.65;
  } else if (['sit', 'sit_phone'].includes(action)) {
    rig.body.position.y = -0.4;
    rig.leftLeg.rotation.x = -1.25;
    rig.rightLeg.rotation.x = -1.25;
    rig.leftArm.rotation.x = -0.35;
    rig.rightArm.rotation.x = -0.35;
    if (action === 'sit_phone') {
      rig.rightArm.rotation.x = -1.25;
      rig.rightArm.rotation.z = 0.28;
      rig.leftArm.rotation.x = -0.95;
      rig.head.rotation.x = 0.3;
    }
  } else if (['lock_bike', 'tie_shoe'].includes(action)) {
    rig.body.rotation.x = -0.7;
    rig.body.position.y = -0.15;
    rig.leftArm.rotation.x = -1.1;
    rig.rightArm.rotation.x = -1.1;
    rig.head.rotation.x = 0.35;
  } else if (['phone', 'look_phone'].includes(action)) {
    rig.rightArm.rotation.x = -1.25;
    rig.rightArm.rotation.z = 0.28;
    rig.leftArm.rotation.x = -0.95;
    rig.head.rotation.x = 0.3;
  } else if (['talk', 'gesture'].includes(action)) {
    rig.rightArm.rotation.x = -0.85 + Math.sin(phase * 3) * 0.18;
    rig.rightArm.rotation.z = -0.55;
    rig.head.rotation.y = Math.sin(phase * 1.5) * 0.16;
  } else if (action === 'wave') {
    rig.rightArm.rotation.z = -2.45;
    rig.rightArm.rotation.y = Math.sin(phase * 7) * 0.35;
  } else if (['bend', 'smell_flowers'].includes(action)) {
    rig.body.rotation.x = -0.62;
    rig.body.position.z = -0.18;
    rig.head.rotation.x = 0.28;
    rig.leftArm.rotation.x = -0.35;
    rig.rightArm.rotation.x = -0.35;
  } else if (action === 'buy_flowers') {
    rig.leftArm.rotation.x = -1.18;
    rig.rightArm.rotation.x = -1.12;
    rig.rightArm.rotation.z = -0.18;
  } else if (action === 'water_flowers') {
    rig.body.rotation.x = -0.18;
    rig.rightArm.rotation.x = -1.35;
    rig.rightArm.rotation.z = -0.25;
    rig.wateringCan.rotation.z = -0.6;
    const drops = rig.waterStream.children;
    for (let i = 0; i < drops.length; i += 1) {
      drops[i].position.y = -i * 0.14 - ((phase * 1.7 + i * 0.13) % 0.18);
    }
  } else if (['ride_bike', 'pedal'].includes(action)) {
    rig.body.position.y = 0.15;
    rig.body.rotation.x = -0.17;
    rig.leftArm.rotation.x = -1.08;
    rig.rightArm.rotation.x = -1.08;
    rig.leftLeg.rotation.x = Math.sin(phase * 7) * 0.82;
    rig.rightLeg.rotation.x = Math.sin(phase * 7 + Math.PI) * 0.82;
    rig.bike.userData.spin(phase * 3.6);
  } else if (action === 'ride_scooter') {
    rig.body.position.y = 0.05;
    rig.leftArm.rotation.x = -1.08;
    rig.rightArm.rotation.x = -1.08;
    rig.leftLeg.rotation.x = 0.12;
    rig.rightLeg.rotation.x = -0.42 + Math.sin(phase * 6) * 0.35;
    for (const wheel of rig.scooter.userData.wheels) wheel.rotation.x = phase * 9;
  }

  if (action === 'push_bike') rig.bike.position.x = 0.68;
  if (hasBouquet && rig.bike.visible && !['buy_flowers'].includes(action)) {
    // Segment 11 onward stores the bouquet in the basket rather than Lily's hand.
    rig.bouquet.visible = false;
    if (rig.bike.userData.basket) {
      rig.bike.userData.basket.material = material('#9b6b3f');
      rig.bike.userData.basketBouquet.visible = true;
    }
  } else if (rig.bike.userData.basketBouquet) {
    rig.bike.userData.basketBouquet.visible = false;
  }
  person.visible = state.visible !== false;
  return person;
}

export function disposePeopleResources() {
  for (const geometry of Object.values(GEOMETRY)) geometry.dispose();
  for (const item of MATERIALS.values()) item.dispose();
  MATERIALS.clear();
}

export { GEOMETRY as SHARED_PERSON_GEOMETRIES, MATERIALS as SHARED_PERSON_MATERIALS };
export const buildPerson = createPerson;
export const applyPersonPose = updatePerson;
