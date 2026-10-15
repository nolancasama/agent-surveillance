import * as THREE from 'three';
import { createBike, createWateringCan } from './people.js';

const STATIC_GEOMETRY = Object.freeze({
  shopBody: new THREE.BoxGeometry(9, 7, 6),
  shopWindow: new THREE.BoxGeometry(2.7, 2.5, 0.08),
  shopDoor: new THREE.BoxGeometry(1.5, 2.8, 0.1),
  sign: new THREE.PlaneGeometry(4.6, 1.05),
  fascia: new THREE.BoxGeometry(8.7, 1.05, 0.12),
  awning: new THREE.BoxGeometry(8.2, 0.16, 1.25),
  awningStripe: new THREE.BoxGeometry(0.72, 0.18, 1.29),
  distantGround: new THREE.PlaneGeometry(260, 260),
  distantBuilding: new THREE.BoxGeometry(1, 1, 1),
  paving: new THREE.PlaneGeometry(44, 40),
  lawn: new THREE.PlaneGeometry(44, 38),
  path: new THREE.PlaneGeometry(5, 39),
  benchSeat: new THREE.BoxGeometry(2.3, 0.16, 0.58),
  benchBack: new THREE.BoxGeometry(2.3, 0.65, 0.13),
  benchLeg: new THREE.BoxGeometry(0.14, 0.52, 0.14),
  tableTop: new THREE.CylinderGeometry(0.72, 0.72, 0.1, 12),
  tableLeg: new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8),
  chair: new THREE.BoxGeometry(0.48, 0.12, 0.48),
  trunk: new THREE.CylinderGeometry(0.22, 0.3, 2.4, 7),
  canopy: new THREE.IcosahedronGeometry(1.35, 1),
  planter: new THREE.BoxGeometry(3.8, 0.6, 2.2),
  soil: new THREE.BoxGeometry(3.45, 0.1, 1.85),
  rackRail: new THREE.CylinderGeometry(0.035, 0.035, 3.6, 7),
  flowerStem: new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
  flowerHead: new THREE.SphereGeometry(0.12, 7, 5),
  bucket: new THREE.CylinderGeometry(0.28, 0.22, 0.52, 9),
});

const STATIC_MATERIALS = new Map();
const SIGN_TEXTURES = [];

function material(color, options = {}) {
  const key = `${color}:${options.transparent ? options.opacity ?? 1 : 1}:${options.side ?? ''}`;
  if (!STATIC_MATERIALS.has(key)) {
    const parameters = {
      color,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? true,
    };
    if (options.side !== undefined) parameters.side = options.side;
    STATIC_MATERIALS.set(key, new THREE.MeshLambertMaterial(parameters));
  }
  return STATIC_MATERIALS.get(key);
}

function mesh(geometry, color, name) {
  const result = new THREE.Mesh(geometry, material(color));
  result.name = name;
  return result;
}

function point(x, z, y = 0) {
  return Object.freeze({ x, y, z });
}

export const MARKET_LANDMARKS = Object.freeze({
  squareCenter: point(0, 0),
  fountain: point(0, 0),
  flowerbed: point(-8, 6),
  bikeRack: point(15, 12),
  cafeTables: point(-14, -12),
  cafe: point(-14, -12),
  squareBench: point(6, 8),
  southBench: point(-3, -9),
  bloomBuckets: point(4, -19),
  bloom: point(4, -19),
  bloomDoor: point(4, -21.05),
  booksWindow: point(-6, -20.8),
  robotsWindow: point(-21.1, -8),
  musicWindow: point(-21.1, 8),
  artWindow: point(21.1, -8),
  bakeryWindow: point(21.1, 8),
  lawnPath: point(0, 39),
  playerVantage: point(0, 78, 16),
  shopkeeper: point(4.8, -20.2),
  cafeFriend: point(-13.1, -11.5),
});

function signMaterial(label, ink = '#f4ead5', background = '#18334d') {
  if (typeof document === 'undefined') return material(background);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#ffbd3f';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = ink;
  context.font = 'bold 64px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  SIGN_TEXTURES.push(texture);
  return new THREE.MeshLambertMaterial({ map: texture });
}

