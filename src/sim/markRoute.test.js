import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_SECONDS, MARK_SEGMENTS, SEGMENT_WINDOWS, poseAt } from './markRoute.js';
import { ACTIVITIES } from './activities.js';

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

test('every segment and phase names a known activity throughout the unchanged loop', () => {
  assert.equal(LOOP_SECONDS, 210);
  for (const segment of MARK_SEGMENTS) {
    assert.ok(Object.hasOwn(ACTIVITIES, segment.activityId), segment.id);
    for (const phase of segment.animationPhases || []) {
      assert.ok(Object.hasOwn(ACTIVITIES, phase.activityId), `${segment.id}/${phase.value}`);
    }
  }
  for (let t = 0; t < LOOP_SECONDS; t += 0.1) {
    assert.ok(Object.hasOwn(ACTIVITIES, poseAt(t).activityId), `t=${t}`);
  }
});

// Static footprints copied from scene/market.js (x/z centres, half sizes or radii).
const circle = (name, x, z, r) => ({ name, gap: (px, pz) => Math.hypot(px - x, pz - z) - r });
const box = (name, x, z, hx, hz, rotation = 0) => ({
  name,
  gap(px, pz) {
    const c = Math.cos(rotation), s = Math.sin(rotation), dx = px - x, dz = pz - z;
    const lx = Math.abs(dx * c - dz * s) - hx, lz = Math.abs(dx * s + dz * c) - hz;
    return Math.max(lx, lz) <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
  },
});
const OBSTACLES = [
  circle('fountain', 0, 0, 2.42),
  box('flowerbed', -8, 6, 1.98, 1.14),
  ...[0, 1, 2, 3].map(i => circle(`bloom bucket ${i}`, 4 + (i - 1.5) * .62, -19 + (i % 2) * .3, .31)),
  box('bloom crate west', 1.3, -20.07, .48, .42), box('bloom crate east', 8.65, -20.07, .48, .42),
  circle('shopkeeper', 5.7, -19.4, .3),
  box('bloom facade trim', 5, -20.74, 4.6, .24),
  box('bike rack and parked bike', 15, 12.1, 1.9, .45),
  ...[[-16.3, -12], [-14, -10.4], [-11.7, -12]].flatMap(([x, z], i) => [
    circle(`cafe table ${i}`, x, z, .72), box(`cafe chair ${i}W`, x - 1, z, .3, .25), box(`cafe chair ${i}E`, x + 1, z, .3, .25),
  ]),
  { ...box('lily cafe chair', -14.06, -12.21, .25, .3, .25), seat: { x: -14, z: -12 } },
  { ...box('bench (6, 8)', 6, 8, 1.15, .32, Math.PI - .35), seat: { x: 5.94, z: 8.16 } },
  box('bench (-3, -9)', -3, -9, 1.15, .32, .25),
  ...[[-20, -16], [20, -16], [-20, 15], [20, 15]].map(([x, z]) => circle('lamp', x, z, .25)),
  circle('bin', -19.3, 17, .37), circle('bin', 19.3, -18, .37), circle('planter', -20, 4, .53), circle('planter', 20, -2, .53),
];

test('Lily keeps her body clear of props, facades and the shopkeeper', () => {
  const RADIUS = 0.2;
  for (let t = 0; t < LOOP_SECONDS; t += 0.05) {
    const { position: { x, z }, segmentId } = poseAt(t);
    assert.ok(z >= -20.5 + RADIUS, `${segmentId} enters the north facades at t=${t.toFixed(2)}`);
    assert.ok(Math.abs(x) <= 21.5 - RADIUS, `${segmentId} enters a side facade at t=${t.toFixed(2)}`);
    for (const obstacle of OBSTACLES) {
      // Her own chair and the bench are only entered at their seat, from the front.
      if (obstacle.seat && Math.hypot(x - obstacle.seat.x, z - obstacle.seat.z) < .6) continue;
      assert.ok(obstacle.gap(x, z) >= RADIUS - 1e-9,
        `${segmentId} clips ${obstacle.name} at t=${t.toFixed(2)} (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

test('Lily faces her travel direction while walking and turns smoothly', () => {
  for (let t = 0.05; t < LOOP_SECONDS; t += 0.05) {
    const pose = poseAt(t), earlier = poseAt(t - 0.05);
    const turn = Math.abs(Math.atan2(Math.sin(pose.heading - earlier.heading), Math.cos(pose.heading - earlier.heading)));
    // Seven samples over 0.6 s: no single 50 ms step turns her more than ~31 degrees.
    assert.ok(turn < 0.55, `${pose.segmentId} snaps ${turn.toFixed(2)} rad at t=${t.toFixed(2)}`);
    if (pose.travelSpeed > 0) {
      const ahead = poseAt(t + 0.02).position;
      const dx = ahead.x - pose.position.x, dz = ahead.z - pose.position.z;
      const settled = [poseAt(t - 0.6), poseAt(t + 0.6)]
        .every(other => other.travelSpeed > 0 && other.segmentId === pose.segmentId);
      if (settled && Math.hypot(dx, dz) > 1e-6) {
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - pose.heading), Math.cos(Math.atan2(dx, dz) - pose.heading)));
        assert.ok(off < Math.PI / 2, `${pose.segmentId} walks sideways or backwards at t=${t.toFixed(2)}`);
      }
    }
  }
});

test('standing phases hold position and walking phases move', () => {
  for (const window of SEGMENT_WINDOWS) {
    for (let t = window.start + 0.05; t < window.end - 0.05; t += 0.1) {
      const pose = poseAt(t), next = poseAt(t + 0.05);
      if (next.segmentId !== pose.segmentId || next.animation !== pose.animation) continue;
      const moved = Math.hypot(next.position.x - pose.position.x, next.position.z - pose.position.z);
      if (pose.travelSpeed === 0) assert.ok(moved < 1e-9, `${pose.segmentId}/${pose.animation} slides at t=${t.toFixed(2)}`);
    }
  }
  assert.equal(poseAt(SEGMENT_WINDOWS.find(w => w.id === 'robots_window').start + 6).animation, 'walk');
  assert.ok(poseAt(SEGMENT_WINDOWS.find(w => w.id === 'browse_books').start + 6).travelSpeed === 0);
});

test('phase observations distinguish waiting, waving, carrying, sitting, and bike chores', () => {
  const sample = (id, fraction) => {
    const window = SEGMENT_WINDOWS.find(entry => entry.id === id);
    return poseAt(window.start + (window.end - window.start) * fraction).activityId;
  };
  assert.equal(sample('wait_wave', 0.1), 'standing');
  assert.equal(sample('wait_wave', 0.5), 'wave');
  assert.equal(sample('bouquet_to_bench', 0.5), 'hold_flowers');
  assert.equal(sample('bouquet_to_bench', 0.9), 'sit_bench');
  assert.equal(sample('lock_bike', 0.3), 'lock_bike');
  assert.equal(sample('lock_bike', 0.6), 'tie_shoe');
  assert.equal(sample('lock_bike', 0.9), 'cafe_phone');
});

