/**
 * Lily's deterministic surveillance loop.
 *
 * The route is intentionally data-first: poseAt only samples paths, animation
 * phases and prop phases. Scene code can therefore render the returned pose
 * without knowing which numbered segment is active.
 */

const point = (x, z, y = 0) => Object.freeze({ x, y, z });

// Stops stand Lily beside, never inside, the props in market.js. Facing 0 is
// +Z, towards the observation post, so activities stay readable from it.
const RACK = point(15, 12.85); // camera side of the parked bike (15, 12.2)
const RACK_WEST = point(12.6, 12.95); // clears the rack's west end
const CAFE_SEAT = point(-14, -12); // her chair faces the open centre table
const CAFE_TALK = point(-13.8, -11.55);
const BOOKS_WINDOW = point(-5, -19.7);
// BLOOM: smell side-on at the buckets' west end; pay on the shopkeeper's open east
// side, so nothing hides her from the post.
const SMELL = point(2.4, -19.05);
const SMELL_FACING = Math.PI / 2;
const BUY = point(6.62, -19.2); // 0.94 from the shopkeeper at (5.7, -19.4)
const BUY_FACING = -1.78; // towards the shopkeeper
const BENCH_SEAT = point(5.94, 8.16); // front half of the bench at (6, 8)
const BENCH_FACING = -0.35;
const ROBOTS_LOOK = point(-1.8, 3.4);
const WATER = point(-8, 4.5); // behind the flowerbed's rear rim

/*
 * A phase with `reach` walks to that path index by its end; other phases hold
 * position. Segments without reach phases move along the whole path. Standing
 * phases face `phase.facing ?? segment.facing`; moving phases face their travel.
 */
