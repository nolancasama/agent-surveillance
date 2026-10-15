/**
 * Pure evidence/film ledger. It deliberately knows nothing about rendering or
 * how an event was judged; capture receives the already-judged event id.
 */

export function createLedger({
  slots = 10,
  likeEvents = ['smell_flowers', 'buy_flowers', 'water_flowers'],
  canEvents = ['ride_bike'],
} = {}) {
  let remaining = Math.max(0, Math.floor(Number(slots) || 0));
  const likes = new Set(likeEvents);
  const cans = new Set(canEvents);
  const photos = [];

  function capture({ eventId = null, thumbnail = null } = {}) {
    if (remaining <= 0) return { ok: false, remaining: 0 };

    remaining -= 1;
    const photo = Object.freeze({
      id: photos.length + 1,
      eventId: typeof eventId === 'string' ? eventId : null,
      thumbnail,
    });
    photos.push(photo);
    return { ok: true, remaining };
  }

  function status() {
    const photographedLikes = new Set();
    let canDone = false;

    for (const photo of photos) {
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
    };
  }

  function refill(amount = 5) {
    const added = Math.max(0, Math.floor(Number(amount) || 0));
    remaining += added;
    return { added, remaining };
  }

  return { capture, status, refill };
}

