import { renderPhotoGrid } from './review.js';

function formatTime(seconds) {
  const whole = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function makeFact(label, icon, value) {
  const card = document.createElement('div');
  card.className = 'fact-card';
  const iconElement = document.createElement('span');
  iconElement.className = 'fact-card__icon';
  iconElement.textContent = icon || '';
  const labelElement = document.createElement('span');
  labelElement.className = 'fact-card__label';
  labelElement.textContent = label;
  const valueElement = document.createElement('span');
  valueElement.className = 'fact-card__value';
  valueElement.textContent = value;
  card.append(iconElement, labelElement, valueElement);
  return card;
}

function makeStat(label, value) {
  const stat = document.createElement('div');
  stat.className = 'report-stat';
  const labelElement = document.createElement('span');
  labelElement.className = 'report-stat__label';
  labelElement.textContent = label;
  const valueElement = document.createElement('span');
  valueElement.className = 'report-stat__value';
  valueElement.textContent = value;
  stat.append(labelElement, valueElement);
  return stat;
}

/** The only UI that reveals facts and annotates evidence photos. */
export function createReport({ parent = document.body, onPlayAgain = () => {} } = {}) {
  const root = document.createElement('section');
  root.className = 'screen report-screen';
  root.dataset.screen = 'report';
  root.innerHTML = `
    <div class="screen__inner">
      <p class="eyebrow">Case complete</p>
      <h1>Mission Report</h1>
      <p class="screen__lead">Excellent work, Agent. HQ has confirmed your report.</p>
      <div class="report-facts" aria-label="Confirmed facts"></div>
      <div class="report-stats" aria-label="Mission statistics"></div>
      <p class="section-label">Surveillance photos</p>
      <div class="photo-grid" aria-label="Annotated surveillance photos"></div>
      <div class="report-actions"><button class="primary-button" type="button">PLAY AGAIN</button></div>
    </div>`;
  const facts = root.querySelector('.report-facts');
  const stats = root.querySelector('.report-stats');
  const photos = root.querySelector('.photo-grid');
  root.querySelector('.primary-button').addEventListener('click', onPlayAgain);
  parent.append(root);

  function render({ character, facts: suppliedFacts, photos: nextPhotos = [], elapsed = 0, evidenceFound } = {}) {
    const factRows = suppliedFacts || [
      { label: 'NAME', icon: '📛', value: character?.name || 'Lily' },
      { label: 'LIKES', icon: character?.facts?.likes?.icon, value: character?.facts?.likes?.value || 'flowers' },
      { label: 'CAN', icon: character?.facts?.can?.icon, value: character?.facts?.can?.value || 'ride a bike' },
    ];
    facts.replaceChildren(...factRows.map((fact) => makeFact(fact.label, fact.icon, fact.value)));
    const found = evidenceFound ?? new Set(nextPhotos.map((photo) => photo?.eventId).filter(Boolean)).size;
    stats.replaceChildren(
      makeStat('Photos used', String(nextPhotos.length)),
      makeStat('Evidence found', String(found)),
      makeStat('Mission time', formatTime(elapsed)),
    );
    renderPhotoGrid(photos, nextPhotos, { annotate: true });
  }

  return {
    root,
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    render,
    destroy() { root.remove(); },
  };
}

export { formatTime };
