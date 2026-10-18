import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './evidence.js';
import { createNotebook, exportMission } from './notebook.js';

test('notebook begins empty and creates a structured present-progressive observation', () => {
  const notebook = createNotebook();
  assert.deepEqual(notebook.entries(), []);
  const result = notebook.record({ activityId: 'smell_flowers', eventId: 'smell_flowers', photoId: 1, missionTime: 71.2 });
  assert.equal(result.added, true);
  assert.deepEqual(notebook.entries(), [{
    targetId: 'lily', activityId: 'smell_flowers', eventId: 'smell_flowers',
    text: 'Lily is smelling flowers.', photoIds: [1], firstSeenAt: 71.2,
    category: 'like', strength: 'strong',
  }]);
});

test('repeat activities append unique photo ids and keep first observation data', () => {
  const notebook = createNotebook();
  notebook.record({ activityId: 'walking', photoId: 2, missionTime: 12 });
  const repeated = notebook.record({ activityId: 'walking', photoId: 3, missionTime: 20 });
  notebook.record({ activityId: 'walking', photoId: 3, missionTime: 25 });
  assert.equal(repeated.added, false);
  assert.equal(notebook.entries().length, 1);
  assert.deepEqual(notebook.entries()[0].photoIds, [2, 3]);
  assert.equal(notebook.entries()[0].firstSeenAt, 12);
  repeated.entry.photoIds.push(99);
  const entries = notebook.entries();
  entries[0].text = 'changed';
  entries[0].photoIds.push(100);
  assert.deepEqual(notebook.entries()[0].photoIds, [2, 3]);
  assert.equal(notebook.entries()[0].text, 'Lily is walking.');
});

test('non-Lily, invisible, unidentified, unknown activities and missing photos cannot create notes', () => {
  const notebook = createNotebook();
  const frame = { activityId: 'ride_bike', eventId: 'ride_bike', photoId: 1, missionTime: 160 };
  for (const invalid of [
    { targetId: 'yellow_short' }, { visible: false }, { identified: false },
    { activityId: 'unknown' }, { photoId: null },
  ]) assert.equal(notebook.record({ ...frame, ...invalid }), null);
  assert.deepEqual(notebook.entries(), []);
});

test('weak pushing, strong riding and filler metadata derive from shared ledger rules', () => {
  const notebook = createNotebook();
  notebook.record({ activityId: 'push_bike', eventId: 'push_bike', photoId: 1 });
  notebook.record({ activityId: 'ride_bike', eventId: 'ride_bike', photoId: 2 });
  notebook.record({ activityId: 'cafe_phone', photoId: 3 });
  assert.deepEqual(notebook.entries().map(({ category, strength }) => ({ category, strength })), [
    { category: 'can', strength: 'weak' },
    { category: 'can', strength: 'strong' },
    { category: 'none', strength: 'none' },
  ]);
  const ledger = createLedger({ likeEvents: ['ride_bike'], canEvents: [] });
  const configured = createNotebook({ ledgerConfig: ledger.config() });
  configured.record({ activityId: 'ride_bike', eventId: 'ride_bike', photoId: 1 });
  assert.equal(configured.entries()[0].category, 'like');
});

test('entries are chronological and a note does not retain a thumbnail', () => {
  const notebook = createNotebook();
  notebook.record({ activityId: 'walking', photoId: 2, missionTime: 20, thumbnail: 'unused' });
  notebook.record({ activityId: 'cafe_phone', photoId: 1, missionTime: 10 });
  assert.deepEqual(notebook.entries().map(entry => entry.firstSeenAt), [10, 20]);
  assert.ok(notebook.entries().every(entry => !Object.hasOwn(entry, 'thumbnail')));
});

test('mission export references ledger photos and survives JSON round-trip', () => {
  const ledger = createLedger();
  const notebook = createNotebook({ ledgerConfig: ledger.config() });
  ledger.capture({ eventId: 'ride_bike', thumbnail: 'data:image/jpeg;base64,photo', missionTime: 160 });
  notebook.record({ activityId: 'ride_bike', eventId: 'ride_bike', photoId: 1, missionTime: 160 });
  ledger.setElapsedSeconds(165.5);
  const mission = exportMission(ledger, notebook);
  assert.deepEqual(Object.keys(mission), ['version', 'mission', 'targetId', 'elapsedSeconds', 'photos', 'observations']);
  assert.equal(mission.version, 1);
  assert.equal(mission.mission, 'surveillance-market');
  assert.equal(mission.targetId, 'lily');
  assert.equal(mission.elapsedSeconds, 165.5);
  assert.deepEqual(mission.photos, [{ id: 1, thumbnail: 'data:image/jpeg;base64,photo', missionTime: 160 }]);
  assert.deepEqual(mission.observations[0].photoIds, [mission.photos[0].id]);
  assert.deepEqual(JSON.parse(JSON.stringify(mission)), mission);
  assert.equal(ledger.status().complete, false);
  assert.equal(ledger.status().canDone, true);
});
