import * as THREE from 'three';
import { DATA } from './shared/data.js';
import { Evaluate } from './shared/evaluate.js';
import { Recorder } from './shared/recorder.js';
import { Sfx } from './shared/sfx.js';
import { createMarketScene } from './scene/market.js';
import { createAtmosphere } from './scene/atmosphere.js';
import { createPerson, updatePerson, PERSON_HEIGHT } from './scene/people.js';
import { AMBIENT_NPCS, BLOOM_SHOPKEEPER, poseAmbientAt } from './sim/ambient.js';
import { LOOP_SECONDS, poseAt } from './sim/markRoute.js';
import { createTelephoto } from './camera/telephoto.js';
import { createLedger } from './evidence/evidence.js';
import { createNotebook, exportMission } from './evidence/notebook.js';
import { personVisible, projectPerson, selectTarget, unblocked } from './evidence/visibility.js';
import { captureThumbnail, judgePhoto, playShutterEffect, playShutterSound } from './evidence/photo.js';
import { createHud } from './ui/hud.js';
import { createReview } from './ui/review.js';
import { createDeduction } from './ui/deduction.js';
import { createReport } from './ui/report.js';
import { createNotebookView } from './ui/notebook.js';

const app = document.querySelector('#app');
const lily = DATA.CHARACTERS.find(character => character.id === 'lily');
const steps = DATA.GRAMMAR_PACKS.find(pack => pack.id === 'L1').steps
  .filter(step => ['NAME', 'LIKES', 'CAN'].includes(step.factLabel));

const stage = document.createElement('div');
stage.className = 'surveillance-stage';
const canvas = document.createElement('canvas');
canvas.id = 'surveillance-canvas';
canvas.setAttribute('aria-label', '3D market surveillance view');
stage.append(canvas);
app.append(stage);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor('#a8c4cf');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 180);
const market = createMarketScene(scene);
// The redesigned can is authored at its handle grip, with the body below it.
market.props.wateringCan.position.y = 1.09;

const mark = createPerson({ id: 'lily', name: 'Lily' });
mark.name = 'mark-lily';
mark.userData.isMark = true;
scene.add(mark);

function personOptions(npc) {
  const appearance = npc.appearance || {};
  return {
    id: npc.id,
    name: npc.id,
    skin: appearance.skin,
    shirt: appearance.shirt,
    bottoms: appearance.bottom,
    hair: appearance.hairColor,
    hairStyle: npc.id === 'scooter_rider' ? 'cap' : npc.id === 'lawn_walker' ? 'ponytail' : appearance.hair,
    shorts: npc.id === 'scooter_rider',
    jacket: npc.id === 'music_shopper' ? '#304879' : null,
    skirt: npc.id === 'orange_long_hair',
  };
}

const ambientPeople = AMBIENT_NPCS.map(npc => {
  const object = createPerson(personOptions(npc));
  object.userData.isNpc = true;
  scene.add(object);
  return { npc, object };
});
const shopkeeper = createPerson(personOptions(BLOOM_SHOPKEEPER));
shopkeeper.name = 'bloom-shopkeeper';
shopkeeper.userData.isNpc = true;
scene.add(shopkeeper);
updatePerson(shopkeeper, {
  position: BLOOM_SHOPKEEPER.position,
  heading: BLOOM_SHOPKEEPER.heading,
  animation: 'gesture',
}, 0);
const atmosphere = createAtmosphere({
  renderer, scene, market,
  people: [mark, ...ambientPeople.map(({ object }) => object), shopkeeper],
});

let missionLedger = createLedger();
const missionNotebook = createNotebook({ ledgerConfig: missionLedger.config() });
let identified = false;
let wrongMarks = 0;
let lastMark = -Infinity;
let lastIdentityHint = -Infinity;
let lastVisibilityCheck = -Infinity;
let notebookWasPaused = false;
let phase = 'briefing';
let paused = false;
let missionTime = 0;
let lastFrame = performance.now();
let lastShot = -Infinity;
let startedAt = 0;
let speechStubSet = false;
let speechStub = null;
let stepIndex = 0;
let failedAttempts = 0;
let recording = false;
let recordTimer = 0;
let finishingRecording = false;
let hintForLikes = false;
let hintForCan = false;
let lastLocationHint = -Infinity;
let sceneRevealed = false;

