import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
const SIGN_MATERIALS = [];
const GENERATED_GEOMETRIES = new Set();
const SHARED_GEOMETRY_SET = new Set(Object.values(STATIC_GEOMETRY));
const vertexMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

// Bake static detail into one coloured assembly per landmark, retaining real
// building meshes for visibility raycasts and textured signs as separate draws.
function batchStatic(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const parts = [], sources = [];
  group.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || object.material.map || object.material.emissive?.getHex()
      || object.userData.isBuildingOccluder || object.name === 'fountain-water') return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) object.material.color.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry); sources.push(object);
  });
  if (!parts.length) return group;
  const geometry = mergeGeometries(parts);
  GENERATED_GEOMETRIES.add(geometry);
  parts.forEach(part => part.dispose());
  sources.forEach(source => source.removeFromParent());
  const assembly = new THREE.Mesh(geometry, vertexMaterial);
  assembly.name = `${group.name}-detail`;
  group.add(assembly);
  return group;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BALL = new THREE.SphereGeometry(1, 10, 7);
const STEM = new THREE.CylinderGeometry(1, 1, 1, 6);
function addPart(group, geometry, color, position, scale = [1, 1, 1], rotation = [0, 0, 0], name = '') {
  const part = mesh(geometry, color, name);
  part.position.set(...position); part.scale.set(...scale); part.rotation.set(...rotation);
  group.add(part); return part;
}
function box(group, color, position, scale, rotation, name) {
  return addPart(group, BOX, color, position, scale, rotation, name);
}
function bar(group, color, from, to, radius = .035) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const part = addPart(group, STEM, color, a.clone().add(b).multiplyScalar(.5).toArray(), [radius, a.distanceTo(b), radius]);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return part;
}
function gable(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, height); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth);
  GENERATED_GEOMETRIES.add(geometry);
  return geometry;
}

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
  if (!SHARED_GEOMETRY_SET.has(geometry)) GENERATED_GEOMETRIES.add(geometry);
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
  const menu = label === 'MENU';
  canvas.width = menu ? 256 : 1024;
  canvas.height = menu ? 384 : 256;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#e5c792';
  context.lineWidth = 5;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.lineWidth = 2;
  context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
  context.fillStyle = ink;
  context.font = menu ? 'bold 48px Georgia, serif' : 'bold 124px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, menu ? 72 : canvas.height / 2 + 8);
  if (menu) {
    context.font = '28px Georgia, serif';
    for (const [text, y] of [['COFFEE', 154], ['TEA', 216], ['CAKE', 278]]) context.fillText(text, 128, y);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  SIGN_TEXTURES.push(texture);
  const result = new THREE.MeshLambertMaterial({ map: texture });
  SIGN_MATERIALS.push(result);
  return result;
}

