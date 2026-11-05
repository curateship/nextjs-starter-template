/**
 * The plain sentences about AI providers that both sides need.
 *
 * They live here rather than beside the code that talks to a provider because
 * the browser has to recognise them to show them, and anything the browser
 * imports out of a server module drags that module's whole world — database
 * driver and all — into the page.
 */

export const GEMINI_KEY_MISSING_MESSAGE =
  "No Google Gemini key is saved - add one in Settings → AI"

/**
 * Being turned away for asking too often. Not a fault to report as one — a
 * thing to wait out, which is more use to know than a number.
 */
export const AI_TOO_BUSY_MESSAGE =
  "Google is turning requests away right now - wait a minute and try again"

/**
 * The free tier allows a couple of dozen requests a day, and waiting will not
 * bring them back. Saying so beats "try again in a minute", which is advice
 * that cannot work.
 */
export const AI_DAY_USED_UP_MESSAGE =
  "This key's free allowance for today is used up - it resets tomorrow, or add billing to the key"

/** Every "add a key" sentence, so a tool can show whichever one it hit. Viral asks Gemini alone. */
export const AI_KEY_MISSING_MESSAGES: ReadonlySet<string> = new Set([GEMINI_KEY_MISSING_MESSAGE])

/**
 * Gemini's trouble in words already fit to read: written by this app, naming
 * the piece and saying what went wrong, so they are shown as they are rather
 * than swallowed by a plain "it did not work". A person told "The script
 * came back empty" can press the button again; one told nothing cannot. The
 * phrases are the ones `src/server/viral/gemini.ts` writes.
 */
const PROVIDER_PROBLEMS = [
  "came back empty",
  "came back as something other than an answer",
  "came back in an unexpected shape",
  "took too long",
]

export function isShowableProviderProblem(message: string) {
  if (message === AI_TOO_BUSY_MESSAGE) return true
  if (message === AI_DAY_USED_UP_MESSAGE) return true
  if (PROVIDER_PROBLEMS.some((problem) => message.includes(problem))) return true
  // "The script failed (HTTP 503)": the number is the useful part.
  return /\(HTTP \d{3}\)$/.test(message)
}