function makeBriefing() {
  const root = document.createElement('section');
  root.className = 'screen briefing-screen';
  root.dataset.screen = 'briefing';
  root.innerHTML = `
    <div class="briefing-card">
      <img class="briefing-card__portrait" src="./assets/lily.png" alt="Lily, the person to observe" />
      <div>
        <p class="eyebrow">Agent briefing · File 006</p>
        <h1>Find Lily</h1>
        <p class="briefing-card__description">Your mark is Lily. Look for a yellow shirt, long dark hair, a blue skirt, a small red hair ribbon, and a green backpack.</p>
        <p class="briefing-card__description">Find Lily from the window. Aim at her and press MARK TARGET first. Then photograph what she is doing to find out what she likes and what she can do.</p>
        <button class="primary-button" type="button">BEGIN SURVEILLANCE</button>
      </div>
    </div>`;
  root.querySelector('button').addEventListener('click', startMission);
  app.append(root);
  return root;
}

const briefing = makeBriefing();
const hud = createHud({
  parent: app,
  onShoot: () => primaryAction(),
  onFinish: () => finishSurveillance(),
  onZoom: value => telephoto.setSlider(value),
  onResume: () => setPaused(false),
  onNotebook: () => openNotebook(),
});
const review = createReview({ parent: app, onReport: () => beginDeduction(), onNotebook: () => openNotebook() });
const deduction = createDeduction({
  parent: app,
  character: lily,
  onRecord: () => handleRecord(),
  onChoice: choice => handleChoice(choice),
  onNotebook: () => openNotebook(),
});
const report = createReport({ parent: app, onPlayAgain: () => window.location.reload() });
const notebookView = createNotebookView({ parent: app, onClose: () => closeNotebook() });
hud.hide();
review.hide();
deduction.hide();
report.hide();

let telephoto;
telephoto = createTelephoto({
  camera,
  canvas,
  onShoot: () => primaryAction(),
  onPause: () => {
    if (notebookView.isOpen()) return;
    if (hud.closeDossier()) return;
    if (phase === 'surveillance') setPaused(!paused);
  },
  onZoom: zoom => hud.setZoom(zoom, telephoto ? telephoto.getSlider() : 0),
});
telephoto.setEnabled(false);

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  if (canvas.width !== Math.round(width * renderer.getPixelRatio())
    || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);

function markRenderPose() {
  const state = poseAt(missionTime);
  const evidenceAnimation = state.eventId && !state.weak ? state.eventId : state.animation;
  return { ...state, animation: evidenceAnimation, height: PERSON_HEIGHT, occluders: market.occluders };
}

function updateWorld() {
  const markState = markRenderPose();
  updatePerson(mark, markState, missionTime);
  const markHasBike = markState.props.includes('bike');
  market.props.parkedBike.visible = !markHasBike;
  market.props.wateringCan.visible = !markState.props.includes('watering_can');

  for (const { npc, object } of ambientPeople) {
    const pose = poseAmbientAt(npc, missionTime);
    const isScooter = npc.mobility === 'scooter';
    const carriesBag = pose.animation === 'shopping_bag';
    updatePerson(object, {
      ...pose,
      animation: isScooter ? 'ride_scooter' : pose.animation,
      props: [...(isScooter ? ['scooter'] : []), ...(carriesBag ? ['bag'] : [])],
      visible: pose.animation !== 'enter_shop' || (missionTime % 4) < 2,
    }, missionTime + npc.phaseOffset);
  }
  updatePerson(shopkeeper, {
    position: BLOOM_SHOPKEEPER.position,
    heading: 0,
    animation: markState.eventId === 'buy_flowers' ? 'sell_flowers' : 'idle',
    segmentProgress: markState.segmentProgress,
  }, missionTime);
  market.update(missionTime);
  atmosphere.update();
  return markState;
}

function status() {
  return missionLedger.status();
}

function updateHud() {
  const current = status();
  hud.setPhotos(current.photos.length, current.photos.length + current.remaining);
  hud.setIdentified(identified);
  hud.setShutterEnabled((!identified || current.remaining > 0) && phase === 'surveillance' && !paused && sceneRevealed);
  hud.setZoomEnabled(!paused);
}

function startMission() {
  phase = 'surveillance';
  paused = false;
  sceneRevealed = false;
  startedAt = performance.now();
  briefing.hidden = true;
  stage.hidden = false;
  hud.show();
  telephoto.setEnabled(true);
  updateHud();
  hud.showHint('Check your dossier. Aim at Lily and press MARK TARGET first.', 6000);
  Sfx.bgmStart();
}

