const RETICLE_CORNERS = ['tl', 'tr', 'bl', 'br'];

function button(label, className, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  if (onClick) element.addEventListener('click', onClick);
  return element;
}

/**
 * Camera overlay. The scene owns all game state; this object only reflects it.
 */
export function createHud({
  parent = document.body,
  onShoot = () => {},
  onFinish = () => {},
  onZoom = () => {},
  onResume = () => {},
} = {}) {
  const root = document.createElement('section');
  root.className = 'hud';
  root.setAttribute('aria-label', 'Surveillance camera controls');
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__objective">Observe LILY. Photograph useful evidence.</div>
      <div class="hud__counter" aria-live="polite">PHOTOS 0 / 10</div>
    </div>
    <div class="reticle" aria-hidden="true"></div>
    <div class="hud__hint" role="status" hidden></div>
    <div class="hud__toast" role="status" hidden></div>
    <div class="film-strip" aria-label="Saved photos"></div>
    <div class="hud__bottom">
      <button class="secondary-button hud__finish" type="button">FINISH SURVEILLANCE</button>
      <div class="hud__controls">
        <label class="hud__zoom-box">
          <span class="hud__zoom-readout">1.0×</span>
          <input class="hud__zoom-slider" type="range" min="0" max="1" step="0.001" value="0" aria-label="Camera zoom" />
        </label>
        <button class="shutter-button" type="button" aria-label="Take photo">TAKE PHOTO</button>
      </div>
    </div>`;

  const reticle = root.querySelector('.reticle');
  for (const corner of RETICLE_CORNERS) {
    const span = document.createElement('span');
    span.className = `reticle__corner reticle__corner--${corner}`;
    reticle.append(span);
  }

  const counter = root.querySelector('.hud__counter');
  const objective = root.querySelector('.hud__objective');
  const zoomReadout = root.querySelector('.hud__zoom-readout');
  const zoomSlider = root.querySelector('.hud__zoom-slider');
  const shutter = root.querySelector('.shutter-button');
  const finish = root.querySelector('.hud__finish');
  const toast = root.querySelector('.hud__toast');
  const hint = root.querySelector('.hud__hint');
  const filmStrip = root.querySelector('.film-strip');
  let toastTimer = 0;
  let hintTimer = 0;
  let pausePanel = null;

  shutter.addEventListener('click', onShoot);
  finish.addEventListener('click', onFinish);
  zoomSlider.addEventListener('input', () => onZoom(Number(zoomSlider.value)));
  parent.append(root);

  function setPhotos(used, total = 10) {
    counter.textContent = `PHOTOS ${used} / ${total}`;
  }

  function timedMessage(element, message, duration, timerName) {
    window.clearTimeout(timerName === 'toast' ? toastTimer : hintTimer);
    element.textContent = message;
    element.hidden = !message;
    const timer = duration > 0 && message
      ? window.setTimeout(() => { element.hidden = true; }, duration)
      : 0;
    if (timerName === 'toast') toastTimer = timer;
    else hintTimer = timer;
  }

  return {
    root,
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    setObjective(text = 'Observe LILY. Photograph useful evidence.') {
      objective.textContent = text;
    },
    setPhotos,
    setPhotoCount: setPhotos,
    setZoom(magnification, sliderValue) {
      zoomReadout.textContent = `${Number(magnification).toFixed(1)}×`;
      if (Number.isFinite(sliderValue)) zoomSlider.value = String(sliderValue);
    },
    setZoomEnabled(enabled) {
      zoomSlider.disabled = !enabled;
    },
    setShutterEnabled(enabled) {
      shutter.disabled = !enabled;
    },
    showToast(message = 'PHOTO SAVED', duration = 1800) {
      timedMessage(toast, message, duration, 'toast');
    },
    showHint(message = 'Watch the mark carefully. Take photos of useful evidence.', duration = 6000) {
      timedMessage(hint, message, duration, 'hint');
    },
    addThumbnail(src, label = '') {
      if (!src) return;
      const image = document.createElement('img');
      image.src = src;
      image.alt = label;
      filmStrip.prepend(image);
      while (filmStrip.children.length > 4) filmStrip.lastElementChild.remove();
    },
    setPaused(paused) {
      if (!paused) {
        pausePanel?.remove();
        pausePanel = null;
        return;
      }
      if (pausePanel) return;
      pausePanel = document.createElement('div');
      pausePanel.className = 'pause-panel';
      pausePanel.innerHTML = '<div class="pause-panel__card"><p class="eyebrow">Camera paused</p><h2>PAUSED</h2><div class="pause-panel__actions"></div></div>';
      const actions = pausePanel.querySelector('.pause-panel__actions');
      actions.append(
        button('RESUME', 'primary-button', onResume),
        button('FINISH SURVEILLANCE', 'secondary-button', onFinish),
      );
      root.append(pausePanel);
    },
    destroy() {
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
      root.remove();
    },
  };
}