function createAwning(color) {
  const awning = new THREE.Group();
  const base = mesh(STATIC_GEOMETRY.awning, color, 'awning');
  base.position.set(0, 2.2, 0.58);
  base.rotation.x = -0.14;
  awning.add(base);
  for (let i = -4; i <= 4; i += 2) {
    const stripe = mesh(STATIC_GEOMETRY.awningStripe, '#f4ead5', 'awning-stripe');
    stripe.position.set(i * 0.82, 2.22, 0.59);
    stripe.rotation.x = -0.14;
    awning.add(stripe);
  }
  return awning;
}

function createShop(definition, occluders, shops) {
  const shop = new THREE.Group();
  shop.name = `shop-${definition.label.toLowerCase()}`;
  shop.position.set(definition.x, 0, definition.z);
  shop.rotation.y = definition.rotation || 0;

  const body = mesh(STATIC_GEOMETRY.shopBody, definition.wall, `${shop.name}-building`);
  body.position.set(0, 3.5, -3);
  body.userData.isBuildingOccluder = true;
  body.userData.shop = definition.label;
  shop.add(body);
  occluders.push(body);

  const fascia = mesh(STATIC_GEOMETRY.fascia, definition.trim, 'shop-fascia');
  fascia.position.set(0, 4.2, 0.035);
  shop.add(fascia);
  const sign = new THREE.Mesh(STATIC_GEOMETRY.sign, signMaterial(definition.label));
  sign.name = `${definition.label.toLowerCase()}-sign`;
  sign.position.set(0, 4.25, 0.105);
  shop.add(sign);
  const windowLeft = mesh(STATIC_GEOMETRY.shopWindow, '#75a9bd', 'shop-window');
  const windowRight = windowLeft.clone();
  windowLeft.position.set(-2.45, 1.75, 0.075);
  windowRight.position.set(2.45, 1.75, 0.075);
  shop.add(windowLeft, windowRight);
  const door = mesh(STATIC_GEOMETRY.shopDoor, '#334c5d', `${definition.label.toLowerCase()}-door`);
  door.position.set(0, 1.4, 0.09);
  shop.add(door, createAwning(definition.awning));
  const labelKey = definition.label.toLowerCase();
  shops[labelKey] = shop;
  if (labelKey === 'café') shops.cafe = shop;
  return shop;
}

function createBench(x, z, rotation = 0) {
  const bench = new THREE.Group();
  bench.name = 'bench';
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  const seat = mesh(STATIC_GEOMETRY.benchSeat, '#93603a', 'bench-seat');
  seat.position.y = 0.58;
  const back = mesh(STATIC_GEOMETRY.benchBack, '#93603a', 'bench-back');
  back.position.set(0, 0.88, 0.26);
  back.rotation.x = -0.08;
  bench.add(seat, back);
  for (const side of [-0.83, 0.83]) {
    const leg = mesh(STATIC_GEOMETRY.benchLeg, '#3e4a4d', 'bench-leg');
    leg.position.set(side, 0.28, 0);
    bench.add(leg);
  }
  return bench;
}

function createCafeSet(x, z) {
  const cafe = new THREE.Group();
  cafe.name = 'cafe-tables';
  cafe.position.set(x, 0, z);
  for (let tableIndex = 0; tableIndex < 3; tableIndex += 1) {
    const table = new THREE.Group();
    table.position.set((tableIndex - 1) * 2.3, 0, (tableIndex % 2) * 1.6);
    const top = mesh(STATIC_GEOMETRY.tableTop, '#d9c4a0', 'cafe-table');
    top.position.y = 0.78;
    const leg = mesh(STATIC_GEOMETRY.tableLeg, '#44545a', 'cafe-table-leg');
    leg.position.y = 0.39;
    table.add(top, leg);
    for (const side of [-1, 1]) {
      const chair = mesh(STATIC_GEOMETRY.chair, '#ba594b', 'cafe-chair');
      chair.position.set(side * 0.95, 0.48, 0);
      table.add(chair);
    }
    cafe.add(table);
  }
  return cafe;
}