function setPaused(value, showPanel = true) {
  paused = Boolean(value);
  hud.setPaused(paused && showPanel);
  telephoto.setEnabled(!paused && phase === 'surveillance');
  updateHud();
}

function openNotebook() {
  if (!['surveillance', 'review', 'deduction'].includes(phase) || notebookView.isOpen() || recording) return;
  hud.closeDossier();
  notebookWasPaused = paused;
  if (phase === 'surveillance') setPaused(true, false);
  notebookView.show({ entries: missionNotebook.entries(), photos: status().photos });
}

function closeNotebook() {
  notebookView.hide();
  if (phase === 'surveillance') setPaused(notebookWasPaused);
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.defaultPrevented && phase === 'surveillance' && paused
    && !notebookView.isOpen()) {
    event.preventDefault();
    setPaused(false);
    return;
  }
  if (event.defaultPrevented || event.repeat || event.key.toLowerCase() !== 'n'
    || event.target.matches('input, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
  if (notebookView.isOpen()) closeNotebook();
  else openNotebook();
});

function peopleInScene() {
  return [
    { id: 'lily', state: markRenderPose() },
    ...ambientPeople.map(({ npc, object }) => ({ id: npc.id, state: {
      ...poseAmbientAt(npc, missionTime), height: PERSON_HEIGHT, visible: object.visible,
    } })),
    { id: BLOOM_SHOPKEEPER.id, state: { position: BLOOM_SHOPKEEPER.position, height: PERSON_HEIGHT } },
  ];
}

function identityLocationHint() {
  const id = poseAt(missionTime).segmentId;
  const area = /cafe|talk_friend/.test(id) ? 'the cafe'
    : /robots/.test(id) ? 'the ROBOTS shop'
      : /water_flowers/.test(id) ? 'the flowerbed'
        : /bike/.test(id) ? 'the bike rack'
          : /bench/.test(id) ? 'the bench'
            : /music/.test(id) ? 'the MUSIC shop' : 'the north shops';
  return `Try looking near ${area}.`;
}

function maybeIdentityHint() {
  if (identified || (wrongMarks < 3 && missionTime < 60)
    || missionTime - lastIdentityHint < 60 || performance.now() - lastMark < 4000) return;
  hud.showHint(identityLocationHint(), 6500);
  lastIdentityHint = missionTime;
  lastLocationHint = missionTime;
}

function markTarget() {
  if (identified || phase !== 'surveillance' || paused || !sceneRevealed) return { ok: false, reason: 'unavailable' };
  const now = performance.now();
  if (now - lastMark < 800) return { ok: false, reason: 'cooldown' };
  lastMark = now;
  updateWorld();
  scene.updateMatrixWorld(true);
  const selected = selectTarget(peopleInScene(), {
    project: person => projectPerson(camera, person.state),
    isUnblocked: (_, projection) => unblocked(camera, projection, market.occluders),
  });
  if (selected.id === 'lily') {
    identified = true;
    hud.showHint('Identity confirmed. Begin surveillance.', 4500);
    updateHud();
    return { ok: true, id: selected.id };
  }
  if (selected.id) wrongMarks += 1;
  hud.showHint(selected.id ? 'Identity does not match. Check your dossier.'
    : selected.reason === 'too-small' ? 'Too far away. Zoom in closer.'
      : 'No one is in your sights. Zoom in on a person.', 4000);
  // Let the rejection line finish before giving a rescue location.
  return { ok: false, ...selected };
}

function primaryAction() {
  return identified ? takePhoto() : markTarget();
}

function maybeLocationHint() {
  if (!identified) { maybeIdentityHint(); return; }
  const current = status();
  if (missionTime < LOOP_SECONDS || current.complete || missionTime - lastLocationHint < 60) return;
  if (current.likeCount < current.likeNeeded && !hintForLikes) {
    const message = current.likeCount >= 2 ? 'HQ: Watch the flowerbed.' : 'HQ: Keep an eye on the north shops.';
    hud.showHint(message, 6500);
    hintForLikes = true;
    lastLocationHint = missionTime;
  } else if (!current.canDone && !hintForCan) {
    hud.showHint('HQ: Watch the area near the bike rack.', 6500);
    hintForCan = true;
    lastLocationHint = missionTime;
  }
}

