import * as THREE from 'three';
import { DATA } from './shared/data.js';
import { Evaluate } from './shared/evaluate.js';
import { Recorder } from './shared/recorder.js';
import { Sfx } from './shared/sfx.js';
import { createMarketScene } from './scene/market.js';
import { createPerson, updatePerson } from './scene/people.js';
import { AMBIENT_NPCS, BLOOM_SHOPKEEPER, poseAmbientAt } from './sim/ambient.js';
import { LOOP_SECONDS, poseAt } from './sim/markRoute.js';
import { createTelephoto } from './camera/telephoto.js';
import { createLedger } from './evidence/evidence.js';
import { captureThumbnail, judgePhoto, playShutterEffect, playShutterSound } from './evidence/photo.js';
import { createHud } from './ui/hud.js';
import { createReview } from './ui/review.js';
import { createDeduction } from './ui/deduction.js';
import { createReport } from './ui/report.js';

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
    hairStyle: appearance.hair === 'bob' ? 'long' : appearance.hair,
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

let missionLedger = createLedger();
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
        <p class="briefing-card__description">Observe from the window. Photograph evidence that shows what she likes and what she can do.</p>
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
  onShoot: () => takePhoto(),
  onFinish: () => finishSurveillance(),
  onZoom: value => telephoto.setSlider(value),
  onResume: () => setPaused(false),
});
const review = createReview({ parent: app, onReport: () => beginDeduction() });
const deduction = createDeduction({
  parent: app,
  character: lily,
  onRecord: () => handleRecord(),
  onChoice: choice => handleChoice(choice),
});
const report = createReport({ parent: app, onPlayAgain: () => window.location.reload() });
hud.hide();
review.hide();
deduction.hide();
report.hide();

let telephoto;
telephoto = createTelephoto({
  camera,
  canvas,
  onShoot: () => takePhoto(),
  onPause: () => {
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
  return { ...state, animation: evidenceAnimation, height: 2.1, occluders: market.occluders };
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
    animation: markState.eventId === 'buy_flowers' ? 'gesture' : 'idle',
  }, missionTime);
  market.update(missionTime);
  return markState;
}

function status() {
  return missionLedger.status();
}

function updateHud() {
  const current = status();
  hud.setPhotos(current.photos.length, current.photos.length + current.remaining);
  hud.setShutterEnabled(current.remaining > 0 && phase === 'surveillance' && !paused && sceneRevealed);
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
  hud.showHint('Watch the mark carefully. Take photos of useful evidence.', 6000);
  Sfx.bgmStart();
}

function setPaused(value) {
  paused = Boolean(value);
  hud.setPaused(paused);
  telephoto.setEnabled(!paused && phase === 'surveillance');
  updateHud();
}

function maybeLocationHint() {
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
  const result = missionLedger.capture({ eventId, thumbnail });
  if (!result.ok) return result;
  playShutterEffect(stage);
  playShutterSound(Sfx);
  hud.showToast('PHOTO SAVED');
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
    maybeLocationHint();
  }
  resize();
  updateWorld();
  telephoto.update(dt);
  renderer.render(scene, camera);
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
      updateWorld();
      return markRenderPose();
    },
    markState: () => markRenderPose(),
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
