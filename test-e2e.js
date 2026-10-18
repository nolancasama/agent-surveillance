import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { SEGMENT_WINDOWS } from './src/sim/markRoute.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('dist');
const shots = resolve('.shots');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await mkdir(shots, { recursive: true });
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

async function thumbnailStats(dataUrl) {
  return page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let sumSquares = 0;
    const count = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
      sum += luminance;
      sumSquares += luminance * luminance;
    }
    const mean = sum / count;
    return { mean, variance: (sumSquares / count) - (mean * mean) };
  }, dataUrl);
}

async function assertThumbnailNotBlank(dataUrl, label) {
  const stats = await thumbnailStats(dataUrl);
  assert.ok(stats.mean > 24 && stats.variance > 80,
    `${label} must contain a visible scene (mean=${stats.mean.toFixed(1)}, variance=${stats.variance.toFixed(1)})`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/?test`, { waitUntil: 'networkidle' });
  await page.locator('.briefing-screen .primary-button').click();
  await page.locator('#surveillance-canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__surv.state().revealed === true);
  const sceneState = await page.evaluate(() => window.__surv.state());
  assert.equal(sceneState.markExists, true);
  assert.ok(sceneState.npcCount >= 12);
  await page.screenshot({ path: join(shots, 'wide-view.png') });
  await page.screenshot({ path: join(shots, 'dossier-panel.png') });
  assert.equal(await page.evaluate(() => window.__surv.identified()), false);
  assert.equal(await page.locator('.shutter-button').textContent(), 'MARK TARGET');
  assert.equal((await page.evaluate(() => window.__surv.shoot())).reason, 'unidentified');
  assert.equal(await page.evaluate(() => window.__surv.ledger().photos.length), 0);
  assert.ok((await page.evaluate(() => window.__surv.people())).includes('yellow_short'));
  await page.evaluate(() => window.__surv.aimAtPerson('yellow_short', 12));
  const rejected = await page.evaluate(() => window.__surv.markTarget());
  assert.equal(rejected.ok, false);
  assert.equal(rejected.id, 'yellow_short');
  assert.equal(await page.evaluate(() => window.__surv.identified()), false);
  assert.match(await page.locator('.hud__hint').textContent(), /does not match/);
  await page.evaluate(() => {
    window.__surv.setTime(10);
    window.__surv.aimAtPerson('lily', 12);
  });
  assert.equal((await page.evaluate(() => window.__surv.markTarget())).ok, true);
  assert.equal(await page.evaluate(() => window.__surv.identified()), true);
  assert.equal(await page.locator('.shutter-button').textContent(), 'TAKE PHOTO');
  await page.screenshot({ path: join(shots, 'mark-confirmation.png') });

  const wideFov = sceneState.fov;
  await page.evaluate(() => window.__surv.aimAtMark(12));
  const zoomedFov = await page.evaluate(() => window.__surv.state().fov);
  assert.ok(zoomedFov < wideFov);

  const eventIds = ['smell_flowers', 'buy_flowers', 'water_flowers', 'ride_bike'];
  for (const eventId of eventIds) {
    const segment = SEGMENT_WINDOWS.find(item => item.eventId === eventId);
    const time = (segment.start + segment.end) / 2;
    await page.evaluate(({ at }) => {
      window.__surv.setTime(at);
      window.__surv.aimAtMark(12);
    }, { at: time });
    await page.screenshot({ path: join(shots, `${eventId}.png`) });
    await page.evaluate(() => window.__surv.shoot());
    if (eventId === 'smell_flowers') {
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(shots, 'note-toast.png') });
    }
    await page.waitForTimeout(650);
    const captured = await page.evaluate(() => window.__surv.ledger().photos.at(-1));
    await assertThumbnailNotBlank(captured.thumbnail, `${eventId} thumbnail`);

    if (eventId === 'smell_flowers') {
      const before = await page.evaluate(() => window.__surv.ledger().likeCount);
      await page.evaluate(() => window.__surv.shoot());
      await page.waitForTimeout(650);
      const duplicate = await page.evaluate(() => window.__surv.ledger().photos.at(-1));
      await assertThumbnailNotBlank(duplicate.thumbnail, 'duplicate smell_flowers thumbnail');
      const after = await page.evaluate(() => window.__surv.ledger().likeCount);
      assert.equal(after, before, 'duplicate LIKE evidence must count once');
    }
  }

  const ledger = await page.evaluate(() => window.__surv.ledger());
  assert.equal(ledger.complete, true);
  assert.ok(ledger.photos.length >= 5);
  assert.ok(ledger.photos[0].thumbnail.startsWith('data:image/jpeg'));
  const notes = await page.evaluate(() => window.__surv.notebook());
  assert.equal(notes.length, 4);
  assert.equal(notes[0].photoIds.length, 2);
  const exported = await page.evaluate(() => JSON.parse(JSON.stringify(window.__surv.exportMission())));
  assert.equal(exported.version, 1);
  assert.equal(exported.observations.length, 4);
  await page.keyboard.press('n');
  assert.equal(await page.evaluate(() => window.__surv.state().paused), true);
  const pausedTime = await page.evaluate(() => window.__surv.state().time);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__surv.state().time), pausedTime);
  await page.screenshot({ path: join(shots, 'field-notebook.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__surv.state().paused), false);
  await page.evaluate(() => window.__surv.finish());
  await page.locator('[data-screen="review"]').waitFor({ state: 'visible' });
  const labels = await page.locator('[data-screen="review"] .photo-card__label').allTextContents();
  assert.ok(labels.every((label, index) => label === `PHOTO ${index + 1}`));
  await page.screenshot({ path: join(shots, 'review.png') });
  await page.locator('[data-screen="review"] .notebook-button').click();
  await page.keyboard.press('Escape');

  await page.locator('[data-screen="review"] .primary-button').click();
  await page.screenshot({ path: join(shots, 'deduction.png') });
  await page.locator('[data-screen="deduction"] .notebook-button').click();
  await page.keyboard.press('Escape');
  const answer = async transcript => {
    await page.evaluate(value => window.__surv.stubSpeech(value), transcript);
    await page.locator('.record-button').click();
    await page.waitForTimeout(650);
  };
  await answer('This is Lily.');
  await answer('She likes robots.');
  await page.waitForTimeout(50);
  assert.match(await page.locator('.deduction-feedback').textContent(), /doesn't match/i);
  await answer('She likes flowers.');
  await answer('She can ride a bike.');
  await page.locator('[data-screen="report"]').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(shots, 'report.png') });
  assert.equal(await page.evaluate(() => window.__surv.screen()), 'report');
  assert.deepEqual(pageErrors, []);
  console.log('Agent Surveillance e2e passed; screenshots saved to .shots/.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