async function takePhoto() {
  if (!identified) return { ok: false, reason: 'unidentified' };
  if (phase !== 'surveillance' || paused || !sceneRevealed) return { ok: false, reason: 'unavailable' };
  const now = performance.now();
  if (now - lastShot < 600) return { ok: false, reason: 'cooldown' };
  const before = status();
  if (before.remaining <= 0) return { ok: false, reason: 'no-film' };
  lastShot = now;
  updateWorld();
  renderer.render(scene, camera);
  const thumbnail = captureThumbnail(renderer.domElement);
  const currentMark = markRenderPose();
  const eventId = judgePhoto(camera, currentMark, { occluders: market.occluders });
  const visible = personVisible(camera, currentMark, { occluders: market.occluders });
  const result = missionLedger.capture({ eventId, thumbnail, missionTime });
  if (!result.ok) return result;
  playShutterEffect(stage);
  playShutterSound(Sfx);
  hud.showToast('PHOTO SAVED');
  if (visible) {
    const note = missionNotebook.record({ activityId: currentMark.activityId, eventId: currentMark.eventId,
      photoId: status().photos.at(-1).id, missionTime });
    if (note?.added) hud.showNoteToast(note.entry.text);
  }
  hud.addThumbnail(thumbnail, `Photo ${status().photos.length}`);
  updateHud();

  const after = status();
  if (after.remaining === 0) {
    if (after.complete) {
      window.setTimeout(() => openReview(), 300);
    } else {
      hud.showHint('HQ: New film is on the way.', 2600);
      missionLedger.refill(5);
      updateHud();
    }
  }
  return { ...result, eventId };
}

function finishSurveillance() {
  if (phase !== 'surveillance') return false;
  if (!status().complete) {
    setPaused(false);
    hud.showHint('We need more evidence.', 3200);
    return false;
  }
  openReview();
  return true;
}

function openReview() {
  if (phase !== 'surveillance') return;
  phase = 'review';
  paused = false;
  telephoto.setEnabled(false);
  Sfx.bgmStop();
  hud.hide();
  review.setPhotos(status().photos);
  review.show();
}

function beginDeduction() {
  if (phase !== 'review') return;
  phase = 'deduction';
  stepIndex = 0;
  failedAttempts = 0;
  review.hide();
  deduction.setEvidence(status().photos);
  deduction.show();
  deduction.setStep(steps[stepIndex], stepIndex, steps.length);
}

function targetFor(step) {
  return { fact: step.fact(lily), frame: step.prompt(lily) };
}

function fallbackChoices(step) {
  const correctValue = step.fact(lily);
  const others = DATA.CHARACTERS
    .filter(character => character.id !== lily.id)
    .map(character => ({ character, value: step.fact(character) }))
    .filter((entry, index, array) => array.findIndex(item => item.value === entry.value) === index)
    .slice(0, 2);
  const iconFor = character => step.factLabel === 'NAME'
    ? '📛'
    : step.icon(character);
  const choices = [
    { id: `correct-${step.factLabel}`, value: correctValue, label: correctValue, icon: iconFor(lily), correct: true },
    ...others.map(({ character, value }) => ({
      id: `${character.id}-${step.factLabel}`,
      value,
      label: value,
      icon: iconFor(character),
      correct: false,
    })),
  ];
  return [choices[1], choices[0], choices[2]];
}

function showFallback() {
  deduction.setFeedback('Choose the answer that matches your evidence.', '');
  deduction.showFallback(fallbackChoices(steps[stepIndex]));
}

function acceptStep() {
  deduction.showConfirmed();
  Sfx.stamp();
  window.setTimeout(() => {
    stepIndex += 1;
    failedAttempts = 0;
    if (stepIndex >= steps.length) {
      openReport();
      return;
    }
    deduction.setStep(steps[stepIndex], stepIndex, steps.length);
  }, 520);
}

function judgeSpeech(stt) {
  const result = Evaluate.evaluateClip(targetFor(steps[stepIndex]), stt);
  if (result.verification === 'confirmed') {
    acceptStep();
  } else if (result.verification === 'unverified') {
    showFallback();
  } else {
    failedAttempts += 1;
    deduction.showResult(result.verification);
    if (failedAttempts >= 2) window.setTimeout(showFallback, 400);
  }
  return result;
}

async function stopRecording() {
  if (!recording || finishingRecording) return;
  finishingRecording = true;
  window.clearTimeout(recordTimer);
  recording = false;
  deduction.setRecording(false);
  let stt = null;
  try {
    await Recorder.stop();
    stt = await Recorder.stopRecognition();
  } catch {
    stt = null;
  }
  finishingRecording = false;
  deduction.setRecordEnabled(true);
  judgeSpeech(stt);
}

