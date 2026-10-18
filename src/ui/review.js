function thumbnailOf(photo) {
  return photo?.thumbnail || photo?.dataUrl || photo?.src || '';
}

function photoCard(photo, index, { annotate = false, onOpen = () => {} } = {}) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'photo-card';
  const wrap = document.createElement('span');
  wrap.className = 'photo-card__image-wrap';
  const image = document.createElement('img');
  image.className = 'photo-card__image';
  image.src = thumbnailOf(photo);
  image.alt = `Surveillance photo ${index + 1}`;
  wrap.append(image);
  if (annotate && photo?.eventId) {
    const check = document.createElement('span');
    check.className = 'photo-card__evidence';
    check.textContent = '✓';
    check.title = 'Evidence found';
    check.setAttribute('aria-label', 'Evidence found');
    wrap.append(check);
  }
  const label = document.createElement('span');
  label.className = 'photo-card__label';
  label.textContent = `PHOTO ${index + 1}`;
  card.append(wrap, label);
  card.addEventListener('click', () => onOpen(photo, index));
  return card;
}

export function renderPhotoGrid(container, photos = [], options = {}) {
  container.replaceChildren();
  photos.forEach((photo, index) => container.append(photoCard(photo, index, options)));
}

/** Neutral evidence review: event metadata is intentionally never rendered here. */
export function createReview({ parent = document.body, photos = [], onReport = () => {}, onNotebook = () => {} } = {}) {
  const root = document.createElement('section');
  root.className = 'screen review-screen';
  root.dataset.screen = 'review';
  root.innerHTML = `
    <div class="screen__inner">
      <p class="eyebrow">Surveillance archive</p>
      <h1>Evidence Review</h1>
      <p class="screen__lead">Review your photos, then report your conclusions to HQ.</p>
      <div class="photo-grid" aria-label="Captured photos"></div>
      <div class="review-actions"><button class="primary-button" type="button">REPORT TO HQ</button><button class="secondary-button notebook-button review__notebook" type="button" aria-keyshortcuts="N">FIELD NOTEBOOK</button></div>
    </div>`;
  const grid = root.querySelector('.photo-grid');
  const report = root.querySelector('.primary-button');
  let currentPhotos = [];

  function closeLightbox() {
    root.querySelector('.photo-lightbox')?.remove();
  }

  function openPhoto(photo, index) {
    closeLightbox();
    const lightbox = document.createElement('button');
    lightbox.type = 'button';
    lightbox.className = 'photo-lightbox';
    lightbox.setAttribute('aria-label', 'Close enlarged photo');
    const content = document.createElement('span');
    const image = document.createElement('img');
    image.src = thumbnailOf(photo);
    image.alt = `Surveillance photo ${index + 1}`;
    const label = document.createElement('span');
    label.className = 'photo-lightbox__label';
    label.textContent = `PHOTO ${index + 1}`;
    content.append(image, label);
    lightbox.append(content);
    lightbox.addEventListener('click', closeLightbox);
    root.append(lightbox);
  }

  function setPhotos(nextPhotos = []) {
    currentPhotos = [...nextPhotos];
    renderPhotoGrid(grid, currentPhotos, { onOpen: openPhoto });
  }

  report.addEventListener('click', onReport);
  root.querySelector('.review__notebook').addEventListener('click', onNotebook);
  setPhotos(photos);
  parent.append(root);

  return {
    root,
    show() { root.hidden = false; },
    hide() { root.hidden = true; closeLightbox(); },
    setPhotos,
    getPhotos() { return [...currentPhotos]; },
    destroy() { root.remove(); },
  };
}
