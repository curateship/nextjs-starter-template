/**
 * The plain sentences about AI providers that both sides need.
 *
 * They live here rather than beside the code that talks to a provider because
 * the browser has to recognise them to show them, and anything the browser
 * imports out of a server module drags that module's whole world — database
 * driver and all — into the page.
 */

export const GEMINI_KEY_MISSING_MESSAGE =
  "No Google Gemini key is saved — add one in Settings → AI"

/**
 * Being turned away for asking too often. Not a fault to report as one — a
 * thing to wait out, which is more use to know than a number.
 */
export const AI_TOO_BUSY_MESSAGE =
  "Google is turning requests away right now — wait a minute and try again, or check the allowance on your key"

export const ELEVENLABS_KEY_MISSING_MESSAGE =
  "No ElevenLabs key is saved — add one in Settings → AI"

/**
 * The trouble a provider itself can hand back, in words already fit to read.
 *
 * These sentences are written by this app — they name the feature and say what
 * went wrong — so they are shown as they are rather than swallowed by a plain
 * "it did not work". A person who is told "Captions came back empty" can press
 * the button again; one who is told nothing cannot.
 */
const PROVIDER_PROBLEMS = [
  "came back empty",
  "came back as something other than an answer",
  "came back in an unexpected shape",
  "could not send the sound",
  "could not read the sound",
  "took too long",
]

export function isShowableProviderProblem(message: string) {
  if (message === AI_TOO_BUSY_MESSAGE) return true
  if (PROVIDER_PROBLEMS.some((problem) => message.includes(problem))) return true
  // "Captions failed (HTTP 503)" — the number is the useful part.
  return /\(HTTP \d{3}\)$/.test(message)
}