export const MARK_SEGMENTS = Object.freeze([
  {
    id: 'walk_rack_to_cafe', label: 'Walk from the bike rack to the cafe', duration: 30,
    path: [RACK, RACK_WEST, point(11, 3), point(5, -4), point(-7, -7), CAFE_SEAT],
    activityId: 'walking', animation: 'walk', props: [],
  },
  {
    id: 'cafe_phone', label: 'Sit at a cafe table and look at phone', duration: 16,
    activityId: 'cafe_phone',
    path: [CAFE_SEAT], facing: 0.25,
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
    path: [CAFE_SEAT, CAFE_TALK], facing: 0.45,
    animationPhases: [
      { until: 0.06, value: 'walk', activityId: 'talk_friend', reach: 1 },
      { until: 0.3, value: 'talk', activityId: 'talk_friend' },
      { until: 0.62, value: 'gesture', activityId: 'talk_friend' },
      { until: 1, value: 'talk', activityId: 'talk_friend' },
    ],
    props: [],
  },
  {
    id: 'browse_books', label: 'Walk to the BOOKS window and browse', duration: 10,
    activityId: 'browse',
    // Leaves the cafe between her chair and the next table's chair.
    path: [CAFE_TALK, point(-13.38, -12.15), point(-12.9, -13), BOOKS_WINDOW, SMELL], facing: 0,
    animationPhases: [
      { until: 0.5, value: 'walk', activityId: 'walking', reach: 3 },
      { until: 0.72, value: 'browse', activityId: 'browse', facing: Math.PI },
      { until: 1, value: 'walk', activityId: 'walking', reach: 4 },
    ],
    props: [],
  },
  {
    id: 'smell_flowers_segment', label: 'Smell flowers outside BLOOM', duration: 9,
    activityId: 'smell_flowers',
    path: [SMELL], facing: SMELL_FACING,
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
    // Round the front of the buckets to the shopkeeper.
    path: [SMELL, point(2.7, -17.95), point(5.6, -17.9), point(6.5, -18.5), BUY], facing: 0,
    animationPhases: [
      { until: 0.48, value: 'walk', activityId: 'standing', reach: 4 },
      { until: 0.85, value: 'wave', activityId: 'wave' },
      { until: 1, value: 'idle', activityId: 'standing', facing: BUY_FACING },
    ],
    props: [],
  },
  {
    id: 'buy_flowers_segment', label: 'Buy flowers at BLOOM', duration: 9,
    activityId: 'buy_flowers',
    path: [BUY], facing: BUY_FACING,
    eventId: 'buy_flowers',
    animationPhases: [
      { until: 0.34, value: 'pay', activityId: 'buy_flowers' },
      { until: 0.62, value: 'receive', activityId: 'buy_flowers' },
      { until: 1, value: 'hold_up', activityId: 'buy_flowers', facing: -0.4 },
    ],
    propPhases: [
      { until: 0.34, value: ['money'] },
      { until: 1, value: ['bouquet'] },
    ],
  },
  {
    id: 'bouquet_to_bench', label: 'Carry bouquet to the bench and sit', duration: 12,
    activityId: 'hold_flowers',
    // Round the bench's west end and sit from its front.
    path: [BUY, point(6.9, -18), point(4, 7.6), point(5.5, 8.75), BENCH_SEAT],
    animationPhases: [
      { until: 0.82, value: 'walk', activityId: 'hold_flowers', reach: 4 },
      { until: 1, value: 'sit_down', activityId: 'sit_bench', facing: BENCH_FACING },
    ],
    props: ['bouquet'],
  },
  {
    id: 'robots_window', label: 'Cross the square and look at the ROBOTS window', duration: 8,
    activityId: 'browse',
    // Step forward off the bench and round its west end.
    path: [BENCH_SEAT, point(5.6, 8.95), point(3.9, 8.1), ROBOTS_LOOK, WATER],
    animationPhases: [
      { until: 0.08, value: 'stand_up', activityId: 'sit_bench', facing: BENCH_FACING },
      { until: 0.52, value: 'walk', activityId: 'walking', reach: 3 },
      { until: 0.66, value: 'browse', activityId: 'browse', facing: -Math.PI / 2 },
      { until: 1, value: 'walk', activityId: 'walking', reach: 4 },
    ],
    props: ['bouquet'],
  },
  {
    id: 'water_flowers_segment', label: 'Water the flowerbed', duration: 10,
    activityId: 'water_flowers',
    path: [WATER], facing: 0,
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
    path: [WATER, point(-5.6, 4.4), point(2, 10), RACK_WEST, RACK],
    animationPhases: [
      { until: 0.86, value: 'walk', activityId: 'walking', reach: 4 },
      // Beside the parked bike: the bouquet goes into its basket.
      { until: 1, value: 'stow_bouquet', activityId: 'walking', facing: Math.PI / 2 },
    ],
    propPhases: [
      { until: 0.86, value: ['bouquet'] },
      { until: 1, value: ['bike', 'basket_bouquet'] },
    ],
  },
  {
    id: 'push_bike_segment', label: 'Push the bike', duration: 6,
    activityId: 'push_bike',
    path: [RACK, point(12, 16)],
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
      // A rounded final turn brings her back to the rack from the north.
      point(5, 2), point(8, 4), point(12, 8), point(12.2, 13.6), point(12.9, 15.3),
      point(14.1, 15.6), point(15, 14.4), RACK,
    ],
    eventId: 'ride_bike',
    animation: 'pedal', props: ['bike', 'basket_bouquet', 'spinning_wheels'],
  },
  {
    id: 'lock_bike', label: 'Dismount and lock the bike', duration: 10,
    activityId: 'lock_bike',
    // Facing along the rack leaves her bike exactly where the parked bike stands.
    path: [RACK], facing: Math.PI / 2,
    animationPhases: [
      { until: 0.2, value: 'dismount', activityId: 'standing' },
      { until: 0.45, value: 'lock_bike', activityId: 'lock_bike' },
      { until: 0.72, value: 'tie_shoe', activityId: 'tie_shoe', facing: 0 },
      { until: 1, value: 'check_phone', activityId: 'cafe_phone', facing: 0 },
    ],
    propPhases: [
      { until: 0.45, value: ['bike', 'basket_bouquet'] },
      { until: 0.72, value: [] },
      { until: 1, value: ['phone'] },
    ],
  },
  {
    id: 'music_to_cafe', label: 'Walk to MUSIC then towards the cafe', duration: 36,
    activityId: 'walking',
    path: [RACK, RACK_WEST, point(11, 5), point(7, -1), point(2, -5), point(-10, 1), point(-20.3, -2.6),
      point(-20.2, -5.5), point(-16, -10.9), CAFE_SEAT],
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

function phaseIndexAt(phases, progress) {
  if (!phases?.length) return -1;
  const index = phases.findIndex(candidate => progress < candidate.until);
  return index < 0 ? phases.length - 1 : index;
}

function activityAt(segment, progress) {
  const phases = segment.animationPhases;
  const phase = phases?.find(candidate => progress < candidate.until) || phases?.[phases.length - 1];
  return phase?.activityId || segment.activityId;
}

/** Cumulative leg lengths and the progress windows in which Lily walks them. */
function motionPlan(segment) {
  const { path, animationPhases: phases } = segment;
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  const total = cumulative[cumulative.length - 1];
  const moves = [];
  if (phases?.some(phase => Number.isInteger(phase.reach))) {
    let start = 0, reached = 0;
    for (const phase of phases) {
      if (Number.isInteger(phase.reach)) {
        moves.push({ start, end: phase.until, from: cumulative[reached], to: cumulative[phase.reach] });
        reached = phase.reach;
      }
      start = phase.until;
    }
  } else if (total > 0) {
    moves.push({ start: 0, end: 1, from: 0, to: total });
  }
  return { cumulative, total, moves };
}
const PLANS = MARK_SEGMENTS.map(motionPlan);

function travelAt(plan, progress, duration) {
  let distance = 0;
  for (const move of plan.moves) {
    if (progress >= move.end) { distance = move.to; continue; }
    if (progress > move.start) {
      const span = move.end - move.start;
      return {
        distance: move.from + (move.to - move.from) * (progress - move.start) / span,
        speed: (move.to - move.from) / (span * duration),
      };
    }
    break;
  }
  return { distance, speed: 0 };
}

function pointAlong(path, cumulative, distance) {
  if (path.length === 1) return { position: { ...path[0] }, heading: null };
  let leg = 0;
  while (leg < path.length - 2 && distance > cumulative[leg + 1]) leg += 1;
  const from = path[leg], to = path[leg + 1];
  const length = cumulative[leg + 1] - cumulative[leg];
  const ratio = length ? Math.min(1, Math.max(0, (distance - cumulative[leg]) / length)) : 0;
  return {
    position: {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
      z: from.z + (to.z - from.z) * ratio,
    },
    heading: Math.atan2(to.x - from.x, to.z - from.z),
  };
}

function segmentAt(loopTime) {
  let index = SEGMENT_WINDOWS.findIndex(window => loopTime < window.end);
  if (index < 0) index = 0;
  return { index, progress: (loopTime - SEGMENT_WINDOWS[index].start) / MARK_SEGMENTS[index].duration };
}

/** Heading before turn smoothing: travel direction while moving, else the phase's facing. */
function rawHeading(loopTime) {
  const { index, progress } = segmentAt(loopTime);
  const segment = MARK_SEGMENTS[index], plan = PLANS[index];
  const travel = travelAt(plan, progress, segment.duration);
  const along = pointAlong(segment.path, plan.cumulative, travel.distance);
  if (travel.speed > 0) return along.heading;
  const phase = segment.animationPhases?.[phaseIndexAt(segment.animationPhases, progress)];
  return phase?.facing ?? segment.facing ?? along.heading ?? 0;
}

// Turns ease over this window instead of snapping at corners and phase changes.
const TURN_SECONDS = 0.6;
const TURN_SAMPLES = 7;
function smoothHeading(loopTime) {
  let previous = rawHeading(wrappedTime(loopTime - TURN_SECONDS)), sum = previous;
  for (let i = TURN_SAMPLES - 2; i >= 0; i -= 1) {
    const heading = rawHeading(wrappedTime(loopTime - TURN_SECONDS * i / (TURN_SAMPLES - 1)));
    previous += Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    sum += previous;
  }
  const mean = sum / TURN_SAMPLES;
  return Math.atan2(Math.sin(mean), Math.cos(mean));
}

/** Sample Lily's pose at an absolute mission time in seconds. */
export function poseAt(t) {
  const loopTime = wrappedTime(t);
  const { index: segmentIndex, progress } = segmentAt(loopTime);
  const segment = MARK_SEGMENTS[segmentIndex];
  const plan = PLANS[segmentIndex];
  const travel = travelAt(plan, progress, segment.duration);
  const sampled = pointAlong(segment.path, plan.cumulative, travel.distance);
  const props = phaseValue(segment.propPhases, progress, segment.props || []);
  const phases = segment.animationPhases;
  const phaseIndex = phaseIndexAt(phases, progress);
  const phaseStart = phaseIndex > 0 ? phases[phaseIndex - 1].until : 0;
  const phaseEnd = phaseIndex >= 0 ? phases[phaseIndex].until : 1;

  return {
    loopTime,
    loopCount: Math.floor((Number.isFinite(Number(t)) ? Number(t) : 0) / LOOP_SECONDS),
    segmentIndex,
    segmentId: segment.id,
    segmentProgress: progress,
    // Seconds into the current animation phase, and its length (render-only).
    phaseElapsed: (progress - phaseStart) * segment.duration,
    phaseDuration: (phaseEnd - phaseStart) * segment.duration,
    position: sampled.position,
    // Distance walked along this segment's path and the current walking speed (render-only).
    travelDistance: travel.distance,
    travelSpeed: travel.speed,
    heading: smoothHeading(loopTime),
    animation: phaseValue(phases, progress, segment.animation || 'idle'),
    activityId: activityAt(segment, progress),
    props: [...props],
    eventId: segment.eventId || null,
    weak: Boolean(segment.weak),
  };
}
