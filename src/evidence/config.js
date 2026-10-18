/** Shared evidence rules. The ledger scores; the notebook only describes. */
export const LEDGER_CONFIG = Object.freeze({
  slots: 10,
  likeEvents: Object.freeze(['smell_flowers', 'buy_flowers', 'water_flowers']),
  canEvents: Object.freeze(['ride_bike']),
  // Weak observations name their category without becoming scoring events.
  weakEvents: Object.freeze({ push_bike: 'can' }),
});

export const WEAK_EVENTS = new Set(Object.keys(LEDGER_CONFIG.weakEvents));

export function classifyEvent(eventId, config = LEDGER_CONFIG) {
  const weakEvents = config.weakEvents ?? LEDGER_CONFIG.weakEvents;
  if (Object.hasOwn(weakEvents, eventId)) {
    return { category: weakEvents[eventId], strength: 'weak' };
  }
  if ((config.likeEvents ?? LEDGER_CONFIG.likeEvents).includes(eventId)) {
    return { category: 'like', strength: 'strong' };
  }
  if ((config.canEvents ?? LEDGER_CONFIG.canEvents).includes(eventId)) {
    return { category: 'can', strength: 'strong' };
  }
  return { category: 'none', strength: 'none' };
}
