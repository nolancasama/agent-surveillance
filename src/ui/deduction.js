function thumbnailOf(photo) {
  return photo?.thumbnail || photo?.dataUrl || photo?.src || '';
}

/**
 * Presentation for one NAME / LIKES / CAN question at a time.
 * Speech recording/evaluation stays in main; this module emits user intent only.
 */
export function createDeduction({
  parent = document.body,
  photos = [],
  character = null,
  onRecord = () => {},
  onChoice = () => {},
  onNotebook = () => {},
} = {}) {
  const root = document.createElement('section');
  root.className = 'screen deduction-screen';
  root.dataset.screen = 'deduction';
  root.innerHTML = `
    <div class="screen__inner">
      <p class="eyebrow">Secure channel <span class="deduction-progress">1 / 3</span></p>
      <h1>Report to HQ</h1>
      <div class="deduction-layout">
        <main class="radio-card">
          <div class="section-label">Commander</div>
          <p class="radio-card__line"></p>
          <div class="sentence-frame"></div>
          <button class="primary-button record-button" type="button">RECORD ANSWER</button>
          <p class="deduction-feedback" role="status"></p>
          <div class="fallback" hidden>
            <p class="fallback__prompt">Choose the correct answer from the evidence.</p>
            <div class="fallback__choices"></div>
          </div>
        </main>
        <aside>
          <p class="section-label">Your evidence</p>
          <div class="evidence-strip" aria-label="Evidence photos"></div>
          <button class="secondary-button notebook-button deduction__notebook" type="button" aria-keyshortcuts="N">FIELD NOTEBOOK</button>
        </aside>
      </div>
    </div>`;

  const progress = root.querySelector('.deduction-progress');
  const radio = root.querySelector('.radio-card__line');
  const frame = root.querySelector('.sentence-frame');
  const record = root.querySelector('.record-button');
  const feedback = root.querySelector('.deduction-feedback');
  const fallback = root.querySelector('.fallback');
  const choices = root.querySelector('.fallback__choices');
  const evidenceStrip = root.querySelector('.evidence-strip');
  let currentStep = null;

  record.addEventListener('click', () => onRecord(currentStep));
  root.querySelector('.deduction__notebook').addEventListener('click', onNotebook);
  parent.append(root);

  function setEvidence(nextPhotos = []) {
    evidenceStrip.replaceChildren();
    nextPhotos.forEach((photo, index) => {
      const image = document.createElement('img');
      image.src = thumbnailOf(photo);
      image.alt = `Photo ${index + 1}`;
      evidenceStrip.append(image);
    });
  }

  function showConfirmed() {
    feedback.textContent = '';
    const stamp = document.createElement('div');
    stamp.className = 'confirmed-stamp';
    stamp.textContent = 'CONFIRMED';
    root.querySelector('.radio-card').append(stamp);
    record.disabled = true;
  }

  setEvidence(photos);

  return {
    root,
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    setEvidence,
    setStep(step, index = 0, total = 3) {
      currentStep = step;
      progress.textContent = `${index + 1} / ${total}`;
      radio.textContent = typeof step?.radio === 'function' ? step.radio(character) : (step?.radio || '');
      frame.textContent = typeof step?.prompt === 'function' ? step.prompt(character) : (step?.frame || step?.prompt || '');
      feedback.textContent = '';
      feedback.dataset.tone = '';
      fallback.hidden = true;
      choices.replaceChildren();
      root.querySelector('.confirmed-stamp')?.remove();
      record.disabled = false;
      record.hidden = false;
      record.classList.remove('is-recording');
      record.textContent = 'RECORD ANSWER';
    },
    setRecording(isRecording) {
      record.classList.toggle('is-recording', isRecording);
      record.textContent = isRecording ? 'LISTENING…' : 'RECORD ANSWER';
      record.setAttribute('aria-pressed', String(isRecording));
    },
    setRecordEnabled(enabled) {
      record.disabled = !enabled;
    },
    setFeedback(message = '', tone = '') {
      feedback.textContent = message;
      feedback.dataset.tone = tone;
    },
    showResult(result) {
      const messages = {
        mismatch: "That doesn't match our photos. Look at the evidence again.",
        partial: 'Almost. Say the whole sentence.',
      };
      if (result === 'confirmed') {
        showConfirmed();
        return;
      }
      feedback.textContent = messages[result] || '';
      feedback.dataset.tone = result ? 'error' : '';
    },
    showConfirmed,
    showFallback(nextChoices = []) {
      fallback.hidden = false;
      choices.replaceChildren();
      record.hidden = true;
      nextChoices.forEach((choice, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'fallback-choice';
        option.dataset.choice = String(choice.id ?? choice.value ?? index);
        const icon = document.createElement('span');
        icon.className = 'fallback-choice__icon';
        icon.textContent = choice.icon || '●';
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'fallback-choice__label';
        label.textContent = choice.label || choice.value || String(choice);
        option.append(icon, label);
        option.addEventListener('click', () => onChoice(choice, currentStep));
        choices.append(option);
      });
    },
    hideFallback() {
      fallback.hidden = true;
      choices.replaceChildren();
      record.hidden = false;
    },
    destroy() { root.remove(); },
  };
}
