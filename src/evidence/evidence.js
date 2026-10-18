/**
 * Pure evidence/film ledger. It deliberately knows nothing about rendering or
 * how an event was judged; capture receives the already-judged event id.
 */
import { LEDGER_CONFIG } from './config.js';
const seconds = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function createLedger({
  slots = LEDGER_CONFIG.slots,
  likeEvents = LEDGER_CONFIG.likeEvents,
  canEvents = LEDGER_CONFIG.canEvents,
  weakEvents = LEDGER_CONFIG.weakEvents,
} = {}) {
  let remaining = Math.max(0, Math.floor(Number(slots) || 0));
  const likes = new Set(likeEvents);
  const cans = new Set(canEvents);
  const weak = new Set(Object.keys(weakEvents));
  const photos = [];
  let elapsedSeconds = 0;

  function capture({ eventId = null, thumbnail = null, missionTime = 0 } = {}) {
    if (remaining <= 0) return { ok: false, remaining: 0 };

    remaining -= 1;
    const photo = Object.freeze({
      id: photos.length + 1,
      eventId: typeof eventId === 'string' ? eventId : null,
      thumbnail,
      missionTime: seconds(missionTime),
    });
    photos.push(photo);
    elapsedSeconds = Math.max(elapsedSeconds, photo.missionTime);
    return { ok: true, remaining };
  }

  function status() {
    const photographedLikes = new Set();
    let canDone = false;

    for (const photo of photos) {
      if (weak.has(photo.eventId)) continue;
      if (likes.has(photo.eventId)) photographedLikes.add(photo.eventId);
      if (cans.has(photo.eventId)) canDone = true;
    }

    const likeCount = photographedLikes.size;
    const likeNeeded = likes.size;
    return {
      likeCount,
      likeNeeded,
      canDone,
      complete: likeCount >= likeNeeded && canDone,
      remaining,
      photos: photos.map(photo => ({ ...photo })),
      elapsedSeconds,
    };
  }

  function refill(amount = 5) {
    const added = Math.max(0, Math.floor(Number(amount) || 0));
    remaining += added;
    return { added, remaining };
  }

  function setElapsedSeconds(value) {
    elapsedSeconds = seconds(value);
  }

  function config() {
    return { slots, likeEvents: [...likes], canEvents: [...cans], weakEvents: { ...weakEvents } };
  }

  return { capture, status, refill, setElapsedSeconds, config };
}

