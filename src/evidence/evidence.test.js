import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './evidence.js';

const config = {
  slots: 10,
  likeEvents: ['smell_flowers', 'buy_flowers', 'water_flowers'],
  canEvents: ['ride_bike'],
};

test('every capture uses one film slot and stores a thumbnail', () => {
  const ledger = createLedger(config);
  assert.deepEqual(ledger.capture({ eventId: null, thumbnail: 'data:image/jpeg;base64,one' }), { ok: true, remaining: 9 });
  assert.deepEqual(ledger.capture({ eventId: 'smell_flowers', thumbnail: 'data:image/jpeg;base64,two' }), { ok: true, remaining: 8 });
  const status = ledger.status();
  assert.equal(status.remaining, 8);
  assert.equal(status.photos.length, 2);
  assert.equal(status.photos[1].thumbnail, 'data:image/jpeg;base64,two');
});

test('duplicate LIKE photos count once', () => {
  const ledger = createLedger(config);
  ledger.capture({ eventId: 'smell_flowers', thumbnail: 'one' });
  ledger.capture({ eventId: 'smell_flowers', thumbnail: 'two' });
  assert.equal(ledger.status().likeCount, 1);
});

test('three distinct LIKE events complete LIKE evidence', () => {
  const ledger = createLedger(config);
  for (const eventId of config.likeEvents) ledger.capture({ eventId, thumbnail: eventId });
  const status = ledger.status();
  assert.equal(status.likeCount, 3);
  assert.equal(status.likeNeeded, 3);
  assert.equal(status.canDone, false);
  assert.equal(status.complete, false);
});

test('one CAN event completes CAN and all required evidence completes the ledger', () => {
  const ledger = createLedger(config);
  for (const eventId of [...config.likeEvents, 'ride_bike']) ledger.capture({ eventId, thumbnail: eventId });
  assert.equal(ledger.status().canDone, true);
  assert.equal(ledger.status().complete, true);
});

test('weak and null events use film but count for nothing', () => {
  const ledger = createLedger(config);
  ledger.capture({ eventId: 'push_bike', thumbnail: 'weak' });
  ledger.capture({ eventId: null, thumbnail: 'blank' });
  assert.deepEqual(
    { likeCount: ledger.status().likeCount, canDone: ledger.status().canDone, remaining: ledger.status().remaining },
    { likeCount: 0, canDone: false, remaining: 8 },
  );
});

test('capture fails at zero film and refill adds five usable slots', () => {
  const ledger = createLedger({ ...config, slots: 1 });
  assert.equal(ledger.capture({ thumbnail: 'first' }).ok, true);
  assert.deepEqual(ledger.capture({ thumbnail: 'no-film' }), { ok: false, remaining: 0 });
  assert.deepEqual(ledger.refill(5), { added: 5, remaining: 5 });
  assert.equal(ledger.capture({ eventId: 'ride_bike', thumbnail: 'after-refill' }).remaining, 4);
  assert.equal(ledger.status().photos.length, 2);
});