function createFlowerCluster(count = 12, radius = 1) {
  const cluster = new THREE.Group();
  cluster.name = 'flowers';
  const colours = ['#f34866', '#ffbd3f', '#f4ead5', '#9c64cf'];
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.39996;
    const distance = radius * Math.sqrt((i + 0.5) / count);
    const stem = mesh(STATIC_GEOMETRY.flowerStem, '#3e8c4b', 'flower-stem');
    stem.position.set(Math.cos(angle) * distance, 0.3, Math.sin(angle) * distance);
    cluster.add(stem);
    const bloom = mesh(STATIC_GEOMETRY.flowerHead, colours[i % colours.length], 'flower-bloom');
    bloom.position.set(stem.position.x, 0.6, stem.position.z);
    cluster.add(bloom);
  }
  return cluster;
}

function createFlowerbed() {
  const planter = new THREE.Group();
  planter.name = 'flowerbed-planter';
  const box = mesh(STATIC_GEOMETRY.planter, '#c78959', 'planter-wall');
  box.position.y = 0.3;
  const soil = mesh(STATIC_GEOMETRY.soil, '#513c2e', 'planter-soil');
  soil.position.y = 0.62;
  const flowers = createFlowerCluster(18, 0.85);
  flowers.position.y = 0.58;
  flowers.scale.z = 0.72;
  planter.add(box, soil, flowers);
  return planter;
}

function createBloomBuckets() {
  const display = new THREE.Group();
  display.name = 'bloom-flower-buckets';
  for (let i = 0; i < 4; i += 1) {
    const bucket = mesh(STATIC_GEOMETRY.bucket, i % 2 ? '#e2ddd1' : '#6da5ae', 'flower-bucket');
    bucket.position.set((i - 1.5) * 0.62, 0.27, (i % 2) * 0.3);
    display.add(bucket);
    const flowers = createFlowerCluster(7, 0.2);
    flowers.position.copy(bucket.position);
    flowers.position.y = 0.5;
    display.add(flowers);
  }
  return display;
}

function createBikeRack() {
  const rack = new THREE.Group();
  rack.name = 'bike-rack';
  const rail = mesh(STATIC_GEOMETRY.rackRail, '#7b8b90', 'bike-rack-rail');
  rail.position.set(0, 0.52, 0);
  rail.rotation.z = Math.PI / 2;
  rack.add(rail);
  const loopGeometry = new THREE.TorusGeometry(0.42, 0.035, 6, 12, Math.PI);
  for (let i = -2; i <= 2; i += 1) {
    const loop = mesh(loopGeometry, '#7b8b90', 'bike-rack-loop');
    loop.position.set(i * 0.65, 0.08, 0);
    loop.rotation.z = Math.PI;
    rack.add(loop);
  }
  return rack;
}

function createFountain() {
  const fountain = new THREE.Group();
  fountain.name = 'fountain';
  const basin = mesh(new THREE.CylinderGeometry(2.15, 2.35, 0.55, 20), '#c7b9a2', 'fountain-basin');
  basin.position.y = 0.28;
  const water = mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.08, 20), '#55bfd7', 'fountain-water');
  water.position.y = 0.57;
  const column = mesh(new THREE.CylinderGeometry(0.27, 0.4, 1.7, 10), '#d9ccb5', 'fountain-column');
  column.position.y = 1.2;
  const cap = mesh(new THREE.CylinderGeometry(0.8, 0.52, 0.22, 12), '#d9ccb5', 'fountain-cap');
  cap.position.y = 2.02;
  fountain.add(basin, water, column, cap);
  return fountain;
}

function createTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.name = 'tree';
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  const trunk = mesh(STATIC_GEOMETRY.trunk, '#725039', 'tree-trunk');
  trunk.position.y = 1.2;
  const canopy = mesh(STATIC_GEOMETRY.canopy, '#438958', 'tree-canopy');
  canopy.position.y = 3.25;
  canopy.scale.set(1.05, 1.25, 1.05);
  tree.add(trunk, canopy);
  return tree;
}

