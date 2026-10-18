import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

/** Projection only: identity and evidence events deliberately play no part. */
export function projectPerson(camera, state) {
  if (!state?.position || state.visible === false) return null;
  camera.updateMatrixWorld();
  const p = state.position;
  const base = new THREE.Vector3(p.x, p.y || 0, p.z);
  const torso = state.torsoPosition
    ? new THREE.Vector3(state.torsoPosition.x, state.torsoPosition.y, state.torsoPosition.z)
    : base.clone().add(new THREE.Vector3(0, 1.24, 0));
  const centre = torso.clone().project(camera);
  const bottom = base.clone().add(new THREE.Vector3(0, 0.1, 0)).project(camera);
  const top = base.clone().add(new THREE.Vector3(0, state.height || 2.09, 0)).project(camera);
  return { x: centre.x, y: centre.y, z: centre.z, height: Math.abs(top.y - bottom.y) / 2, torso };
}

export function framed(projection, { region = 0.7, minHeight = 0.15 } = {}) {
  return Boolean(projection && Math.abs(projection.x) <= region && Math.abs(projection.y) <= region
    && projection.z >= -1 && projection.z <= 1 && projection.height >= minHeight);
}

export function unblocked(camera, projection, occluders = []) {
  if (!occluders.length) return true;
  const direction = projection.torso.clone().sub(camera.position);
  const distance = direction.length();
  raycaster.set(camera.position, direction.normalize());
  raycaster.near = 0.05;
  raycaster.far = Math.max(0.05, distance - 0.35);
  return raycaster.intersectObjects(occluders, true).length === 0;
}

export function personVisible(camera, state, options = {}) {
  const projection = projectPerson(camera, state);
  return framed(projection, options)
    && unblocked(camera, projection, options.occluders || state?.occluders || []);
}

/** Pure selection with injectable projections and building visibility checks. */
export function selectTarget(people, { project = person => person.projection, isUnblocked = () => true } = {}) {
  const candidates = people.map(person => ({ person, projection: project(person) }))
    .filter(({ projection }) => framed(projection, { region: 0.2, minHeight: 0 }))
    .sort((a, b) => Math.hypot(a.projection.x, a.projection.y) - Math.hypot(b.projection.x, b.projection.y));
  let tooSmall = false;
  for (const { person, projection } of candidates) {
    if (!isUnblocked(person, projection)) continue;
    if (projection.height < 0.12) { tooSmall = true; continue; }
    return { id: person.id, reason: 'selected' };
  }
  return { id: null, reason: tooSmall ? 'too-small' : 'none' };
}