function createAwning(color) {
  const awning = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const stripeColor = i % 2 ? '#fff0d3' : color;
    box(awning, stripeColor, [(i - 7.5) * .51, 3.18, .63], [.51, .10, 1.38], [.18, 0, 0]);
    // Rounded valance lobes give stripes a scalloped cloth edge.
    addPart(awning, BALL, stripeColor, [(i - 7.5) * .51, 2.98, 1.29], [.255, .18, .065]);
  }
  for (const x of [-3.8, 3.8]) bar(awning, '#745c4a', [x, 2.65, .02], [x, 3.03, 1.23]);
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
  // Warm, baked base shading costs no shadow pass. The footprint is unchanged.
  const bodyGeometry = body.geometry.clone();
  const baseColors = new Float32Array(bodyGeometry.attributes.position.count * 3);
  for (let i = 0; i < bodyGeometry.attributes.position.count; i++) {
    const shade = bodyGeometry.attributes.position.getY(i) < 0 ? .78 : 1;
    new THREE.Color(definition.wall).multiplyScalar(shade).toArray(baseColors, i * 3);
  }
  bodyGeometry.setAttribute('color', new THREE.BufferAttribute(baseColors, 3));
  GENERATED_GEOMETRIES.add(bodyGeometry); body.geometry = bodyGeometry; body.material = vertexMaterial;
  shop.add(body);
  occluders.push(body);

  const fascia = mesh(STATIC_GEOMETRY.fascia, definition.trim, 'shop-fascia');
  fascia.position.set(0, 4.2, 0.035);
  shop.add(fascia);
  const sign = new THREE.Mesh(STATIC_GEOMETRY.sign, signMaterial(definition.label));
  sign.name = `${definition.label.toLowerCase()}-sign`;
  sign.position.set(0, 4.25, 0.18);
  shop.add(sign);
  for (const x of [-2.45, 2.45]) {
    // Deep dark reveal, inset blue pane, projecting frame and sill.
    box(shop, '#3e474b', [x, 1.76, .035], [2.93, 2.65, .08]);
    box(shop, '#78a4ab', [x, 1.76, .09], [2.55, 2.29, .055]);
    for (const side of [-1, 1]) box(shop, definition.trim, [x + side * 1.4, 1.76, .18], [.13, 2.65, .28]);
    for (const y of [.48, 3.04]) box(shop, definition.trim, [x, y, .18], [2.93, .14, .28]);
    box(shop, definition.trim, [x, .42, .26], [3.08, .13, .48]);
    box(shop, '#e4d6b7', [x, 1.77, .16], [.075, 2.4, .08]);
    box(shop, '#b2d0cd', [x - .64, 2.6, .126], [.95, .10, .015], [0, 0, -.13]);
  }
  box(shop, '#493e3b', [0, 1.42, .04], [1.85, 2.84, .11]);
  box(shop, definition.awning, [0, 1.35, .13], [1.48, 2.62, .1]);
  box(shop, '#80adb5', [0, 1.76, .2], [1.12, 1.38, .045]);
  box(shop, definition.trim, [0, .48, .21], [1.12, .46, .05]);
  for (const x of [-.87, .87]) box(shop, definition.trim, [x, 1.44, .21], [.14, 2.88, .24]);
  box(shop, definition.trim, [0, 2.88, .21], [1.88, .15, .24]);
  addPart(shop, BALL, '#e7bd64', [.52, 1.22, .27], [.07, .07, .05]);
  box(shop, '#b8a68d', [0, .08, .24], [2.02, .16, .65]);
  for (const y of [.22, 3.55, 6.85]) box(shop, definition.trim, [0, y, .09], [9.12, y === 6.85 ? .23 : .12, .24]);
  for (const x of [-3.95, 3.95]) box(shop, definition.trim, [x, 5.28, .08], [.18, 2.9, .18]);
  for (const x of [-2.3, 2.3]) {
    box(shop, '#465c68', [x, 5.65, .045], [1.45, 1.37, .10]);
    for (const side of [-1, 1]) box(shop, definition.trim, [x + side * .8, 5.65, .16], [.14, 1.65, .25]);
    for (const y of [4.88, 6.42]) box(shop, definition.trim, [x, y, .18], [1.75, .12, .34]);
    box(shop, definition.trim, [x, 5.65, .15], [.08, 1.47, .13]);
  }
  const label = definition.label;
  const roofColor = ['BOOKS', 'MUSIC', 'BAKERY'].includes(label) ? '#4e6770' : '#ad6754';
  if (['CAFÉ', 'BOOKS', 'BAKERY', 'ART'].includes(label)) {
    addPart(shop, gable(9.25, label === 'BOOKS' ? 2.3 : 1.65, 6.15), roofColor, [0, 7, .06]);
    // A slim ridge and chimney break up the roof silhouette.
    box(shop, '#ddd2ba', [0, 7.08, .12], [9.3, .13, .15]);
    box(shop, '#a7755c', [-2.7, 8.3, -4.3], [.65, 1.7, .7]);
    box(shop, definition.trim, [-2.7, 9.1, -4.3], [.86, .19, .92]);
    if (label === 'BOOKS') {
      box(shop, definition.wall, [0, 7.65, -.1], [1.8, 1.2, .5]);
      addPart(shop, gable(2.15, .7, .85), '#385766', [0, 8.22, .2]);
      box(shop, '#c4d9d5', [0, 7.7, .18], [.85, .85, .08]);
      box(shop, definition.trim, [0, 7.7, .25], [.08, .9, .09]);
    }
  } else {
    box(shop, roofColor, [0, 7.05, -3], [9.05, .17, 6]);
    box(shop, definition.wall, [0, 7.35, -.08], [9, .6, .32]);
    box(shop, definition.trim, [0, 7.68, -.08], [9.3, .16, .5]);
    if (label === 'SPORTS') {
      box(shop, definition.wall, [2.7, 7.85, -2.8], [2.15, 1.6, 2.25]);
      addPart(shop, new THREE.ConeGeometry(1.65, 1.2, 4), '#627b7c', [2.7, 9.22, -2.8], [1, 1, 1], [0, Math.PI / 4, 0]);
    }
    if (label === 'MUSIC') box(shop, definition.trim, [0, 7.95, -.1], [3.4, .55, .36]);
  }
  shop.add(createAwning(definition.awning));
  addShopPersonality(shop, definition);
  const labelKey = definition.label.toLowerCase();
  shops[labelKey] = shop;
  if (labelKey === 'café') shops.cafe = shop;
  return batchStatic(shop);
}

