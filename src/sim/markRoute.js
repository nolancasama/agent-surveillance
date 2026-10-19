/**
 * Lily's deterministic surveillance loop.
 *
 * The route is intentionally data-first: poseAt only samples paths, animation
 * phases and prop phases. Scene code can therefore render the returned pose
 * without knowing which numbered segment is active.
 */

const point = (x, z, y = 0) => Object.freeze({ x, y, z });

export const MARK_SEGMENTS = Object.freeze([
  {
    id: 'walk_rack_to_cafe', label: 'Walk from the bike rack to the cafe', duration: 30,
    path: [point(15, 12), point(11, 3), point(5, -4), point(-7, -7), point(-14, -12)],
    activityId: 'walking', animation: 'walk', props: [],
  },
  {
    id: 'cafe_phone', label: 'Sit at a cafe table and look at phone', duration: 16,
    activityId: 'cafe_phone',
    path: [point(-14, -12)], facing: 0.25,
    animationPhases: [
      { until: 0.16, value: 'sit_down', activityId: 'cafe_phone' },
      { until: 0.88, value: 'sit_phone', activityId: 'cafe_phone' },
      { until: 1, value: 'stand_up', activityId: 'cafe_phone' },
    ],
    props: ['phone'],
  },
  {
    id: 'talk_friend', label: 'Talk with a friend at the cafe', duration: 12,
    activityId: 'talk_friend',
    path: [point(-14, -12)], facing: 0.45,
    animationPhases: [
      { until: 0.3, value: 'talk', activityId: 'talk_friend' },
      { until: 0.62, value: 'gesture', activityId: 'talk_friend' },
      { until: 1, value: 'talk', activityId: 'talk_friend' },
    ],
    props: [],
  },
  {
    id: 'browse_books', label: 'Walk to the BOOKS window and browse', duration: 10,
    activityId: 'browse',
    path: [point(-14, -12), point(-5, -19), point(4, -19)], facing: 0,
    animationPhases: [
      { until: 0.7, value: 'walk', activityId: 'walking' },
      { until: 1, value: 'browse', activityId: 'browse' },
    ],
    props: [],
  },
  {
    id: 'smell_flowers_segment', label: 'Smell flowers outside BLOOM', duration: 9,
    activityId: 'smell_flowers',
    path: [point(4, -19)], facing: 0,
    eventId: 'smell_flowers',
    animationPhases: [
      { until: 0.2, value: 'bend', activityId: 'smell_flowers' },
      { until: 0.78, value: 'smell', activityId: 'smell_flowers' },
      { until: 1, value: 'straighten', activityId: 'smell_flowers' },
    ],
    props: [],
  },
  {
    id: 'wait_wave', label: 'Wait and wave near BLOOM', duration: 6,
    activityId: 'wave',
    path: [point(4, -19), point(5.5, -18.5)], facing: 0,
    animationPhases: [
      { until: 0.42, value: 'idle', activityId: 'standing' },
      { until: 0.8, value: 'wave', activityId: 'wave' },
      { until: 1, value: 'idle', activityId: 'standing' },
    ],
    props: [],
  },
  {
    id: 'buy_flowers_segment', label: 'Buy flowers at BLOOM', duration: 9,
    activityId: 'buy_flowers',
    path: [point(5.5, -18.5)], facing: 0,
    eventId: 'buy_flowers',
    animationPhases: [
      { until: 0.34, value: 'pay', activityId: 'buy_flowers' },
      { until: 0.62, value: 'receive', activityId: 'buy_flowers' },
      { until: 1, value: 'hold_up', activityId: 'buy_flowers' },
    ],
    propPhases: [
      { until: 0.34, value: ['money'] },
      { until: 1, value: ['bouquet'] },
    ],
  },
  {
    id: 'bouquet_to_bench', label: 'Carry bouquet to the bench and sit', duration: 12,
    activityId: 'hold_flowers',
    path: [point(5.5, -18.5), point(2, -5), point(6, 8)], facing: 0,
    animationPhases: [
      { until: 0.82, value: 'walk', activityId: 'hold_flowers' },
      { until: 1, value: 'sit_down', activityId: 'sit_bench' },
    ],
    props: ['bouquet'],
  },
  {
    id: 'robots_window', label: 'Walk to the ROBOTS window and look', duration: 8,
    activityId: 'browse',
    path: [point(6, 8), point(-21, -5), point(-8, 6)], facing: Math.PI / 2,
    animationPhases: [
      { until: 0.78, value: 'walk', activityId: 'walking' },
      { until: 1, value: 'browse', activityId: 'browse' },
    ],
    props: ['bouquet'],
  },
  {
    id: 'water_flowers_segment', label: 'Water the flowerbed', duration: 10,
    activityId: 'water_flowers',
    path: [point(-8, 6)], facing: 0,
    eventId: 'water_flowers',
    animationPhases: [
      { until: 0.22, value: 'take_watering_can', activityId: 'water_flowers' },
      { until: 0.82, value: 'water_flowers', activityId: 'water_flowers' },
      { until: 1, value: 'put_watering_can', activityId: 'water_flowers' },
    ],
    propPhases: [
      { until: 0.22, value: [] },
      { until: 0.82, value: ['watering_can', 'water_stream'] },
      { until: 1, value: ['watering_can'] },
    ],
  },
  {
    id: 'walk_to_bike_rack', label: 'Walk to the bike rack and stow bouquet', duration: 20,
    activityId: 'walking',
    path: [point(-8, 6), point(2, 10), point(15, 12)], facing: 0,
    animation: 'walk',
    propPhases: [
      { until: 0.78, value: ['bouquet'] },
      { until: 1, value: ['bike', 'basket_bouquet'] },
    ],
  },
  {
    id: 'push_bike_segment', label: 'Push the bike', duration: 6,
    activityId: 'push_bike',
    path: [point(15, 12), point(12, 16)], facing: 0,
    eventId: 'push_bike', weak: true,
    animation: 'push_bike', props: ['bike', 'basket_bouquet'],
  },
  {
    id: 'ride_bike_segment', label: 'Ride a lap around the square', duration: 16,
    activityId: 'ride_bike',
    path: [
      point(12, 16), point(12, 8), point(8, 4), point(5, 2),
      point(5, -2), point(3, -5), point(-1, -6), point(-4, -4),
      point(-5, 0), point(-3.8, 3.2), point(0, 5), point(3.5, 4.2),
      point(5, 2), point(8, 4), point(12, 8), point(12, 16), point(15, 12),
    ],
    eventId: 'ride_bike',
    animation: 'pedal', props: ['bike', 'basket_bouquet', 'spinning_wheels'],
  },
  {
    id: 'lock_bike', label: 'Dismount and lock the bike', duration: 10,
    activityId: 'lock_bike',
    path: [point(15, 12)], facing: 0,
    animationPhases: [
      { until: 0.2, value: 'dismount', activityId: 'standing' },
      { until: 0.45, value: 'lock_bike', activityId: 'lock_bike' },
      { until: 0.72, value: 'tie_shoe', activityId: 'tie_shoe' },
      { until: 1, value: 'check_phone', activityId: 'cafe_phone' },
    ],
    propPhases: [
      { until: 0.45, value: ['bike', 'basket_bouquet'] },
      { until: 1, value: ['phone'] },
    ],
  },
  {
    id: 'music_to_cafe', label: 'Walk to MUSIC then towards the cafe', duration: 36,
    activityId: 'walking',
    path: [point(15, 12), point(11, 5), point(7, -1), point(2, -5), point(-10, 1), point(-21, -3), point(-14, -12)],
    animation: 'walk', props: [],
  },
]);