function createDistantBackdrop() {
  const backdrop = new THREE.Group();
  backdrop.name = 'distant-backdrop';

  // One instanced mesh gives the market a low, irregular skyline without
  // multiplying draw calls. The rows sit inside the extended ground edge.
  const buildings = [
    [-57, -67, 11, 7, 6], [-45, -69, 10, 10, 7], [-33, -67, 12, 6, 6],
    [-20, -69, 11, 9, 7], [-7, -67, 13, 7, 6], [7, -69, 12, 11, 7],
    [20, -67, 11, 8, 6], [33, -69, 13, 6, 7], [47, -67, 12, 9, 6],
    [58, -69, 9, 7, 7],
    [-62, -52, 7, 8, 12], [-62, -36, 7, 6, 14], [-62, -18, 7, 10, 15],
    [62, -52, 7, 7, 12], [62, -35, 7, 9, 14], [62, -17, 7, 6, 15],
  ];
  const skyline = new THREE.InstancedMesh(
    STATIC_GEOMETRY.distantBuilding,
    material('#667b72'),
    buildings.length,
  );
  skyline.name = 'distant-building-silhouettes';
  const transform = new THREE.Matrix4();
  buildings.forEach(([x, z, width, height, depth], index) => {
    transform.compose(
      new THREE.Vector3(x, height / 2 - 0.04, z),
      new THREE.Quaternion(),
      new THREE.Vector3(width, height, depth),
    );
    skyline.setMatrixAt(index, transform);
  });
  skyline.instanceMatrix.needsUpdate = true;
  backdrop.add(skyline);
  return backdrop;
}

function createForegroundFrame() {
  const frame = new THREE.Group();
  frame.name = 'vantage-window-frame';
  const rail = mesh(new THREE.BoxGeometry(20, 0.35, 0.35), '#172531', 'balcony-rail');
  rail.position.set(0, 13.25, 73.4);
  frame.add(rail);
  for (const x of [-8.7, 8.7]) {
    const post = mesh(new THREE.BoxGeometry(0.4, 7, 0.4), '#172531', 'window-post');
    post.position.set(x, 15.9, 73.4);
    frame.add(post);
  }
  return frame;
}

const SHOP_DEFINITIONS = Object.freeze([
  { label: 'CAFÉ', x: -15, z: -21, wall: '#c87955', trim: '#f0cc96', awning: '#b44e48' },
  { label: 'BOOKS', x: -5, z: -21, wall: '#718ca1', trim: '#e5d2aa', awning: '#315f87' },
  { label: 'BLOOM', x: 5, z: -21, wall: '#d8899b', trim: '#f1d8bb', awning: '#3eaf72' },
  { label: 'SPORTS', x: 15, z: -21, wall: '#d2954e', trim: '#efe0bd', awning: '#3378a9' },
  { label: 'ROBOTS', x: -22, z: -8, rotation: Math.PI / 2, wall: '#647381', trim: '#d9e0df', awning: '#37b7d8' },
  { label: 'MUSIC', x: -22, z: 8, rotation: Math.PI / 2, wall: '#8069a0', trim: '#dfd0ea', awning: '#d94a52' },
  { label: 'ART', x: 22, z: -8, rotation: -Math.PI / 2, wall: '#db795c', trim: '#f3d5ae', awning: '#9d58a6' },
  { label: 'BAKERY', x: 22, z: 8, rotation: -Math.PI / 2, wall: '#c49a64', trim: '#f1dfbd', awning: '#c75f50' },
]);

