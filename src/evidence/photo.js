import * as THREE from 'three';

const WEAK_EVENTS = new Set(['push_bike']);
const raycaster = new THREE.Raycaster();
const projected = new THREE.Vector3();

function positionOf(markState) {
  const p = markState?.position;
  if (!p) return null;
  return p.isVector3 ? p.clone() : new THREE.Vector3(p.x, p.y || 0, p.z);
}

export function judgePhoto(camera, markState, options = {}) {
  const eventId = markState?.eventId || null;
  if (!eventId || WEAK_EVENTS.has(eventId) || markState?.weak) return null;
  const base = positionOf(markState);
  if (!base) return null;

  const torso = base.clone().add(new THREE.Vector3(0, 2.15, 0));
  projected.copy(torso).project(camera);
  if (Math.abs(projected.x) > 0.7 || Math.abs(projected.y) > 0.7 || projected.z < -1 || projected.z > 1) return null;

  const bottom = base.clone().add(new THREE.Vector3(0, 0.1, 0)).project(camera);
  const top = base.clone().add(new THREE.Vector3(0, markState.height || 3.55, 0)).project(camera);
  const projectedHeight = Math.abs(top.y - bottom.y) / 2;
  if (projectedHeight < 0.15) return null;

  const blockers = options.occluders || markState.occluders || [];
  if (blockers.length) {
    const direction = torso.clone().sub(camera.position);
    const distance = direction.length();
    raycaster.set(camera.position, direction.normalize());
    raycaster.near = 0.05;
    raycaster.far = Math.max(0.05, distance - 0.35);
    if (raycaster.intersectObjects(blockers, true).length) return null;
  }
  return eventId;
}

export function captureThumbnail(sourceCanvas, width = 320, height = 180) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#07111f';
  context.fillRect(0, 0, width, height);
  try {
    context.drawImage(sourceCanvas, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.76);
  } catch {
    return canvas.toDataURL('image/jpeg', 0.76);
  }
}

export function playShutterEffect(container) {
  const layer = document.createElement('div');
  layer.className = 'shutter-effect';
  layer.innerHTML = '<div class="shutter-blade shutter-blade--top"></div><div class="shutter-flash"></div><div class="shutter-blade shutter-blade--bottom"></div>';
  container.append(layer);
  requestAnimationFrame(() => layer.classList.add('is-active'));
  window.setTimeout(() => layer.remove(), 260);
}

export function playShutterSound(Sfx) {
  Sfx.click();
  window.setTimeout(() => Sfx.paper(), 35);
}

export { WEAK_EVENTS };
