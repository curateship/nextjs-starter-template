/**
 * The bounds Settings allows for the machine's browser settings, so a typo
 * cannot take the machine. Here rather than in `src/server/browser/settings.ts`
 * because the Settings tab draws them too, and a page must never import a
 * server file.
 */
export const MAX_OPEN_RANGE = { min: 1, max: 20 } as const
export const IDLE_MINUTES_RANGE = { min: 5, max: 24 * 60 } as const