/** Build the market and optionally attach it to a supplied THREE.Scene. */
export function createMarketScene(sceneOrOptions = {}, maybeOptions = {}) {
  const scene = sceneOrOptions?.isScene ? sceneOrOptions : null;
  const options = scene ? maybeOptions : sceneOrOptions;
  const root = new THREE.Group();
  root.name = 'market';
  const occluders = [];
  const shops = {};
  const props = {};

  const distantGround = mesh(STATIC_GEOMETRY.distantGround, '#6f9564', 'distant-ground');
  distantGround.rotation.x = -Math.PI / 2;
  distantGround.position.y = -0.08;
  const paving = mesh(STATIC_GEOMETRY.paving, '#cbb99b', 'market-paving');
  paving.rotation.x = -Math.PI / 2;
  paving.position.z = 0;
  const lawn = mesh(STATIC_GEOMETRY.lawn, '#78a968', 'market-lawn');
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.025, 39);
  const path = mesh(STATIC_GEOMETRY.path, '#d8c9aa', 'lawn-path');
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 39);
  props.backdrop = createDistantBackdrop();
  root.add(distantGround, paving, lawn, path, props.backdrop);

  for (const definition of SHOP_DEFINITIONS) root.add(createShop(definition, occluders, shops));

  props.fountain = createFountain();
  props.fountain.position.set(0, 0, 0);
  props.flowerbed = createFlowerbed();
  props.flowerbed.position.set(-8, 0, 6);
  props.wateringCan = createWateringCan();
  props.wateringCan.position.set(-6.25, 0.82, 6);
  props.wateringCan.rotation.y = -0.4;
  props.bloomBuckets = createBloomBuckets();
  props.bloomBuckets.position.set(4, 0, -19);
  props.bikeRack = createBikeRack();
  props.bikeRack.position.set(15, 0, 12);
  props.parkedBike = createBike({ color: '#d94a52' });
  props.parkedBike.position.set(15, 0, 12.2);
  props.parkedBike.rotation.y = Math.PI / 2;
  props.cafe = createCafeSet(-14, -12);
  props.benches = [
    createBench(6, 8, -0.35), createBench(-3, -9, 0.25),
    createBench(-8, 35, Math.PI / 2), createBench(8, 49, -Math.PI / 2),
  ];
  root.add(
    props.fountain, props.flowerbed, props.wateringCan, props.bloomBuckets,
    props.bikeRack, props.parkedBike, props.cafe, ...props.benches,
  );

  const trees = [
    [-15, 27, 1], [-8, 44, 1.12], [-16, 54, 0.9],
    [14, 28, 1.08], [10, 40, 0.92], [16, 54, 1.13],
  ].map(([x, z, scale]) => createTree(x, z, scale));
  props.trees = trees;
  root.add(...trees, createForegroundFrame());

  const hemisphere = new THREE.HemisphereLight('#dcefff', '#7f654b', options.lightIntensity ?? 2.0);
  hemisphere.name = 'market-hemisphere-light';
  const sunlight = new THREE.DirectionalLight('#ffe1ad', options.sunIntensity ?? 2.3);
  sunlight.name = 'market-sun';
  sunlight.position.set(-18, 30, 32);
  sunlight.target.position.set(0, 0, 0);
  root.add(hemisphere, sunlight, sunlight.target);

  if (scene) {
    scene.add(root);
    if (options.fog !== false && !scene.fog) scene.fog = new THREE.Fog('#b9cbd0', 85, 150);
    if (!scene.background && options.background !== false) scene.background = new THREE.Color('#a8c4cf');
  }

  const landmarkVectors = Object.fromEntries(
    Object.entries(MARKET_LANDMARKS).map(([key, value]) => [key, new THREE.Vector3(value.x, value.y, value.z)]),
  );

  const api = {
    root,
    group: root,
    landmarks: landmarkVectors,
    occluders,
    buildingOccluders: occluders,
    shops,
    props,
    update(time = 0) {
      // The subtle water motion keeps the square alive without a particle system.
      const water = props.fountain.getObjectByName('fountain-water');
      if (water) water.position.y = 0.57 + Math.sin(time * 1.8) * 0.012;
    },
  };
  root.userData.market = api;
  return api;
}

export const createMarket = createMarketScene;

export function disposeMarketResources() {
  for (const geometry of Object.values(STATIC_GEOMETRY)) geometry.dispose();
  for (const item of STATIC_MATERIALS.values()) item.dispose();
  for (const texture of SIGN_TEXTURES) texture.dispose();
  STATIC_MATERIALS.clear();
  SIGN_TEXTURES.length = 0;
}

export { STATIC_GEOMETRY as SHARED_MARKET_GEOMETRIES, STATIC_MATERIALS as SHARED_MARKET_MATERIALS };
