import * as THREE from 'three';

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#78a9cc');
  gradient.addColorStop(0.58, '#b9d2d8');
  gradient.addColorStop(1, '#e8d8b8');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function contactTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.48)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Warm, inexpensive lighting; all ground contact marks share one draw call. */
export function createAtmosphere({ renderer, scene, market, people }) {
  // Lambert surfaces retain their authored palette without a filmic shoulder
  // desaturating Lily's yellow shirt and the red/blue/green identity accents.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = false;
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#d7d4bf', 92, 172);

  const hemisphere = market.root.getObjectByName('market-hemisphere-light');
  hemisphere.color.set('#e9f1f8');
  hemisphere.groundColor.set('#ac9477');
  hemisphere.intensity = 1.65;
  const sunlight = market.root.getObjectByName('market-sun');
  sunlight.color.set('#ffdfb0');
  sunlight.intensity = 2.45;
  sunlight.position.set(-28, 24, 28);

  const staticContacts = [
    ...market.props.benches.map(object => ({ object, width: 2.8, depth: 1.2 })),
    ...market.props.trees.map(object => ({
      object, width: 3.5 * object.scale.x, depth: 2.7 * object.scale.x,
    })),
  ];
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff', map: contactTexture(), alphaToCoverage: true,
    depthWrite: false, toneMapped: false,
  });
  // The antialiased renderer converts alpha to MSAA sample coverage, giving a
  // soft contact without hash noise, transparent sorting or a shadow map.
  const contacts = new THREE.InstancedMesh(geometry, material, people.length + staticContacts.length);
  contacts.name = 'soft-contact-shadows';
  contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  contacts.frustumCulled = false;
  contacts.renderOrder = 1;
  scene.add(contacts);
  const transform = new THREE.Object3D();
  const pavingContact = new THREE.Color('#8b826a');
  const lawnContact = new THREE.Color('#61784b');

  function place(index, object, width, depth) {
    const { x, z } = object.position;
    const onLawn = z >= 20;
    const onPath = onLawn && Math.abs(x) <= 2.5;
    transform.position.set(x, onPath ? 0.027 : onLawn ? 0.003 : 0.015, z);
    transform.rotation.set(0, object.rotation.y, 0);
    transform.scale.set(object.visible ? width : 0, 1, object.visible ? depth : 0);
    transform.updateMatrix();
    contacts.setMatrixAt(index, transform.matrix);
    contacts.setColorAt(index, onLawn && !onPath ? lawnContact : pavingContact);
  }

  function update() {
    people.forEach((object, index) => place(index, object, 1.25, 0.85));
    staticContacts.forEach(({ object, width, depth }, index) => {
      place(people.length + index, object, width, depth);
    });
    contacts.instanceMatrix.needsUpdate = true;
    contacts.instanceColor.needsUpdate = true;
  }
  update();
  return { update };
}
