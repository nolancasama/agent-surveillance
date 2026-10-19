/** Deterministic, DOM-free background cast and route sampling. */

function hashSeed(seed) {
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32: tiny, repeatable and sufficient for visual route variation. */
export function createSeededRng(seed = 'agent-surveillance') {
  let state = hashSeed(seed);
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const p = (x, z, hold = 1, animation = 'idle', fixed = false) => ({ x, y: 0, z, hold, animation, fixed });

// Twelve background people, including the required three visual decoys and
// Lily's cafe friend. The stationary BLOOM shopkeeper is exported separately.
const TEMPLATES = [
  {
    id: 'cafe_friend', role: 'cafe_friend', behavior: 'talk',
    appearance: { skin: '#8b5b3f', hairColor: '#17120f', hair: 'curly', shirt: '#37b7d8', bottom: '#303a56' },
    speed: 0.9, route: [p(-12.5, -11.2, 11, 'talk', true), p(-12.35, -11, 9, 'gesture', true)],
  },
  {
    id: 'yellow_short', role: 'decoy_yellow_shirt', behavior: 'wander',
    appearance: { skin: '#e7b98c', hairColor: '#4b2d1c', hair: 'short', shirt: '#f4c518', bottom: '#717780' },
    speed: 1.05, route: [p(-5, 13, 2), p(-2, 13, 4, 'phone'), p(10, 2, 2), p(7, -5, 3)],
  },
  {
    id: 'orange_long_hair', role: 'decoy_long_hair_blue_skirt', behavior: 'browse',
    appearance: { skin: '#f2c197', hairColor: '#241a12', hair: 'long', shirt: '#ed7d31', bottom: '#285d9c' },
    speed: 0.95, route: [p(20, -6, 8, 'browse'), p(13, -9, 2), p(18, -16, 6, 'shopping_bag')],
  },
  {
    id: 'scooter_rider', role: 'decoy_scooter', behavior: 'scooter', mobility: 'scooter',
    appearance: { skin: '#bf815f', hairColor: '#161616', hair: 'short', shirt: '#b15bcc', bottom: '#263e57' },
    speed: 2.5, route: [p(-6, 24, 1), p(-5, 39, 1), p(3, 53, 1), p(5, 35, 1)],
  },
  {
    id: 'art_student', role: 'pedestrian', behavior: 'browse',
    appearance: { skin: '#ddb089', hairColor: '#d9a441', hair: 'bob', shirt: '#4b9b62', bottom: '#503b5c' },
    speed: 0.82, route: [p(20.8, -7.2, 8, 'browse'), p(14, -3, 2), p(18, 3, 4, 'phone')],
  },
  {
    id: 'books_reader', role: 'pedestrian', behavior: 'browse',
    appearance: { skin: '#6f4937', hairColor: '#101010', hair: 'short', shirt: '#be5353', bottom: '#383f48' },
    speed: 0.85, route: [p(-8, -19, 9, 'browse'), p(-3, -14, 3, 'walk'), p(-10, -8, 5, 'phone')],
  },
  {
    id: 'bench_sitter', role: 'pedestrian', behavior: 'sit',
    appearance: { skin: '#f0c8a0', hairColor: '#6a3f23', hair: 'bob', shirt: '#51a6a6', bottom: '#6b4d3a' },
    speed: 0.8, route: [p(-3, -9, 15, 'sit', true), p(-7, -5, 3), p(-2, -4, 3)],
  },
  {
    id: 'bakery_shopper', role: 'pedestrian', behavior: 'shop',
    appearance: { skin: '#c98d69', hairColor: '#2b1c15', hair: 'curly', shirt: '#d75992', bottom: '#314b67' },
    speed: 1.0, route: [p(21.5, -11, 7, 'browse'), p(24.2, -11, 4, 'enter_shop'), p(17, -7, 2, 'shopping_bag')],
  },
  {
    id: 'music_shopper', role: 'pedestrian', behavior: 'shop',
    appearance: { skin: '#8d5c43', hairColor: '#171717', hair: 'spiky', shirt: '#395ea8', bottom: '#25292e' },
    speed: 1.15, route: [p(-21, -3, 8, 'browse'), p(-24, -3, 4, 'enter_shop'), p(-16, 4, 2)],
  },
  {
    id: 'lawn_walker', role: 'pedestrian', behavior: 'wander',
    appearance: { skin: '#f4c9aa', hairColor: '#a33b2e', hair: 'short', shirt: '#e6a936', bottom: '#426448' },
    speed: 1.2, route: [p(9, 24, 2), p(13, 38, 2), p(8, 52, 4, 'phone'), p(0, 35, 2)],
  },
  {
    id: 'fountain_walker', role: 'pedestrian', behavior: 'wander',
    appearance: { skin: '#d5a078', hairColor: '#3a2519', hair: 'long', shirt: '#8e6bc1', bottom: '#394657' },
    speed: 1.0, route: [p(-6, 1, 2), p(-4, 9, 4, 'phone'), p(1, 11, 2), p(7, 4, 2), p(1, -5, 3)],
  },
  {
    id: 'bag_carrier', role: 'pedestrian', behavior: 'shopping_bag',
    appearance: { skin: '#b97750', hairColor: '#18120f', hair: 'curly', shirt: '#cf643d', bottom: '#29394c' },
    speed: 1.05, route: [p(18, -18, 4, 'shopping_bag'), p(11, -8, 2), p(5, 0, 3), p(13, 5, 2)],
  },
];

export function createAmbient(seed = 'agent-surveillance') {
  const random = createSeededRng(seed);
  return TEMPLATES.map(template => {
    const route = template.route.map(waypoint => {
      const jitter = waypoint.fixed ? 0 : 0.7;
      return {
        x: waypoint.x + (random() - 0.5) * jitter,
        y: waypoint.y,
        z: waypoint.z + (random() - 0.5) * jitter,
        hold: waypoint.hold * (0.88 + random() * 0.24),
        animation: waypoint.animation,
      };
    });
    const routeDistance = route.reduce((sum, waypoint, index) => {
      const next = route[(index + 1) % route.length];
      return sum + Math.hypot(next.x - waypoint.x, next.z - waypoint.z);
    }, 0);
    const estimatedLoop = routeDistance / template.speed + route.reduce((sum, waypoint) => sum + waypoint.hold, 0);
    return {
      id: template.id,
      role: template.role,
      behavior: template.behavior,
      mobility: template.mobility || 'walk',
      appearance: { ...template.appearance },
      speed: template.speed,
      phaseOffset: random() * estimatedLoop,
      route,
    };
  });
}

export const AMBIENT_NPCS = Object.freeze(createAmbient());

export const BLOOM_SHOPKEEPER = Object.freeze({
  id: 'bloom_shopkeeper',
  role: 'bloom_shopkeeper',
  behavior: 'shopkeeper',
  appearance: { skin: '#ddb089', hairColor: '#d9a441', hair: 'bob', shirt: '#4b9b62', bottom: '#503b5c' },
  position: Object.freeze({ x: 5.7, y: 0, z: -19.4 }),
  heading: 0,
});

function routeTimeline(npc) {
  const route = npc.route;
  if (!route || !route.length) return { total: 1, legs: [] };
  if (route.length === 1) return { total: Math.max(1, route[0].hold), legs: [] };

  const legs = route.map((from, index) => {
    const to = route[(index + 1) % route.length];
    const travel = Math.hypot(to.x - from.x, to.z - from.z) / Math.max(0.1, npc.speed || 1);
    return { from, to, travel, hold: Math.max(0, to.hold || 0) };
  });
  return { total: legs.reduce((sum, leg) => sum + leg.travel + leg.hold, 0), legs };
}

/** Sample one ambient NPC. `t` is absolute mission time in seconds. */
export function poseAmbientAt(npc, t) {
  const timeline = routeTimeline(npc);
  if (!timeline.legs.length) {
    const waypoint = npc.route?.[0] || { x: 0, y: 0, z: 0, animation: 'idle' };
    return { position: { x: waypoint.x, y: waypoint.y || 0, z: waypoint.z }, heading: 0, animation: waypoint.animation || 'idle', moving: false };
  }

  const rawTime = (Number.isFinite(Number(t)) ? Number(t) : 0) + (npc.phaseOffset || 0);
  let local = ((rawTime % timeline.total) + timeline.total) % timeline.total;
  let selected = timeline.legs[timeline.legs.length - 1];

  for (const leg of timeline.legs) {
    if (local < leg.travel + leg.hold) {
      selected = leg;
      break;
    }
    local -= leg.travel + leg.hold;
  }

  const dx = selected.to.x - selected.from.x;
  const dz = selected.to.z - selected.from.z;
  const moving = local < selected.travel;
  const progress = moving && selected.travel ? local / selected.travel : 1;
  return {
    position: {
      x: selected.from.x + dx * progress,
      y: selected.from.y + (selected.to.y - selected.from.y) * progress,
      z: selected.from.z + dz * progress,
    },
    heading: Math.atan2(dx, dz),
    animation: moving ? (npc.mobility === 'scooter' ? 'scooter' : 'walk') : (selected.to.animation || npc.behavior || 'idle'),
    moving,
  };
}
