import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_SECONDS, MARK_SEGMENTS, SEGMENT_WINDOWS, poseAt } from './markRoute.js';

test('mark route has 15 segments, is about 210 seconds, and wraps', () => {
  assert.equal(MARK_SEGMENTS.length, 15);
  assert.ok(LOOP_SECONDS >= 205 && LOOP_SECONDS <= 215);
  assert.deepEqual(poseAt(0).position, poseAt(LOOP_SECONDS).position);
  assert.equal(poseAt(7.25).segmentId, poseAt(LOOP_SECONDS + 7.25).segmentId);
  assert.equal(poseAt(-1).segmentId, poseAt(LOOP_SECONDS - 1).segmentId);
});

test('every event id occurs exactly in its declared segment window', () => {
  const eventWindows = SEGMENT_WINDOWS.filter(window => window.eventId);
  assert.deepEqual(eventWindows.map(window => window.eventId), [
    'smell_flowers',
    'buy_flowers',
    'water_flowers',
    'push_bike',
    'ride_bike',
  ]);

  for (let t = 0; t < LOOP_SECONDS; t += 0.125) {
    const expected = SEGMENT_WINDOWS.find(window => t >= window.start && t < window.end)?.eventId || null;
    assert.equal(poseAt(t).eventId, expected, `unexpected event at t=${t}`);
  }

  for (const window of eventWindows) {
    assert.equal(poseAt(window.start).eventId, window.eventId);
    assert.equal(poseAt(window.end - 1e-6).eventId, window.eventId);
    assert.notEqual(poseAt(window.end).eventId, window.eventId);
  }
});

test('all sampled mark positions remain inside the square and bike-rack area', () => {
  for (let t = 0; t < LOOP_SECONDS; t += 0.1) {
    const { x, y, z } = poseAt(t).position;
    assert.ok(x >= -22 && x <= 22, `x=${x} at t=${t}`);
    assert.ok(z >= -20 && z <= 20, `z=${z} at t=${t}`);
    assert.equal(y, 0);
  }
});

