import { personVisible } from './visibility.js';
import { WEAK_EVENTS } from './config.js';

export function judgePhoto(camera, markState, options = {}) {
  const eventId = markState?.eventId || null;
  if (!eventId || WEAK_EVENTS.has(eventId) || markState?.weak) return null;
  return personVisible(camera, markState, options) ? eventId : null;
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