function addShopPersonality(shop, d) {
  const label = d.label;
  if (label === 'CAFÉ') {
    const board = box(shop, '#3c534c', [-3.5, .78, 1.35], [.9, 1.25, .14], [-.1, 0, 0]);
    for (const x of [-4, -3]) bar(shop, '#8b6045', [x, .05, 1.14], [x, 1.5, 1.48], .065);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(.76, 1.0), signMaterial('MENU', '#fff0d3', '#3c534c'));
    menu.rotation.copy(board.rotation);
    menu.position.copy(board.position).add(new THREE.Vector3(0, 0, .09).applyEuler(board.rotation));
    shop.add(menu);
    for (let i = 0; i < 10; i++) {
      const x = -3.8 + i * .84, y = 3.69 - .25 * Math.sin(i / 9 * Math.PI);
      if (i) bar(shop, '#5d5244', [x - .84, 3.69 - .25 * Math.sin((i - 1) / 9 * Math.PI), 1.32], [x, y, 1.32], .017);
      addPart(shop, BALL, '#ffe3a0', [x, y - .09, 1.32], [.065, .10, .065]);
    }
  } else if (label === 'BOOKS') {
    for (let i = 0; i < 12; i++) box(shop, ['#b66053', '#dfb657', '#698b78', '#e8d6ae'][i % 4],
      [-3.5 + (i % 6) * .4, .63 + Math.floor(i / 6) * .38, .21], [.31, .32 + i % 3 * .06, .16], [0, 0, i % 2 * .09]);
  } else if (label === 'BLOOM') {
    for (const x of [-3.45, -1.15, 1.15, 3.45]) {
      box(shop, '#427a58', [x, 5.65, .20], [.4, 1.5, .16]);
      for (let y = 5.1; y < 6.3; y += .2) box(shop, '#77a06d', [x, y, .3], [.36, .05, .04]);
    }
    // Crates sit against the far ends of the façade, clear of the trade spot.
    for (const x of [-3.7, 3.65]) {
      box(shop, '#98734d', [x, .35, .9], [.95, .7, .75]);
      for (const y of [.16, .4, .64]) box(shop, '#caab73', [x, y, 1.3], [1, .14, .09]);
      const flowers = createFlowerCluster(6, .30); flowers.position.set(x, .66, .9); shop.add(flowers);
    }
  } else if (label === 'SPORTS') {
    box(shop, '#d8c7a1', [2.4, .65, .24], [2.3, .12, .28]);
    for (let i = 0; i < 3; i++) {
      addPart(shop, BALL, ['#f3d9a6', '#dc8951', '#faf0d8'][i], [1.65 + i * .75, .98, .25], [.29, .29, .23]);
      box(shop, '#675b4d', [1.65 + i * .75, .98, .48], [.035, .50, .025]);
    }
  } else if (label === 'ROBOTS') {
    for (const x of [-2.95, 2.35]) {
      box(shop, '#304452', [x, 1.57, .22], [1.35, .92, .16]);
      const screen = box(shop, '#72d2cb', [x, 1.6, .32], [1.12, .66, .025]);
      if (!STATIC_MATERIALS.has('screen-glow')) STATIC_MATERIALS.set('screen-glow', new THREE.MeshLambertMaterial({
        color: '#72d2cb', emissive: '#3a9e9b', emissiveIntensity: .5,
      }));
      screen.material = STATIC_MATERIALS.get('screen-glow');
      for (const side of [-1, 1]) addPart(shop, BALL, '#fff6cc', [x + side * .22, 1.68, .35], [.06, .07, .02]);
      box(shop, '#2d8e98', [x, 1.43, .35], [.44, .055, .02]);
    }
  } else if (label === 'MUSIC') {
    for (const x of [-2.75, 2.65]) {
      bar(shop, '#e8c478', [x, 1, .28], [x, 2.4, .28], .06);
      addPart(shop, BALL, '#e8c478', [x - .18, 1.02, .28], [.25, .16, .08]);
      box(shop, '#e8c478', [x + .18, 2.28, .28], [.45, .18, .12], [0, 0, -.3]);
    }
  } else if (label === 'ART') {
    // The easel stays beside the shop, away from the window evidence position.
    for (const x of [-3.8, -2.9]) bar(shop, '#8a5d43', [x, .03, 1], [-3.35, 2.1, .85], .055);
    bar(shop, '#8a5d43', [-3.35, .02, .3], [-3.35, 2, .85], .055);
    box(shop, '#fff0d4', [-3.35, 1.32, 1], [1.06, 1.1, .10]);
    addPart(shop, BALL, '#e8b457', [-3.55, 1.53, 1.06], [.18, .18, .015]);
    box(shop, '#719d87', [-3.35, 1.04, 1.06], [.95, .40, .015]);
  } else if (label === 'BAKERY') {
    for (let i = 0; i < 7; i++) {
      addPart(shop, BALL, '#db9f55', [-3.5 + i * .36, .85 + (i % 2) * .23, .25], [.17, .15, .12]);
      for (let k = 0; k < 2; k++) box(shop, '#f5d595', [-3.55 + i * .36 + k * .09, .92 + i % 2 * .23, .35], [.035, .11, .02], [0, 0, -.4]);
    }
    box(shop, '#89674b', [-2.45, .65, .24], [2.9, .15, .33]);
  }
}