async function handleRecord() {
  if (phase !== 'deduction' || finishingRecording) return;
  if (speechStubSet) {
    const transcript = speechStub;
    const stt = transcript == null
      ? null
      : { transcript, confidence: 0.99, gotResult: true };
    judgeSpeech(stt);
    return;
  }
  if (recording) {
    await stopRecording();
    return;
  }
  deduction.setRecordEnabled(false);
  try {
    if (!Recorder.supported() || !Recorder.recognitionSupported()) {
      showFallback();
      return;
    }
    await Recorder.init();
    Recorder.startRecognition(transcript => {
      if (Evaluate.looksComplete(targetFor(steps[stepIndex]), transcript)) stopRecording();
    });
    Recorder.start();
    recording = true;
    deduction.setRecording(true);
    deduction.setRecordEnabled(true);
    recordTimer = window.setTimeout(stopRecording, 6000);
  } catch {
    deduction.setRecordEnabled(true);
    showFallback();
  }
}

function handleChoice(choice) {
  if (choice?.correct) {
    deduction.hideFallback();
    acceptStep();
  } else {
    deduction.setFeedback("That doesn't match our photos. Look at the evidence again.", 'error');
    Sfx.click();
  }
}

function openReport() {
  phase = 'report';
  deduction.hide();
  const current = status();
  report.render({
    character: lily,
    photos: current.photos,
    elapsed: missionTime,
    evidenceFound: current.likeCount + (current.canDone ? 1 : 0),
  });
  report.show();
  Sfx.fanfare();
}

function tick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (phase === 'surveillance' && !paused) {
    missionTime += dt;
    missionLedger.setElapsedSeconds(missionTime);
    maybeLocationHint();
  }
  resize();
  updateWorld();
  telephoto.update(dt);
  renderer.render(scene, camera);
  if (phase === 'surveillance' && now - lastVisibilityCheck >= 100) {
    lastVisibilityCheck = now;
    hud.setTargetVisible(identified && personVisible(camera, markRenderPose(), { occluders: market.occluders }));
  }
  if (phase === 'surveillance' && !sceneRevealed
    && Number.parseFloat(getComputedStyle(stage).opacity || '1') >= 0.999) {
    sceneRevealed = true;
    updateHud();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function installTestHooks() {
  if (!new URLSearchParams(window.location.search).has('test')) return;
  window.__surv = {
    state: () => ({
      phase,
      paused,
      time: missionTime,
      fov: camera.fov,
      zoom: telephoto.zoom(),
      revealed: sceneRevealed,
      markExists: Boolean(mark.parent),
      npcCount: ambientPeople.length + 1,
    }),
    setTime(t) {
      missionTime = Number(t) || 0;
      missionLedger.setElapsedSeconds(missionTime);
      updateWorld();
      return markRenderPose();
    },
    markState: () => markRenderPose(),
    markTarget() {
      lastMark = -Infinity;
      return markTarget();
    },
    aimAtPerson(id, zoom = 12) {
      updateWorld();
      const person = peopleInScene().find(person => person.id === id);
      if (!person) return false;
      const p = person.state.position;
      telephoto.aimAt(new THREE.Vector3(p.x, (p.y || 0) + 1.2, p.z), zoom, true);
      renderer.render(scene, camera);
      return true;
    },
    people: () => peopleInScene().map(person => person.id),
    notebook: () => missionNotebook.entries(),
    exportMission: () => exportMission(missionLedger, missionNotebook),
    identified: () => identified,
    aimAtMark(zoom = 12) {
      const state = markRenderPose();
      telephoto.aimAt(new THREE.Vector3(state.position.x, 1.1, state.position.z), zoom, true);
      renderer.render(scene, camera);
      return { fov: camera.fov, zoom: telephoto.zoom() };
    },
    shoot() {
      // The production shutter keeps its 0.6 s cooldown; deterministic tests
      // can advance through scheduled evidence without waiting on wall time.
      lastShot = -Infinity;
      return takePhoto();
    },
    finish: () => finishSurveillance(),
    ledger: () => status(),
    stubSpeech(transcript) {
      speechStubSet = true;
      speechStub = transcript;
    },
    screen: () => phase,
  };
}
installTestHooks();
