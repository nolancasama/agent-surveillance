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
  onNotebook = () => {},
} = {}) {
  const root = document.createElement('section');
  root.className = 'hud';
  root.setAttribute('aria-label', 'Surveillance camera controls');
  root.innerHTML = `
    <div class="hud__top">
      <div class="target-dossier">
        <button class="target-dossier__portrait" type="button" aria-label="Compare Lily's portrait" aria-expanded="false" aria-controls="target-dossier-detail"><img src="./assets/lily.png" alt="Lily" /></button>
        <div class="target-dossier__summary"><strong>LILY</strong><p>Yellow shirt, long dark hair, red ribbon, blue skirt, green backpack.</p></div>
      </div>
      <div class="hud__mission"><div class="hud__objective">Find LILY. Aim at her and press MARK TARGET.</div><div class="hud__counter" aria-live="polite">PHOTOS 0 / 10</div></div>
    </div>
    <aside class="target-dossier__detail" id="target-dossier-detail" aria-label="Lily's target dossier" hidden><button class="target-dossier__close icon-button" type="button" aria-label="Close portrait">×</button><button class="target-dossier__comparison" type="button" aria-label="Close enlarged portrait"><img src="./assets/lily.png" alt="Lily, wearing a yellow shirt and blue skirt" /></button><strong>LILY</strong><p>Yellow shirt, long dark hair, red ribbon, blue skirt, green backpack.</p></aside>
    <div class="reticle" aria-hidden="true"><span class="reticle__target" hidden>TARGET IN VIEW</span></div>
    <div class="hud__hint" role="status" hidden></div>
    <div class="hud__toast" role="status" hidden></div>
    <div class="hud__note-toast" role="status" hidden><strong>FIELD NOTE ADDED</strong><span></span></div>
    <div class="film-strip" aria-label="Saved photos"></div>
    <div class="hud__bottom">
      <div class="hud__actions"><button class="secondary-button notebook-button hud__notebook" type="button" aria-keyshortcuts="N">FIELD NOTEBOOK</button><button class="secondary-button hud__finish" type="button">FINISH SURVEILLANCE</button></div>
      <div class="hud__controls">
        <label class="hud__zoom-box">
          <span class="hud__zoom-readout">1.0×</span>
          <input class="hud__zoom-slider" type="range" min="0" max="1" step="0.001" value="0" aria-label="Camera zoom" />
        </label>
        <button class="shutter-button" type="button" aria-label="Mark target">MARK TARGET</button>
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
  const dossierPortrait = root.querySelector('.target-dossier__portrait');
  const dossierDetail = root.querySelector('.target-dossier__detail');
  const targetTag = root.querySelector('.reticle__target');
  const noteToast = root.querySelector('.hud__note-toast');
  let toastTimer = 0;
  let hintTimer = 0;
  let noteTimer = 0;
  let typeTimer = 0;
  let identified = false;
  let pausePanel = null;

  function closeDossier() {
    if (dossierDetail.hidden) return false;
    dossierDetail.hidden = true;
    dossierPortrait.setAttribute('aria-expanded', 'false');
    if (dossierDetail.contains(document.activeElement)) dossierPortrait.focus();
    return true;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && !root.hidden && closeDossier()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  shutter.addEventListener('click', onShoot);
  finish.addEventListener('click', onFinish);
  root.querySelector('.hud__notebook').addEventListener('click', onNotebook);
  dossierPortrait.addEventListener('click', () => {
    if (closeDossier()) return;
    dossierDetail.hidden = false;
    dossierPortrait.setAttribute('aria-expanded', 'true');
  });
  dossierDetail.querySelector('.target-dossier__close').addEventListener('click', closeDossier);
  dossierDetail.querySelector('.target-dossier__comparison').addEventListener('click', closeDossier);
  window.addEventListener('keydown', onKeyDown, true);
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
    hide() { root.hidden = true; closeDossier(); },
    closeDossier,
    setIdentified(value) {
      identified = Boolean(value);
      shutter.textContent = identified ? 'TAKE PHOTO' : 'MARK TARGET';
      shutter.setAttribute('aria-label', identified ? 'Take photo' : 'Mark target');
      shutter.classList.toggle('is-identified', identified);
      objective.textContent = identified ? 'Observe LILY. Photograph useful evidence.' : 'Find LILY. Aim at her and press MARK TARGET.';
      if (!identified) targetTag.hidden = true;
    },
    setTargetVisible(visible) {
      targetTag.hidden = !identified || !visible;
    },
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
    showNoteToast(text) {
      window.clearTimeout(noteTimer);
      window.clearInterval(typeTimer);
      const sentence = noteToast.querySelector('span');
      sentence.textContent = '';
      noteToast.hidden = false;
      let length = 0;
      typeTimer = window.setInterval(() => {
        length += 1;
        sentence.textContent = text.slice(0, length);
        if (length >= text.length) window.clearInterval(typeTimer);
      }, 24);
      noteTimer = window.setTimeout(() => { noteToast.hidden = true; window.clearInterval(typeTimer); }, 3200);
    },
    showHint(message = 'Find Lily. Aim at her and press MARK TARGET first.', duration = 6000) {
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
      window.clearTimeout(noteTimer);
      window.clearInterval(typeTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
}
