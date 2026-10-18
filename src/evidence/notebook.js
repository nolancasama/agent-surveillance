import { ACTIVITIES } from '../sim/activities.js';
import { LEDGER_CONFIG, classifyEvent } from './config.js';

const copyEntry = entry => ({ ...entry, photoIds: [...entry.photoIds] });
const seconds = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

/** Descriptive mission notes, with no rendering, thumbnails, or scoring state. */
export function createNotebook({ ledgerConfig = LEDGER_CONFIG } = {}) {
  const observations = new Map();

  function record({
    activityId, eventId = null, photoId, missionTime = 0,
    targetId = 'lily', visible = true, identified = true,
  } = {}) {
    if (targetId !== 'lily' || !visible || !identified
      || !Object.hasOwn(ACTIVITIES, activityId) || photoId == null) return null;

    const existing = observations.get(activityId);
    if (existing) {
      if (!existing.photoIds.includes(photoId)) existing.photoIds.push(photoId);
      return { added: false, entry: copyEntry(existing) };
    }

    const entry = {
      targetId: 'lily',
      activityId,
      eventId: typeof eventId === 'string' ? eventId : null,
      text: ACTIVITIES[activityId],
      photoIds: [photoId],
      firstSeenAt: seconds(missionTime),
      ...classifyEvent(eventId, ledgerConfig),
    };
    observations.set(activityId, entry);
    return { added: true, entry: copyEntry(entry) };
  }

  return {
    record,
    entries: () => [...observations.values()].map(copyEntry)
      .sort((a, b) => a.firstSeenAt - b.firstSeenAt),
  };
}

/** Stable integration boundary for a future Agent Briefing import. */
export function exportMission(ledger, notebook) {
  const state = ledger.status();
  return {
    version: 1,
    mission: 'surveillance-market',
    targetId: 'lily',
    elapsedSeconds: seconds(state.elapsedSeconds),
    photos: state.photos.map(({ id, thumbnail, missionTime }) => ({
      id, thumbnail, missionTime: seconds(missionTime),
    })),
    observations: notebook.entries(),
  };
}
