function missionTimestamp(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

/** A read-only view of photographed observations; scoring metadata is never rendered. */
export function createNotebookView({
  parent = document.body,
  entries = [],
  photos = [],
  onClose = () => {},
} = {}) {
  const root = document.createElement('dialog');
  root.className = 'notebook-modal';
  root.setAttribute('aria-labelledby', 'notebook-title');
  root.hidden = true;
  root.innerHTML = `
    <div class="notebook__header"><div><p class="eyebrow">Mission observations</p><h2 id="notebook-title">FIELD NOTEBOOK</h2></div><button class="secondary-button notebook__close" type="button">CLOSE</button></div>
    <div class="notebook__entries"></div>`;
  const list = root.querySelector('.notebook__entries');
  const closeButton = root.querySelector('.notebook__close');
  let currentEntries = entries;
  let currentPhotos = photos;
  let previousFocus = null;

  function render() {
    list.replaceChildren();
    if (!currentEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'notebook__empty';
      empty.textContent = 'No notes yet. Take photos of Lily.';
      list.append(empty);
      return;
    }
    [...currentEntries].sort((a, b) => a.firstSeenAt - b.firstSeenAt).forEach(entry => {
      const card = document.createElement('article');
      card.className = 'notebook-entry';
      const photoIds = entry.photoIds || [];
      const photo = currentPhotos.find(candidate => candidate.id === photoIds[0]);
      const imageWrap = document.createElement('div');
      imageWrap.className = 'notebook-entry__image';
      if (photo?.thumbnail) {
        const image = document.createElement('img');
        image.src = photo.thumbnail;
        image.alt = `First photo: ${entry.text}`;
        imageWrap.append(image);
      }
      if (photoIds.length > 1) {
        const count = document.createElement('span');
        count.className = 'notebook-entry__count';
        count.textContent = `+${photoIds.length - 1}`;
        count.setAttribute('aria-label', `${photoIds.length - 1} more photos`);
        imageWrap.append(count);
      }
      const body = document.createElement('div');
      const sentence = document.createElement('p');
      sentence.className = 'notebook-entry__text';
      sentence.textContent = entry.text;
      const labels = document.createElement('p');
      labels.className = 'notebook-entry__labels';
      labels.textContent = photoIds.map(id => {
        const index = currentPhotos.findIndex(candidate => candidate.id === id);
        return `PHOTO ${index < 0 ? id : index + 1}`;
      }).join(' · ');
      const timestamp = document.createElement('span');
      timestamp.className = 'notebook-entry__time';
      timestamp.textContent = missionTimestamp(entry.firstSeenAt);
      timestamp.setAttribute('aria-label', `Mission time ${timestamp.textContent}`);
      body.append(sentence, labels, timestamp);
      card.append(imageWrap, body);
      list.append(card);
    });
  }

  function hide() {
    if (!root.open) return;
    root.close();
    root.hidden = true;
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function requestClose() {
    hide();
    onClose();
  }

  function onKeyDown(event) {
    if (!root.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClose();
    }
  }

  closeButton.addEventListener('click', requestClose);
  root.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  window.addEventListener('keydown', onKeyDown, true);
  parent.append(root);

  return {
    root,
    show({ entries: nextEntries = currentEntries, photos: nextPhotos = currentPhotos } = {}) {
      currentEntries = nextEntries;
      currentPhotos = nextPhotos;
      render();
      if (root.open) return;
      previousFocus = document.activeElement;
      root.hidden = false;
      root.showModal();
      closeButton.focus();
    },
    hide,
    isOpen: () => root.open,
    destroy() {
      hide();
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
}
