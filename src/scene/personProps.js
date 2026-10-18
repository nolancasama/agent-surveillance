import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Coloured parts are baked into a single vertex-colour mesh wherever they move
// together. Instances share both their baked geometry and the Lambert material.
const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const CACHE = new Map();
const BASE = {
  ball: new THREE.SphereGeometry(1, 8, 6),
  petal: new THREE.SphereGeometry(1, 6, 4),
  tube: new THREE.CylinderGeometry(1, 1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function builder() {
  const pieces = [];
  const add = (geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const copy = geometry.clone();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    copy.applyMatrix4(transform);
    const rgb = new THREE.Color(color);
    const colors = new Float32Array(copy.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b;
    }
    copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pieces.push(copy);
  };
  const tube = (a, b, radius, color) => {
    const start = new THREE.Vector3(...a);
    const direction = new THREE.Vector3(...b).sub(start);
    const geometry = BASE.tube.clone();
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      start.addScaledVector(direction, 0.5),
      new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
      v(radius, direction.length(), radius),
    ));
    add(geometry, color);
    geometry.dispose();
  };
  return {
    add, tube,
    ball: (color, position, scale) => add(BASE.ball, color, position, scale),
    box: (color, position, scale) => add(BASE.box, color, position, scale),
    finish() {
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

function baked(key, build, name) {
  if (!CACHE.has(key)) {
    const parts = builder();
    build(parts);
    CACHE.set(key, parts.finish());
  }
  const result = new THREE.Mesh(CACHE.get(key), MATERIAL);
  result.name = name;
  return result;
}

function ring(parts, radius, thickness, position, color, rotation = [0, Math.PI / 2, 0], segments = 24) {
  const geometry = new THREE.TorusGeometry(radius, thickness, 5, segments);
  parts.add(geometry, color, position, [1, 1, 1], rotation);
  geometry.dispose();
}

export function createBouquet() {
  const bouquet = new THREE.Group();
  bouquet.name = 'bouquet';
  bouquet.add(baked('bouquet', (parts) => {
    const colors = ['#ef5266', '#ffbb3e', '#f8e6bf', '#b766ce', '#ff8464'];
    for (let i = 0; i < 7; i += 1) {
      const angle = i * Math.PI * 2 / 7;
      const x = Math.cos(angle) * 0.105;
      const z = Math.sin(angle) * 0.105;
      const y = 0.43 + (i % 3) * 0.045;
      parts.tube([x * 0.13, 0, z * 0.13], [x, y, z], 0.011, '#40834d');
      parts.ball('#5f9d54', [x * 0.65 + 0.035, 0.25, z * 0.65], [0.05, 0.022, 0.08]);
      for (let petal = 0; petal < 5; petal += 1) {
        const a = petal * Math.PI * 2 / 5;
        parts.add(BASE.petal, colors[i % colors.length], [x + Math.cos(a) * 0.045, y, z + Math.sin(a) * 0.045], [0.047, 0.035, 0.047]);
      }
      parts.add(BASE.petal, '#f8d356', [x, y + 0.024, z], [0.028, 0.022, 0.028]);
    }
    ring(parts, 0.035, 0.012, [0, 0.12, 0], '#f5c48a', [Math.PI / 2, 0, 0], 10);
  }, 'bouquet-flowers'));
  bouquet.userData.isBouquet = true;
  return bouquet;
}

export function createWateringCan() {
  const can = new THREE.Group();
  can.name = 'watering-can';
  can.add(baked('watering-can', (parts) => {
    parts.ball('#51c8d7', [0, -0.25, 0], [0.19, 0.17, 0.21]);
    parts.add(BASE.tube, '#51c8d7', [0, -0.25, 0], [0.18, 0.2, 0.2]);
    ring(parts, 0.14, 0.026, [0, -0.14, 0], '#238b9b', [0, 0, 0], 16);
    parts.tube([0, -0.28, 0.14], [0, -0.16, 0.55], 0.041, '#51c8d7');
    parts.ball('#238b9b', [0, -0.16, 0.55], [0.07, 0.045, 0.045]);
    for (const x of [-0.035, 0, 0.035]) {
      parts.ball('#b7f5ef', [x, -0.167, 0.586], [0.008, 0.008, 0.006]);
    }
  }, 'watering-can-shell'));
  can.userData.spoutTip = v(0, -0.16, 0.595);
  return can;
}

function bikeWheel(radius = 0.42, scooter = false) {
  const wheel = new THREE.Group();
  wheel.name = scooter ? 'scooter-wheel' : 'bike-wheel';
  wheel.add(baked(`wheel:${radius}:${scooter}`, (parts) => {
    ring(parts, radius - (scooter ? 0.027 : 0.032), scooter ? 0.027 : 0.032, [0, 0, 0], '#303944');
    ring(parts, radius - (scooter ? 0.045 : 0.055), 0.013, [0, 0, 0], '#d3dadd');
    const spokeCount = scooter ? 4 : 8;
    for (let i = 0; i < spokeCount; i += 1) {
      const a = i / spokeCount * Math.PI * 2;
      parts.tube([0, 0, 0], [0, Math.sin(a) * (radius - 0.04), Math.cos(a) * (radius - 0.04)], scooter ? 0.014 : 0.008, '#b6c5c9');
    }
    parts.tube([-0.055, 0, 0], [0.055, 0, 0], scooter ? 0.032 : 0.035, '#bccacf');
  }, 'wheel-rim-and-spokes'));
  return wheel;
}

export function createBike({ color = '#d94a52', basket = true } = {}) {
  const bike = new THREE.Group();
  bike.name = 'bike';
  bike.add(baked(`bike-frame:${color}:${basket}`, (parts) => {
    const rear = [0, 0.44, -0.74];
    const front = [0, 0.44, 0.78];
    const crank = [0, 0.46, -0.1];
    const seat = [0, 0.91, -0.28];
    const headset = [0, 1.02, 0.52];
    for (const [a, b] of [[rear, crank], [crank, seat], [seat, rear], [seat, headset], [headset, crank]]) {
      parts.tube(a, b, 0.032, color);
    }
    for (const x of [-0.055, 0.055]) {
      parts.tube([x, 0.44, 0.78], [x, 1.02, 0.52], 0.023, '#c1ced1');
      parts.tube([x, 0.44, -0.74], [x, 0.91, -0.28], 0.019, color);
    }
    parts.tube(seat, [0, 0.98, -0.28], 0.024, '#bcc6ca');
    parts.ball('#37424a', [0, 0.98, -0.28], [0.16, 0.045, 0.16]);
    parts.tube(headset, [0, 1.38, 0.58], 0.024, '#c1ced1');
    parts.tube([-0.28, 1.42, 0.6], [0.28, 1.42, 0.6], 0.023, '#c1ced1');
    for (const x of [-0.24, 0.24]) {
      parts.tube([x - 0.05, 1.42, 0.6], [x + 0.05, 1.42, 0.6], 0.034, '#37424a');
    }
    ring(parts, 0.12, 0.016, [0.055, 0.46, -0.1], '#c1ced1', [0, Math.PI / 2, 0], 16);
    parts.tube([0.06, 0.58, -0.1], [0.06, 0.49, -0.74], 0.012, '#69747a');
    parts.tube([0.06, 0.34, -0.1], [0.06, 0.39, -0.74], 0.012, '#69747a');
    if (basket) {
      for (const y of [1.07, 1.19, 1.3]) {
        for (const x of [-0.21, 0.21]) parts.tube([x, y, 0.67], [x, y, 1.02], 0.014, '#c39761');
        for (const z of [0.67, 1.02]) parts.tube([-0.21, y, z], [0.21, y, z], 0.014, '#c39761');
      }
      for (const x of [-0.21, -0.07, 0.07, 0.21]) {
        for (const z of [0.67, 1.02]) parts.tube([x, 1.07, z], [x, 1.3, z], 0.012, '#c39761');
        parts.tube([x, 1.07, 0.67], [x, 1.07, 1.02], 0.012, '#c39761');
      }
      parts.tube([0, 1.08, 0.55], [0, 1.08, 0.84], 0.025, '#b2bec1');
    }
  }, 'bike-frame'));
  const wheels = [-0.74, 0.78].map((z) => {
    const wheel = bikeWheel();
    wheel.position.set(0, 0.44, z);
    bike.add(wheel);
    return wheel;
  });
  const crank = new THREE.Group();
  crank.position.set(0, 0.46, -0.1);
  crank.add(baked('bike-crank', (parts) => {
    parts.tube([-0.1, 0, 0], [-0.1, 0.21, 0], 0.019, '#ccd6d8');
    parts.tube([0.1, 0, 0], [0.1, -0.21, 0], 0.019, '#ccd6d8');
    parts.tube([-0.19, 0.21, 0], [-0.1, 0.21, 0], 0.019, '#ccd6d8');
    parts.tube([0.1, -0.21, 0], [0.19, -0.21, 0], 0.019, '#ccd6d8');
  }, 'bike-crank-arms'));
  bike.add(crank);
  const pedals = [-1, 1].map(() => baked('bike-pedal', (parts) => {
    parts.box('#37424a', [0, 0, 0], [0.15, 0.035, 0.14]);
    parts.box('#f6cb69', [0, 0, 0.073], [0.09, 0.023, 0.008]);
  }, 'bike-pedal'));
  bike.add(...pedals);
  if (basket) {
    const bouquet = createBouquet();
    bouquet.name = 'basket-bouquet';
    bouquet.scale.setScalar(0.78);
    bouquet.position.set(0, 1.12, 0.84);
    bouquet.visible = false;
    bike.add(bouquet);
    bike.userData.basketBouquet = bouquet;
  }
  bike.userData.wheels = wheels;
  bike.userData.spin = (distance) => {
    for (const wheel of wheels) wheel.rotation.x = distance / 0.42;
  };
  bike.userData.pedal = (angle) => {
    crank.rotation.x = angle;
    const feet = [-1, 1].map((side) => v(side * 0.19, 0.46 - side * Math.cos(angle) * 0.21, -0.1 - side * Math.sin(angle) * 0.21));
    pedals.forEach((pedal, i) => pedal.position.copy(feet[i]));
    return feet;
  };
  bike.userData.pedal(0);
  return bike;
}

export function createScooter({ color = '#37b7d8' } = {}) {
  const scooter = new THREE.Group();
  scooter.name = 'scooter';
  scooter.add(baked(`scooter:${color}`, (parts) => {
    parts.ball(color, [0, 0.16, -0.03], [0.13, 0.045, 0.43]);
    parts.box('#394852', [0, 0.193, -0.05], [0.17, 0.015, 0.53]);
    parts.tube([0, 0.2, 0.32], [0, 1.35, 0.4], 0.026, '#c0cdd0');
    parts.tube([0, 0.24, 0.32], [0, 0.62, 0.345], 0.035, color);
    parts.tube([-0.28, 1.38, 0.4], [0.28, 1.38, 0.4], 0.023, '#c0cdd0');
    for (const x of [-0.23, 0.23]) {
      parts.tube([x - 0.06, 1.38, 0.4], [x + 0.06, 1.38, 0.4], 0.035, '#37424a');
    }
    for (const x of [-0.055, 0.055]) parts.tube([x, 0.12, 0.4], [x, 0.29, 0.32], 0.018, color);
    parts.ball(color, [0, 0.23, -0.39], [0.08, 0.026, 0.14]);
  }, 'scooter-frame'));
  const wheels = [-0.4, 0.4].map((z) => {
    const wheel = bikeWheel(0.11, true);
    wheel.position.set(0, 0.12, z);
    scooter.add(wheel);
    return wheel;
  });
  scooter.userData.wheels = wheels;
  scooter.userData.spin = (distance) => {
    for (const wheel of wheels) wheel.rotation.x = distance / 0.11;
  };
  return scooter;
}