export const LOOP_SECONDS = MARK_SEGMENTS.reduce((sum, segment) => sum + segment.duration, 0);

let elapsed = 0;
export const SEGMENT_WINDOWS = Object.freeze(MARK_SEGMENTS.map((segment, index) => {
  const start = elapsed;
  elapsed += segment.duration;
  return Object.freeze({ index, id: segment.id, eventId: segment.eventId || null, start, end: elapsed });
}));

function wrappedTime(t) {
  const numeric = Number.isFinite(Number(t)) ? Number(t) : 0;
  return ((numeric % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
}

function phaseValue(phases, progress, fallback) {
  if (!phases || !phases.length) return fallback;
  const entry = phases.find(candidate => progress < candidate.until) || phases[phases.length - 1];
  return entry.value;
}

function activityAt(segment, progress) {
  const phases = segment.animationPhases;
  const phase = phases?.find(candidate => progress < candidate.until) || phases?.[phases.length - 1];
  return phase?.activityId || segment.activityId;
}

function samplePath(path, progress) {
  if (path.length === 1) return { position: { ...path[0] }, heading: 0, total: 0 };

  const lengths = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x;
    const dz = path[i].z - path[i - 1].z;
    const length = Math.hypot(dx, dz);
    lengths.push(length);
    total += length;
  }

  let distance = Math.min(1, Math.max(0, progress)) * total;
  let leg = 0;
  while (leg < lengths.length - 1 && distance > lengths[leg]) {
    distance -= lengths[leg];
    leg += 1;
  }

  const from = path[leg];
  const to = path[leg + 1];
  const ratio = lengths[leg] ? Math.min(1, distance / lengths[leg]) : 0;
  return {
    position: {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
      z: from.z + (to.z - from.z) * ratio,
    },
    heading: Math.atan2(to.x - from.x, to.z - from.z),
    total,
  };
}

/** Sample Lily's pose at an absolute mission time in seconds. */
export function poseAt(t) {
  const loopTime = wrappedTime(t);
  let segmentIndex = SEGMENT_WINDOWS.findIndex(window => loopTime < window.end);
  if (segmentIndex < 0) segmentIndex = 0;

  const segment = MARK_SEGMENTS[segmentIndex];
  const window = SEGMENT_WINDOWS[segmentIndex];
  const progress = (loopTime - window.start) / segment.duration;
  const sampled = samplePath(segment.path, progress);
  const props = phaseValue(segment.propPhases, progress, segment.props || []);

  return {
    loopTime,
    loopCount: Math.floor((Number.isFinite(Number(t)) ? Number(t) : 0) / LOOP_SECONDS),
    segmentIndex,
    segmentId: segment.id,
    segmentProgress: progress,
    position: sampled.position,
    // Distance along this segment's path and its constant travel speed (render-only).
    travelDistance: Math.min(1, Math.max(0, progress)) * sampled.total,
    travelSpeed: sampled.total / segment.duration,
    heading: Number.isFinite(segment.facing) ? segment.facing : sampled.heading,
    animation: phaseValue(segment.animationPhases, progress, segment.animation || 'idle'),
    activityId: activityAt(segment, progress),
    props: [...props],
    eventId: segment.eventId || null,
    weak: Boolean(segment.weak),
  };
}
