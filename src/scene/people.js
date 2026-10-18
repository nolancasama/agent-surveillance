import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleWorkerBody } from './workerBody.js';
import { createBouquet, createWateringCan, createBike, createScooter } from './personProps.js';

export { createBouquet, createWateringCan, createBike, createScooter };
// Measured neutral silhouette, including the hair crown. Shared with projection.
export const PERSON_HEIGHT = 2.09;
export const PERSON_TORSO = 1.24;
const G = {
  sphere: new THREE.SphereGeometry(1, 8, 5),
  head: new THREE.SphereGeometry(1, 12, 8),
  round: new RoundedBoxGeometry(1, 1, 1, 1, 0.16),
  torso: new THREE.LatheGeometry([
    new THREE.Vector2(.20, -.28), new THREE.Vector2(.23, -.24),
    new THREE.Vector2(.25, .13), new THREE.Vector2(.23, .23),
    new THREE.Vector2(.15, .28), new THREE.Vector2(0, .28),
  ], 12),
  skirt: new THREE.CylinderGeometry(.235, .35, .34, 12),
  capsule: new THREE.CapsuleGeometry(1, 1, 3, 8),
  cap: new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * .43),
  tube: new THREE.CylinderGeometry(1, 1, 1, 8),
  torus: new THREE.TorusGeometry(1, .13, 5, 12),
};
const MATERIALS = new Map();
const COMPOSITES = new Map();
// A draped front hem covers bent thighs while preserving the fitted waist.
const drapedSkirt = new THREE.CylinderGeometry(.235, .35, .34, 12, 3);
for (let i = 0; i < drapedSkirt.attributes.position.count; i++) {
  const positions = drapedSkirt.attributes.position;
  const z = positions.getZ(i);
  if (z > 0) positions.setZ(i, z * (1 + (.17 - positions.getY(i)) / .34));
}
drapedSkirt.computeVertexNormals();
G.drapedSkirt = drapedSkirt;
function material(color, unlit = false) {
  const key = unlit ? `unlit:${color}` : color;
  if (!MATERIALS.has(key)) MATERIALS.set(key, unlit
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial(color === 'vertex' ? { vertexColors: true } : { color }));
  return MATERIALS.get(key);
}
const part = (geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) =>
  ({ geometry, color, position, scale, rotation });

// All the face/hair pieces and fixed clothing details are one draw per assembly.
function combined(key, parts) {
  if (!COMPOSITES.has(key)) {
    const geometries = parts.map(p => {
      const geometry = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
      geometry.deleteAttribute('uv');
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)),
        new THREE.Vector3(...p.scale),
      );
      geometry.applyMatrix4(transform);
      const color = new THREE.Color(p.color);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    COMPOSITES.set(key, merged);
  }
  return new THREE.Mesh(COMPOSITES.get(key), material('vertex'));
}
function ellipsoid(color, position, scale, rotation) {
  return part(G.sphere, color, position, scale, rotation);
}
function capsule(color, length, radius, centre = [0, -length / 2, 0]) {
  // Unit capsule is three units long; shrink its caps without shortening the chain.
  const geometryKey = `capsule:${length}:${radius}`;
  if (!COMPOSITES.has(geometryKey)) COMPOSITES.set(geometryKey,
    new THREE.CapsuleGeometry(radius, Math.max(.01, length - 2 * radius), 3, 8));
  return part(COMPOSITES.get(geometryKey), color, centre);
}

const DEFAULTS = {
  skin: '#d7a17d', shirt: '#4f93c5', bottoms: '#42556b', shoes: '#3b3c50',
  hair: '#3b2a22', hairStyle: 'short', skirt: false, ribbon: null, backpack: null,
};
export const LILY_APPEARANCE = Object.freeze({
  skin: '#f2c39c', shirt: '#f4c518', bottoms: '#3972b7', skirt: true,
  hair: '#241a12', hairStyle: 'long', ribbon: '#e74451', backpack: '#3eaf72',
});

/** Frozen GLB interface; left is the rig's negative-X side. */
export function rigBoneGroups(rig) {
  const groups = { pelvis: rig.pelvis, body: rig.body, head: rig.head };
  for (const [name, limb] of [
    ['left-arm', rig.leftArm], ['right-arm', rig.rightArm],
    ['left-leg', rig.leftLeg], ['right-leg', rig.rightLeg],
  ]) for (const joint of ['upper', 'lower', 'end']) groups[`${name}-${joint}`] = limb[joint];
  return groups;
}