function createBench(x, z, rotation = 0) {
  const bench = new THREE.Group();
  bench.name = 'bench';
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  for (let i = 0; i < 4; i++) {
    box(bench, i % 2 ? '#aa7950' : '#bd8b5c', [0, .58, -.24 + i * .15], [2.3, .12, .12]);
    box(bench, i % 2 ? '#aa7950' : '#bd8b5c', [0, .78 + i * .17, .28], [2.3, .13, .11], [-.08, 0, 0]);
  }
  for (const side of [-0.83, 0.83]) {
    const leg = mesh(STATIC_GEOMETRY.benchLeg, '#3e4a4d', 'bench-leg');
    leg.position.set(side, 0.28, 0);
    bench.add(leg);
    bar(bench, '#475c59', [side, .25, .12], [side, 1.26, .16], .055);
    bar(bench, '#475c59', [side, .58, -.2], [side, .91, -.2], .05);
    bar(bench, '#475c59', [side, .91, -.23], [side, .94, .28], .055);
  }
  return batchStatic(bench);
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
      for (const dx of [-.17, .17]) for (const dz of [-.17, .17])
        bar(table, '#51645e', [side * .95 + dx, .02, dz], [side * .95 + dx, .49, dz], .035);
      box(table, '#b85e50', [side * 1.15, .76, 0], [.09, .55, .48]);
    }
    if (tableIndex !== 1) {
      bar(table, '#8b7359', [0, .8, 0], [0, 3.0, 0], .035);
      // The open centre table keeps Lily and her café friend fully visible.
      for (let i = 0; i < 12; i++) {
        // One wedge at a time, then merged into the café assembly.
        const wedge = new THREE.ConeGeometry(1.27, .48, 3, 1, true, i * Math.PI / 6, Math.PI / 6);
        addPart(table, wedge, i % 2 ? '#fff0d0' : '#bf7460', [0, 2.76, 0]);
        GENERATED_GEOMETRIES.add(wedge);
      }
      addPart(table, BALL, '#d8bd83', [0, 3.03, 0], [.07, .10, .07]);
    }
    cafe.add(table);
  }
  return batchStatic(cafe);
}

