// ============ RIFT BRAWL — stage metadata ============
//
// Ids and display names live apart from stages.ts on purpose. Menus, replay
// summaries and match config only ever need the labels, and stages.ts carries
// a thousand lines of canvas drawing behind it — importing that just to print
// "FROZEN LAKE" would drag the whole stage renderer into the first paint.

export const STAGE_IDS = ['forest', 'volcano', 'neon', 'frozen', 'sky', 'rift'];

/** Display names without paying to construct a whole Stage (used by menus/lists). */
export const STAGE_NAMES: Record<string, string> = {
  forest: 'FOREST RUINS', volcano: 'VOLCANIC CORE', neon: 'NEON CITY',
  frozen: 'FROZEN LAKE', sky: 'SKY FORTRESS', rift: 'THE RIFT',
};