/** The asset has identity rest rotations and the same local joint offsets. */
export function copyRigToBones(rig, bones) {
  for (const [name, group] of Object.entries(rigBoneGroups(rig))) {
    bones[name].quaternion.copy(group.quaternion);
    // Pelvis bobs/sits; copying body/head also preserves any translated poses.
    if (name === 'pelvis' || name === 'body' || name === 'head') bones[name].position.copy(group.position);
  }
}

export function attachLilyBody(person, model) {
  if (!person.userData.isLily) return;
  const rig = person.userData.rig;
  const bones = {};
  model.traverse(object => { if (object.isBone) bones[object.name] = object; });
  for (const name of Object.keys(rigBoneGroups(rig))) {
    if (!bones[name]) throw new Error(`Lily GLB is missing bone ${name}`);
  }
  const materials = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const convert = source => {
      if (!materials.has(source)) {
        if (source.map) source.map.colorSpace = THREE.SRGBColorSpace;
        materials.set(source, new THREE.MeshLambertMaterial({
          // The dedicated matte locks primitive exports white COLOR_0 and no
          // base-colour factor; restore its frozen hair palette at conversion.
          color: source.name === 'Lily_Game_Hair' ? LILY_APPEARANCE.hair : source.color,
          map: source.map, vertexColors: source.vertexColors,
          side: source.side, transparent: source.transparent, opacity: source.opacity,
          alphaTest: source.alphaTest, depthWrite: source.depthWrite,
        }));
      }
      return materials.get(source);
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  copyRigToBones(rig, bones);
  person.add(model); // Inherits baseScale once, alongside the procedural rig/props.
  rig.skinBones = bones;
  // Hide the body meshes themselves, never a joint or a hand-held prop subtree.
  for (const group of Object.values(rigBoneGroups(rig))) {
    for (const child of group.children) {
      if (child.isMesh && ![rig.bouquet, rig.wateringCan, rig.phone, rig.money, rig.shoppingBag].includes(child)) {
        child.visible = false;
      }
    }
  }
}

/** Start during briefing; on failure the original body remains usable. */
export async function loadLilyBody(person) {
  try {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/lily.glb`);
    attachLilyBody(person, gltf.scene);
  } catch (error) {
    console.warn('Lily GLB could not be loaded; keeping the procedural body.', error);
  }
}

function createHead(c) {
  const pieces = [part(G.head, c.skin, [0, 0, 0], [.255, .275, .225]),
    part(G.cap, c.hair, [0, .03, -.025], [.274, .28, .25])];
  for (const side of [-1, 1]) {
    pieces.push(ellipsoid(c.skin, [side * .247, -.015, 0], [.047, .068, .048]));
    pieces.push(ellipsoid('#fff8e9', [side * .089, .013, .205], [.061, .074, .026]));
    pieces.push(ellipsoid('#493226', [side * .084, .009, .228], [.036, .048, .013]));
    pieces.push(ellipsoid('#171b27', [side * .084, .012, .239], [.022, .032, .008]));
    pieces.push(ellipsoid('#ffffff', [side * .084 - .01, .032, .246], [.012, .014, .006]));
    pieces.push(ellipsoid(c.hair, [side * .09, .112, .208], [.064, .013, .017], [0, 0, side * -.12]));
    pieces.push(ellipsoid('#e99c8c', [side * .158, -.068, .183], [.045, .022, .012]));
  }
  pieces.push(ellipsoid(c.skin, [0, -.047, .223], [.029, .036, .032]));
  pieces.push(ellipsoid('#9e5354', [0, -.123, .199], [.057, .023, .014]));
  pieces.push(ellipsoid('#fff1df', [0, -.113, .208], [.038, .008, .006]));
  // Swept fringe leaves both eyes clear on +z, with no full hair shell over the face.
  const style = c.hairStyle;
  if (style !== 'cap') {
    pieces.push(ellipsoid(c.hair, [-.12, .17, .12], [.14, .09, .11], [0, 0, -.48]));
    pieces.push(ellipsoid(c.hair, [.16, .14, .09], [.09, .12, .12], [0, 0, .3]));
  }
  if (['long', 'bob', 'ponytail', 'bun'].includes(style)) {
    const long = style === 'long';
    pieces.push(ellipsoid(c.hair, [0, .03, -.165], [.25, .19, .13]));
    // Two side locks frame the face; the back ends above the backpack's top.
    pieces.push(ellipsoid(c.hair, [0, long ? -.14 : -.10, -.15], [.25, long ? .24 : .23, .12]));
    for (const side of [-1, 1]) pieces.push(ellipsoid(c.hair,
      [side * .222, long ? -.22 : -.12, -.025], [.069, long ? .34 : .23, .14], [0, 0, side * .05]));
    if (style === 'ponytail' || style === 'bun') {
      pieces.push(ellipsoid(c.hair, [0, .02, -.32], [.13, style === 'bun' ? .14 : .29, .14]));
    }
  } else if (style === 'curly' || style === 'spiky') {
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      pieces.push(ellipsoid(c.hair, [Math.cos(a) * .19, .19 + (i % 2) * .025, Math.sin(a) * .16], [.10, .11, .10]));
    }
  } else if (style === 'cap') {
    pieces.push(part(G.cap, c.shirt, [0, .06, -.02], [.285, .29, .26]));
    pieces.push(ellipsoid(c.shirt, [0, .13, .23], [.27, .035, .17]));
  }
  if (c.ribbon) {
    for (const side of [-1, 1]) pieces.push(ellipsoid(c.ribbon,
      [.24 + side * .045, .08 + side * .025, -.025], [.065, .055, .028], [0, 0, side * .5]));
    pieces.push(ellipsoid(c.ribbon, [.24, .08, .005], [.025, .032, .027]));
  }
  const head = combined(`head:${c.skin}:${c.hair}:${style}:${c.ribbon}:${c.shirt}`, pieces);
  head.name = 'face-and-hair';
  return head;
}

function chain(c, isLeg, side) {
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  const end = new THREE.Group();
  const a = isLeg ? .43 : .31;
  const b = isLeg ? .40 : .30;
  const upperColor = isLeg ? (c.skirt ? c.skin : c.bottoms) : c.shirt;
  const lowerColor = isLeg && !c.skirt && !c.shorts ? c.bottoms : c.skin;
  const upperParts = [capsule(upperColor, a + .06, isLeg ? .092 : .081, [0, -a / 2, 0])];
  if (!isLeg) upperParts.push(capsule(c.skin, .14, .067, [0, -a + .025, 0]));
  upper.add(combined(`upper:${upperColor}:${c.skin}:${isLeg}`, upperParts));
  const lowerParts = [capsule(lowerColor, b + .05, isLeg ? .075 : .06, [0, -b / 2, 0])];
  if (!isLeg) lowerParts.push(ellipsoid(c.skin, [0, -b, .012], [.071, .083, .062]));
  lower.add(combined(`lower:${lowerColor}:${isLeg}`, lowerParts));
  if (isLeg) end.add(combined(`shoe:${c.shoes}`, [
    part(G.round, c.shoes, [0, -.025, .055], [.18, .13, .30]),
    part(G.round, '#efe3cc', [0, -.077, .06], [.183, .037, .30]),
    part(G.round, '#fff0da', [0, .028, .06], [.085, .016, .08]),
  ]));
  lower.position.y = -a;
  end.position.y = -b;
  upper.add(lower);
  lower.add(end);
  upper.name = `${side < 0 ? 'left' : 'right'}-${isLeg ? 'leg' : 'arm'}`;
  return { upper, lower, end, a, b, side };
}

export function createPerson(options = {}) {
  const lily = options.id === 'lily' || options.name?.toLowerCase() === 'lily';
  const c = { ...DEFAULTS, ...(lily ? LILY_APPEARANCE : {}), ...options };
  const person = new THREE.Group();
  person.name = options.name || options.id || 'person';
  const pelvis = new THREE.Group(); pelvis.position.y = .92;
  const body = new THREE.Group();
  pelvis.add(body); person.add(pelvis);
  const torsoPieces = [part(G.torso, c.shirt, [0, .32, 0], [1, 1, .70]),
    capsule(c.skin, .14, .083, [0, .66, 0]),
    ellipsoid(c.shirt, [-.23, .52, 0], [.10, .10, .12]),
    ellipsoid(c.shirt, [.23, .52, 0], [.10, .10, .12])];
  if (c.jacket) for (const side of [-1, 1]) torsoPieces.push(part(G.round, c.jacket,
    [side * .13, .33, .115], [.20, .51, .07]));
  if (c.backpack) {
    torsoPieces.push(part(G.round, c.backpack, [0, .28, -.255], [.34, .38, .20]));
    torsoPieces.push(part(G.round, '#28764e', [0, .20, -.365], [.25, .15, .04]));
    for (const side of [-1, 1]) torsoPieces.push(part(G.round, c.backpack,
      [side * .15, .37, .16], [.045, .36, .034]));
  }
  const torso = combined(`torso:${JSON.stringify(c)}`, torsoPieces); body.add(torso);
  const hips = combined(`hips:${c.bottoms}:${c.skirt}`, [
    part(c.skirt ? G.skirt : G.round, c.bottoms, [0, c.skirt ? -.045 : 0, 0], c.skirt ? [1, 1, .88] : [.35, .20, .25]),
  ]); pelvis.add(hips);
  const activeSkirt = c.skirt ? combined(`draped-skirt:${c.bottoms}`, [
    part(G.drapedSkirt, c.bottoms, [0, -.045, 0], [1, 1, .88]),
  ]).geometry : null;
  const head = new THREE.Group(); head.position.y = .86; head.add(createHead(c)); body.add(head);
  const leftArm = chain(c, false, -1), rightArm = chain(c, false, 1);
  const leftLeg = chain(c, true, -1), rightLeg = chain(c, true, 1);
  for (const arm of [leftArm, rightArm]) { arm.upper.position.set(arm.side * .30, .56, 0); body.add(arm.upper); }
  for (const leg of [leftLeg, rightLeg]) { leg.upper.position.x = leg.side * .125; pelvis.add(leg.upper); }
  const bouquet = createBouquet(); rightArm.end.add(bouquet);
  const wateringCan = createWateringCan(); rightArm.end.add(wateringCan);
  const phone = combined('phone', [part(G.round, '#273344', [0, .05, .025], [.12, .21, .028]),
    part(G.round, '#8cdde2', [0, .055, .043], [.095, .15, .008])]); rightArm.end.add(phone);
  const money = combined('money', [part(G.round, '#91bb72', [.08, .13, .08], [.23, .13, .018]),
    ellipsoid('#f4ead5', [.08, .13, .094], [.045, .035, .008])]); rightArm.end.add(money);
  const shoppingBag = combined(`bag:${options.bagColor}`, [
    part(G.round, options.bagColor || '#eaa751', [0, -.23, 0], [.29, .33, .16]),
    part(G.torus, '#946642', [0, -.035, 0], [.09, .10, .5]),
  ]); leftArm.end.add(shoppingBag);
  const waterStream = new THREE.InstancedMesh(G.sphere, material('#b6f2ff', true), 24);
  waterStream.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  waterStream.frustumCulled = false;
  person.add(waterStream);
  const bike = lily || options.bike ? createBike() : new THREE.Group(); person.add(bike);
  const scooter = options.scooter ? createScooter() : new THREE.Group(); person.add(scooter);
  person.userData = { isPerson: true, isLily: lily, personId: options.id || null, baseScale: options.scale ?? 1,
    rig: { pelvis, body, torso, head, leftArm, rightArm, leftLeg, rightLeg, hips,
      neutralSkirt: hips.geometry, activeSkirt,
      bouquet, wateringCan, waterStream, phone, money, shoppingBag, bike, scooter },
  };
  person.scale.setScalar(person.userData.baseScale);
  person.userData.update = (state, time) => updatePerson(person, state, time);
  person.userData.setPose = person.userData.update;
  for (const prop of [bouquet, wateringCan, waterStream, phone, money, shoppingBag, bike, scooter]) prop.visible = false;
  return person;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const v = new THREE.Vector3(), direction = new THREE.Vector3(), bend = new THREE.Vector3();
const elbow = new THREE.Vector3(), quaternion = new THREE.Quaternion();
const transform = new THREE.Matrix4();
const dummy = new THREE.Object3D();
function reach(person, limb, target, pole = [0, 0, 1]) {
  const parent = limb.upper.parent;
  parent.updateWorldMatrix(true, false);
  transform.copy(parent.matrixWorld).invert().multiply(person.matrixWorld);
  v.copy(target).applyMatrix4(transform).sub(limb.upper.position);
  const distance = THREE.MathUtils.clamp(v.length(), .025, limb.a + limb.b - .001);
  direction.copy(v).normalize();
  bend.set(...pole).addScaledVector(direction, -new THREE.Vector3(...pole).dot(direction)).normalize();
  const along = (limb.a ** 2 - limb.b ** 2 + distance ** 2) / (2 * distance);
  elbow.copy(direction).multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, limb.a ** 2 - along ** 2)));
  limb.upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().normalize());
  v.copy(direction).multiplyScalar(distance).sub(elbow).normalize();
  quaternion.copy(limb.upper.quaternion).invert();
  v.applyQuaternion(quaternion);
  limb.lower.quaternion.setFromUnitVectors(DOWN, v);
}
function heldLevel(limb, rotation = [0, 0, 0]) {
  limb.end.quaternion.copy(limb.upper.quaternion).multiply(limb.lower.quaternion).invert();
  limb.end.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
}
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const point = (x, y, z) => new THREE.Vector3(x, y, z);
function enabled(props, name) { return Array.isArray(props) ? props.includes(name) : Boolean(props?.[name]); }

/** Only consumes sampled states; seeking never changes route or gameplay time. */
export function updatePerson(person, state = {}, time = 0) {
  const r = person.userData.rig;
  if (!r) return person;
  const p = state.position || state.pos;
  if (p) person.position.set(p.x || 0, p.y || 0, p.z || 0);
  if (Number.isFinite(state.heading)) person.rotation.y = state.heading;
  if (person.userData.workerBody) {
    sampleWorkerBody(person.userData.workerBody, state, time);
    person.visible = state.visible !== false;
    return person;
  }
  const raw = state.animationState || state.animation || state.action || 'idle';
  const action = ({ smell: 'smell_flowers', buy: 'buy_flowers', water: 'water_flowers',
    bike_push: 'push_bike', bike_ride: 'ride_bike', pedal: 'ride_bike', scooter: 'ride_scooter',
    check_phone: 'phone', look_phone: 'phone' })[raw] || raw;
  const props = state.propsHeld || state.heldProps || state.props || [];
  const progress = state.segmentProgress ?? .5;
  const phase = state.phase ?? time;
  const stride = phase * 6;
  const walk = ['walk', 'carry', 'push_bike', 'shopping_bag'].includes(action);
  const ride = action === 'ride_bike';
  const scooter = action === 'ride_scooter';
  const water = action === 'water_flowers';
  const smell = ['smell_flowers', 'bend', 'straighten'].includes(action);
  const buy = ['buy_flowers', 'pay', 'receive', 'hold_up'].includes(action);
  const sitting = ['sit', 'sit_phone', 'sit_down', 'stand_up'].includes(action);
  // The long-hair decoy's walking hem stays centred on her hip pivot.
  const walkingDrape = walk && person.userData.personId !== 'orange_long_hair';
  if (r.activeSkirt) r.hips.geometry = walkingDrape || ride || sitting ? r.activeSkirt : r.neutralSkirt;
  let sit = sitting ? 1 : 0;
  if (action === 'sit_down') sit = smooth(0, .16, progress);
  if (action === 'stand_up') sit = 1 - smooth(.88, 1, progress);
  const lean = smell ? .72 * smooth(0, .2, progress) * (1 - smooth(.78, 1, progress))
    : water ? .17 : ['tie_shoe', 'lock_bike'].includes(action) ? .65 : ride ? .55 : 0;
  const values = [walk ? .012 * (1 - Math.cos(stride * 2)) : .008 * Math.sin(phase * 2),
    -.30 * sit + (ride ? .13 : scooter ? .08 : 0), lean,
    walk ? Math.sin(stride) * .50 : -.05, walk ? -Math.sin(stride) * .50 : -.05,
    walk ? -Math.sin(stride) * .40 : -1.30 * sit, walk ? Math.sin(stride) * .40 : -1.30 * sit,
    walk ? Math.max(0, Math.sin(stride)) * .65 : 1.35 * sit,
    walk ? Math.max(0, -Math.sin(stride)) * .65 : 1.35 * sit];
  // Blend ordinary consecutive frames; absolute seeks resolve immediately.
  const dt = time - (r.lastTime ?? -Infinity);
  if (r.pose && dt >= 0 && dt < .12) {
    const blend = 1 - Math.exp(-dt * 16);
    for (let i = 0; i < values.length; i++) values[i] = THREE.MathUtils.lerp(r.pose[i], values[i], blend);
  }
  r.pose = values; r.lastTime = time;
  r.pelvis.position.set(0, .92 + values[0] + values[1] - (walk ? .035 : 0), ride ? -.28 : 0);
  r.pelvis.rotation.z = walk ? Math.sin(stride) * .025 : Math.sin(phase * 1.4) * .012;
  r.body.rotation.set(values[2], 0, 0);
  r.head.rotation.set(smell || water || action.includes('phone') ? .15 : 0,
    action === 'browse' || ['talk', 'gesture'].includes(action) ? Math.sin(phase * 1.5) * .17 : 0, 0);
  for (const [i, limb] of [r.leftArm, r.rightArm, r.leftLeg, r.rightLeg].entries()) {
    limb.upper.rotation.set(values[3 + i], 0, i < 2 ? -limb.side * .07 : 0);
    limb.lower.rotation.set(i < 2 ? -.13 : values[7 + i - 2], 0, 0);
    limb.end.rotation.set(0, 0, 0);
  }
  r.bouquet.visible = enabled(props, 'bouquet') || enabled(props, 'flowers') || (buy && progress >= .34);
  r.money.visible = enabled(props, 'money') || (buy && progress < .34);
  r.wateringCan.visible = water || enabled(props, 'watering_can');
  r.phone.visible = enabled(props, 'phone') || action.includes('phone');
  r.shoppingBag.visible = enabled(props, 'bag') || enabled(props, 'shoppingBag') || action === 'shopping_bag';
  // Pour continuously while the can is raised; lift/lower phases stay dry.
  r.waterStream.visible = water && (progress >= .22 && progress < .82);
  r.bike.visible = ride || action === 'push_bike' || enabled(props, 'bike');
  r.scooter.visible = scooter || enabled(props, 'scooter');
  if (r.bike.visible && !r.bike.userData.pedal) {
    person.remove(r.bike); r.bike = createBike(); person.add(r.bike);
  }
  if (r.scooter.visible && !r.scooter.userData.wheels) {
    person.remove(r.scooter); r.scooter = createScooter(); person.add(r.scooter);
  }
  r.bike.position.set(action === 'push_bike' ? .48 : 0, 0, action === 'push_bike' ? -.26 : 0);
  if (r.bike.userData.basketBouquet) r.bike.userData.basketBouquet.visible = enabled(props, 'basket_bouquet');
  if (r.bike.visible) r.bouquet.visible = false;
  if (r.bike.visible && walk && !ride) r.bike.userData.spin(phase * 1.3);
  const leftTarget = point(-.32, 1.03 + values[1], .05), rightTarget = point(.32, 1.03 + values[1], .05);
  let leftIK = false, rightIK = false;
  if (action === 'wave') {
    rightTarget.set(.42 + Math.sin(phase * 5) * .09, 1.95, .06); rightIK = true;
  } else if (['talk', 'gesture'].includes(action)) {
    rightTarget.set(.4, 1.23 + Math.sin(phase * 3) * .07, .40); rightIK = true;
  } else if (action === 'browse') {
    rightTarget.set(.29, 1.32, .23); rightIK = true;
  } else if (smell) {
    leftTarget.set(-.30, .88, .42); rightTarget.set(.30, .88, .42); leftIK = rightIK = true;
  }
  if (r.phone.visible) {
    rightTarget.set(.14, 1.39 + values[1], .34); rightIK = true;
    leftTarget.set(-.10, 1.25 + values[1], .30); leftIK = true;
  }
  if (buy) {
    // The keeper stands behind Lily. Reach back to pay/receive, then lift the flowers.
    const receive = smooth(.34, .62, progress);
    rightTarget.set(.48 - receive * .15, 1.30 + receive * .13, -.36 + receive * .69); rightIK = true;
    r.head.rotation.y = progress < .62 ? -.3 : 0;
  } else if (action === 'sell_flowers') {
    leftTarget.set(-.30, 1.18, .43); rightTarget.set(.28, 1.30, .52);
    leftIK = rightIK = true;
    r.bouquet.visible = progress < .34;
    r.money.visible = progress >= .34;
  } else if (r.bouquet.visible) {
    rightTarget.set(.25, 1.18 + values[1], .30); rightIK = true;
  }
  if (r.wateringCan.visible) {
    const lift = smooth(0, .22, progress) * (1 - smooth(.82, 1, progress));
    rightTarget.set(.31, .88 + .52 * lift, .28 + .06 * lift); rightIK = true;
    leftTarget.set(-.10, 1.20, .35); leftIK = true;
  }
  if (ride || action === 'push_bike' || scooter) {
    const bx = action === 'push_bike' ? .48 : 0;
    const bz = action === 'push_bike' ? -.26 : 0;
    leftTarget.set(bx - .28, scooter ? 1.38 : 1.42, (scooter ? .40 : .60) + bz);
    rightTarget.set(bx + .28, scooter ? 1.38 : 1.42, (scooter ? .40 : .60) + bz);
    leftIK = rightIK = true;
    if (action === 'push_bike') {
      // Near hand steers; far hand meets the near section of the crossbar.
      rightTarget.x = bx - .08;
    }
  }
  if (leftIK) reach(person, r.leftArm, leftTarget, [-.6, -.3, -.4]);
  if (rightIK) reach(person, r.rightArm, rightTarget, [.6, -.3, -.4]);
  for (const arm of [r.leftArm, r.rightArm]) heldLevel(arm);
  if (r.wateringCan.visible) r.wateringCan.rotation.x = water ? .42 * smooth(.12, .28, progress) : 0;
  if (ride) {
    const feet = r.bike.userData.pedal(phase * 5);
    for (const [i, leg] of [r.leftLeg, r.rightLeg].entries()) {
      reach(person, leg, feet[i].clone().add(point(0, .113, -.055)), [0, 0, 1]);
      heldLevel(leg);
    }
    r.bike.userData.spin(phase * 3.2);
  } else if (scooter) {
    reach(person, r.leftLeg, point(-.10, .29, -.06));
    reach(person, r.rightLeg, point(.21, .10 + Math.max(0, Math.sin(stride)) * .17, -.28 - Math.sin(stride) * .25));
    heldLevel(r.leftLeg); heldLevel(r.rightLeg);
    r.scooter.userData.spin?.(phase * 2.5);
  } else if (walk) {
    for (const leg of [r.leftLeg, r.rightLeg]) {
      const step = Math.sin(stride) * -leg.side;
      reach(person, leg, point(leg.side * .13, .10 + Math.max(0, step) * .11, step * .18));
      heldLevel(leg);
    }
  } else {
    for (const leg of [r.leftLeg, r.rightLeg]) heldLevel(leg);
  }
  // Include IK-driven gestures in the transition blend. Pedal feet remain exact.
  const joints = [r.leftArm, r.rightArm, ...(!ride ? [r.leftLeg, r.rightLeg] : [])]
    .flatMap(limb => [limb.upper, limb.lower]);
  const previous = r.joints || new Map();
  for (const joint of joints) {
    if (previous.has(joint) && dt > 0 && dt < .12) joint.quaternion.slerpQuaternions(
      previous.get(joint), joint.quaternion.clone(), 1 - Math.exp(-dt * 20));
    previous.set(joint, joint.quaternion.clone());
  }
  r.joints = previous;
  for (const limb of [r.leftArm, r.rightArm, r.leftLeg, r.rightLeg]) heldLevel(limb);
  if (r.waterStream.visible) {
    person.updateMatrixWorld(true);
    const tip = r.wateringCan.localToWorld(r.wateringCan.userData.spoutTip.clone());
    person.worldToLocal(tip);
    // Overlapping bright droplets keep the whole nozzle-to-soil stream readable.
    // Animate their small lateral ripple without opening gaps along the fall.
    for (let i = 0; i < r.waterStream.count; i++) {
      const f = (i + .5) / r.waterStream.count;
      dummy.position.set(tip.x + Math.sin(i * .9 - phase * 12) * .012 * f,
        THREE.MathUtils.lerp(tip.y, .68, f), tip.z + f * .06);
      dummy.scale.set(.032, Math.max(.04, Math.abs(tip.y - .68) / r.waterStream.count * .75), .032);
      dummy.updateMatrix();
      r.waterStream.setMatrixAt(i, dummy.matrix);
    }
    r.waterStream.instanceMatrix.needsUpdate = true;
  }
  if (r.skinBones) copyRigToBones(r, r.skinBones);
  person.visible = state.visible !== false;
  return person;
}

export function disposePeopleResources() {
  for (const geometry of [...Object.values(G), ...COMPOSITES.values()]) geometry.dispose();
  for (const m of MATERIALS.values()) m.dispose();
  COMPOSITES.clear(); MATERIALS.clear();
}
export { G as SHARED_PERSON_GEOMETRIES, MATERIALS as SHARED_PERSON_MATERIALS };
export const buildPerson = createPerson;
export const applyPersonPose = updatePerson;