function createFlowerCluster(count = 12, radius = 1) {
  const cluster = new THREE.Group();
  cluster.name = 'flowers';
  const colours = ['#f34866', '#ffbd3f', '#f4ead5', '#9c64cf'];
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.39996;
    const distance = radius * Math.sqrt((i + 0.5) / count);
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    const h = .48 + (i % 4) * .075;
    bar(cluster, '#4c8850', [x, 0, z], [x, h, z], .021);
    for (const side of [-1, 1]) addPart(cluster, BALL, side > 0 ? '#6c9f53' : '#3c7e4e',
      [x + side * .09, h * .48, z], [.14, .045, .065], [0, side * .4, side * .45]);
    // Distinct petal silhouettes and contrasting centres survive telephoto.
    const petals = i % 3 === 0 ? 6 : 5;
    const petalRadius = i % 3 === 1 ? .09 : .105;
    for (let p = 0; p < petals; p++) {
      const a = p * Math.PI * 2 / petals;
      addPart(cluster, BALL, colours[i % colours.length], [x + Math.cos(a) * petalRadius, h, z + Math.sin(a) * petalRadius],
        [.105, .055, .07], [0, -a, 0]);
    }
    addPart(cluster, BALL, i % 4 === 1 ? '#8b5739' : '#f7cd62', [x, h + .035, z], [.065, .055, .065]);
  }
  return cluster;
}

function createFlowerbed() {
  const planter = new THREE.Group();
  planter.name = 'flowerbed-planter';
  const wall = mesh(STATIC_GEOMETRY.planter, '#c78959', 'planter-wall');
  wall.position.y = 0.3;
  const soil = mesh(STATIC_GEOMETRY.soil, '#513c2e', 'planter-soil');
  soil.position.y = 0.62;
  const flowers = createFlowerCluster(18, 0.85);
  flowers.position.y = 0.58;
  flowers.scale.z = 0.72;
  planter.add(wall, soil, flowers);
  for (const z of [-1.05, 1.05]) box(planter, '#e4b786', [0, .59, z], [3.95, .14, .18]);
  for (const x of [-1.87, 1.87]) box(planter, '#e4b786', [x, .59, 0], [.18, .14, 2.2]);
  return batchStatic(planter);
}

function createBloomBuckets() {
  const display = new THREE.Group();
  display.name = 'bloom-flower-buckets';
  for (let i = 0; i < 4; i += 1) {
    const bucket = mesh(STATIC_GEOMETRY.bucket, i % 2 ? '#e2ddd1' : '#6da5ae', 'flower-bucket');
    bucket.position.set((i - 1.5) * 0.62, 0.27, (i % 2) * 0.3);
    display.add(bucket);
    addPart(display, new THREE.TorusGeometry(.275, .035, 5, 12), '#d3ded0', [bucket.position.x, .51, bucket.position.z], [1, 1, 1], [Math.PI / 2, 0, 0]);
    const flowers = createFlowerCluster(7, 0.2);
    flowers.position.copy(bucket.position);
    flowers.position.y = 0.5;
    display.add(flowers);
  }
  return batchStatic(display);
}

