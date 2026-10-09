/**
 * The review state (review_state.json) and the notes written from it. Saving marks finished stages done
 * and rewrites the timeline and the search strategy.
 * @module services/review-state
 */
import { autoDone } from "../domain/progress.js";
import { restoreState } from "../domain/stages.js";
import { STAGE_FILES, strategyNote, timelineNote } from "../domain/stage-notes.js";

export const STATE_FILE = "review_state.json";

/** The state of a review folder (defaults for a new review). */
export async function loadState(folder) {
  return restoreState((await folder.exists(STATE_FILE)) ? JSON.parse(await folder.readText(STATE_FILE)) : {});
}

/**
 * Saves the state: stages whose work is finished are marked done, then review_state.json, the timeline
 * and (once there are concepts) the search strategy are written.
 * @param {import("./review-repository.js").ReviewRepository} repo @param {object} st
 */
export async function saveState(repo, st) {
  const { folder, clock } = repo;
  autoDone(st, [...repo.records.values()].map(r => r.props), clock.now());
  await folder.writeText(STATE_FILE, JSON.stringify(st, null, 2));
  const common = { reviewName: repo.name, reviewLink: repo.link, st, today: clock.today() };
  await folder.writeText(STAGE_FILES.timeline, timelineNote(common));
  const strategy = strategyNote({ ...common, exists: await folder.exists(STAGE_FILES.strategy) });
  if (strategy !== null) await folder.writeText(STAGE_FILES.strategy, strategy);
}
