import * as THREE from 'three';

const DEG = Math.PI / 180;
const MIN_FOV = 3.5;
const MAX_FOV = 50;
const MAX_ZOOM = MAX_FOV / MIN_FOV;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (current, target, rate, dt) => THREE.MathUtils.lerp(
  current,
  target,
  1 - Math.exp(-rate * dt),
);

export function zoomToFov(zoom) {
  return MAX_FOV / clamp(zoom, 1, MAX_ZOOM);
}

export function fovToZoom(fov) {
  return MAX_FOV / clamp(fov, MIN_FOV, MAX_FOV);
}

export function createTelephoto({ camera, canvas, onShoot, onPause, onZoom }) {
  const homePitch = -11.6 * DEG;
  const state = {
    yaw: 0,
    pitch: homePitch,
    fov: MAX_FOV,
    targetYaw: 0,
    targetPitch: homePitch,
    targetFov: MAX_FOV,
    dragging: false,
    pointerX: 0,
    pointerY: 0,
    enabled: true,
  };
  const keys = new Set();

  camera.position.set(0, 16, 78);
  camera.near = 0.1;
  camera.far = 180;

  function apply() {
    const cp = Math.cos(state.pitch);
    camera.fov = state.fov;
    camera.lookAt(
      camera.position.x + Math.sin(state.yaw) * cp,
      camera.position.y + Math.sin(state.pitch),
      camera.position.z - Math.cos(state.yaw) * cp,
    );
    camera.updateProjectionMatrix();
    onZoom?.(fovToZoom(state.fov));
  }

  function setZoom(value, immediate = false) {
    state.targetFov = zoomToFov(Number(value) || 1);
    if (immediate) state.fov = state.targetFov;
    apply();
  }

  function setSlider(value) {
    const t = clamp(Number(value) || 0, 0, 1);
    const fov = MAX_FOV * Math.pow(MIN_FOV / MAX_FOV, t);
    state.targetFov = fov;
  }

  function getSlider() {
    return Math.log(state.fov / MAX_FOV) / Math.log(MIN_FOV / MAX_FOV);
  }

  function zoomBy(multiplier) {
    state.targetFov = clamp(state.targetFov / multiplier, MIN_FOV, MAX_FOV);
  }

  function aimAt(position, zoom = 8, immediate = true) {
    const target = position.isVector3
      ? position
      : new THREE.Vector3(position.x, position.y ?? 1.8, position.z);
    const direction = target.clone().sub(camera.position).normalize();
    state.targetYaw = clamp(Math.atan2(direction.x, -direction.z), -38 * DEG, 38 * DEG);
    state.targetPitch = clamp(Math.asin(direction.y), -25 * DEG, 5 * DEG);
    state.targetFov = zoomToFov(zoom);
    if (immediate) {
      state.yaw = state.targetYaw;
      state.pitch = state.targetPitch;
      state.fov = state.targetFov;
      apply();
    }
  }

  function onPointerDown(event) {
    if (!state.enabled) return;
    state.dragging = true;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!state.enabled || !state.dragging) return;
    const dx = event.clientX - state.pointerX;
    const dy = event.clientY - state.pointerY;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    const visible = state.targetFov * DEG;
    state.targetYaw = clamp(state.targetYaw - dx / Math.max(1, canvas.clientWidth) * visible, -38 * DEG, 38 * DEG);
    state.targetPitch = clamp(state.targetPitch + dy / Math.max(1, canvas.clientHeight) * visible, -25 * DEG, 5 * DEG);
  }

  function onPointerUp(event) {
    state.dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    if (!state.enabled) return;
    event.preventDefault();
    zoomBy(Math.exp(-event.deltaY * 0.0018));
  }

  function onKeyDown(event) {
    if (!state.enabled || event.defaultPrevented) return;
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    // Focused buttons keep their native Space/Enter action; other camera keys remain available.
    if (event.target?.closest?.('button') && (event.code === 'Space' || event.key === 'Enter')) return;
    const key = event.key.toLowerCase();
    keys.add(key);
    if (event.code === 'Space') {
      event.preventDefault();
      onShoot?.();
    } else if (key === 'escape') {
      event.preventDefault();
      onPause?.();
    } else if (key === '+' || key === '=' || key === 'e') {
      zoomBy(1.22);
    } else if (key === '-' || key === '_' || key === 'q') {
      zoomBy(1 / 1.22);
    }
  }

  const onKeyUp = event => keys.delete(event.key.toLowerCase());

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function update(dt) {
    if (state.enabled) {
      const angularSpeed = Math.max(4, state.targetFov * 0.65) * DEG;
      if (keys.has('arrowleft') || keys.has('a')) state.targetYaw -= angularSpeed * dt;
      if (keys.has('arrowright') || keys.has('d')) state.targetYaw += angularSpeed * dt;
      if (keys.has('arrowup') || keys.has('w')) state.targetPitch += angularSpeed * dt;
      if (keys.has('arrowdown') || keys.has('s')) state.targetPitch -= angularSpeed * dt;
      state.targetYaw = clamp(state.targetYaw, -38 * DEG, 38 * DEG);
      state.targetPitch = clamp(state.targetPitch, -25 * DEG, 5 * DEG);
    }
    state.yaw = damp(state.yaw, state.targetYaw, 12, dt);
    state.pitch = damp(state.pitch, state.targetPitch, 12, dt);
    state.fov = damp(state.fov, state.targetFov, 10, dt);
    apply();
  }

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  apply();
  return {
    update,
    destroy,
    aimAt,
    setZoom,
    setSlider,
    getSlider,
    zoom: () => fovToZoom(state.fov),
    fov: () => state.fov,
    setEnabled(value) {
      state.enabled = Boolean(value);
      if (!state.enabled) { keys.clear(); state.dragging = false; }
    },
    state,
  };
}

export { MIN_FOV, MAX_FOV, MAX_ZOOM };