function createBikeRack() {
  const rack = new THREE.Group();
  rack.name = 'bike-rack';
  for (const z of [-.37, .37]) box(rack, '#788d91', [0, .05, z], [3.7, .10, .13]);
  const loopGeometry = new THREE.TorusGeometry(.38, .045, 6, 16, Math.PI);
  for (let i = -2; i <= 2; i += 1) {
    const loop = mesh(loopGeometry, '#7b8b90', 'bike-rack-loop');
    loop.position.set(i * .75, .58, 0);
    loop.rotation.y = Math.PI / 2;
    rack.add(loop);
    for (const z of [-.38, .38]) bar(rack, '#7b8b90', [i * .75, .06, z], [i * .75, .58, z], .045);
  }
  GENERATED_GEOMETRIES.add(loopGeometry);
  return batchStatic(rack);
}

function createFountain() {
  const fountain = new THREE.Group();
  fountain.name = 'fountain';
  const basin = mesh(new THREE.CylinderGeometry(2.15, 2.35, 0.55, 20), '#c7b9a2', 'fountain-basin');
  basin.position.y = 0.28;
  const water = mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.08, 20), '#55bfd7', 'fountain-water');
  water.position.y = 0.57;
  const column = mesh(new THREE.CylinderGeometry(0.27, 0.4, 1.1, 10), '#d9ccb5', 'fountain-column');
  column.position.y = 1.06;
  const cap = mesh(new THREE.CylinderGeometry(0.8, 0.52, 0.22, 12), '#d9ccb5', 'fountain-cap');
  cap.position.y = 1.46;
  fountain.add(basin, water, column, cap);
  // Both tiers stay below the previous 2.13-unit cap: the rear bike lap remains open.
  for (const [radius, y, height] of [[2.32, .12, .19], [2.16, .6, .15], [.85, 1.52, .12], [.48, 1.95, .13]]) {
    const rim = new THREE.TorusGeometry(radius, height / 2, 6, 28);
    addPart(fountain, rim, '#dfcfad', [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    GENERATED_GEOMETRIES.add(rim);
  }
  addPart(fountain, new THREE.CylinderGeometry(.13, .23, .36, 10), '#c8b696', [0, 1.72, 0]);
  addPart(fountain, new THREE.CylinderGeometry(.46, .3, .16, 16), '#dac9a6', [0, 1.91, 0]);
  addPart(fountain, new THREE.CylinderGeometry(.40, .40, .025, 16), '#75c4ca', [0, 1.992, 0]);
  addPart(fountain, new THREE.CylinderGeometry(.70, .70, .025, 20), '#75c4ca', [0, 1.583, 0]);
  addPart(fountain, BALL, '#9cdee0', [0, 2.06, 0], [.07, .07, .07]);
  // Opaque stylised falling ribbons avoid another transparent water pass.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    bar(fountain, '#81c9cf', [Math.cos(a) * .65, 1.52, Math.sin(a) * .65], [Math.cos(a) * .8, .65, Math.sin(a) * .8], .026);
  }
  return batchStatic(fountain);
}

function createTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.name = 'tree';
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  const trunk = mesh(STATIC_GEOMETRY.trunk, '#725039', 'tree-trunk');
  trunk.position.y = 1.2;
  tree.add(trunk);
  for (const [dx, y, dz, size, color] of [[-.48, 3.0, 0, 1.18, '#518652'], [.55, 3.3, -.1, 1.08, '#689950'], [0, 4.0, .08, 1.15, '#76a65d']])
    addPart(tree, BALL, color, [dx, y, dz], [size, size * .98, size * .90]);
  bar(tree, '#806044', [0, 1.6, 0], [.6, 2.8, 0], .10);
  bar(tree, '#806044', [0, 1.6, 0], [-.6, 2.7, 0], .10);
  return batchStatic(tree);
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
  const roofs = new THREE.InstancedMesh(gable(1, .25, 1), material('#6e8582'), buildings.length);
  roofs.name = 'distant-varied-rooflines';
  buildings.forEach(([x, z, width, height, depth], i) => {
    transform.compose(new THREE.Vector3(x, height - .04, z + depth / 2), new THREE.Quaternion(),
      new THREE.Vector3(width, i % 3 === 0 ? 6 : i % 3 === 1 ? 2 : 4, depth));
    roofs.setMatrixAt(i, transform);
    skyline.setColorAt(i, new THREE.Color(['#84988a', '#9a9f8c', '#8b9fa0'][i % 3]));
  });
  roofs.instanceMatrix.needsUpdate = true;
  backdrop.add(skyline, roofs);
  return backdrop;
}

function pavingMaterial() {
  if (typeof document === 'undefined') return material('#cbb99b');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#a99c88'; context.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const x = col * 64 + (row % 2) * 32;
    context.fillStyle = ['#cbbba0', '#d0c0a7', '#c4b59b'][(row + col + 3) % 3];
    context.fillRect(x + 1, row * 32 + 1, 62, 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(22, 20); texture.anisotropy = 4;
  SIGN_TEXTURES.push(texture);
  const result = new THREE.MeshLambertMaterial({ map: texture });
  SIGN_MATERIALS.push(result);
  return result;
}

function createStreetFurniture() {
  const group = new THREE.Group(); group.name = 'street-furniture';
  // Edge furniture stays off all evidence positions and the fountain bike lap.
  for (const [x, z] of [[-20, -16], [20, -16], [-20, 15], [20, 15]]) {
    addPart(group, new THREE.CylinderGeometry(.18, .25, .18, 8), '#556461', [x, .09, z]);
    bar(group, '#506362', [x, .1, z], [x, 3.8, z], .065);
    box(group, '#506362', [x, 3.7, z], [.48, .66, .48]);
    box(group, '#ffe0a1', [x, 3.73, z], [.36, .43, .36]);
    addPart(group, new THREE.ConeGeometry(.4, .25, 4), '#506362', [x, 4.12, z], [1, 1, 1], [0, Math.PI / 4, 0]);
  }
  for (const [x, z] of [[-19.3, 17], [19.3, -18]]) {
    addPart(group, new THREE.CylinderGeometry(.34, .30, .85, 12), '#58716a', [x, .44, z]);
    addPart(group, new THREE.CylinderGeometry(.37, .37, .09, 12), '#334b49', [x, .9, z]);
    box(group, '#263e3b', [x, .75, z + .305], [.3, .17, .04]);
  }
  for (const [x, z] of [[-20, 4], [20, -2]]) {
    addPart(group, new THREE.CylinderGeometry(.53, .38, .63, 10), '#bb8160', [x, .32, z]);
    addPart(group, new THREE.CylinderGeometry(.49, .49, .08, 10), '#634b36', [x, .65, z]);
    for (let i = 0; i < 3; i++) addPart(group, BALL, ['#759956', '#598554', '#8baa60'][i],
      [x + Math.cos(i * 2.1) * .2, .85 + (i % 2) * .2, z + Math.sin(i * 2.1) * .2], [.35, .4, .35]);
  }
  for (const x of [-2.62, 2.62]) box(group, '#b4ad8d', [x, .025, 39], [.18, .09, 38]);
  for (const x of [-12.3, 12.3]) box(group, '#b4ad8d', [x, -.005, 20], [19.4, .08, .18]);
  return batchStatic(group);
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
  paving.material = pavingMaterial();
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
  // All six trees share a rounded, three-cluster assembly and one instanced draw.
  const template = trees[0].getObjectByName('tree-detail');
  const treeInstances = new THREE.InstancedMesh(template.geometry, vertexMaterial, trees.length);
  treeInstances.name = 'layered-tree-instances';
  trees.forEach((tree, i) => { tree.updateMatrix(); treeInstances.setMatrixAt(i, tree.matrix); tree.clear(); });
  root.add(...trees, treeInstances, createForegroundFrame(), createStreetFurniture());

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
  for (const sign of SIGN_MATERIALS) sign.dispose();
  SIGN_MATERIALS.length = 0;
  for (const geometry of GENERATED_GEOMETRIES) geometry.dispose();
  vertexMaterial.dispose();
  GENERATED_GEOMETRIES.clear();
  STATIC_MATERIALS.clear();
  SIGN_TEXTURES.length = 0;
}

export { STATIC_GEOMETRY as SHARED_MARKET_GEOMETRIES, STATIC_MATERIALS as SHARED_MARKET_MATERIALS };
