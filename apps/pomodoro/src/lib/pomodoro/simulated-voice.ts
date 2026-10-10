import { checkBlockedWords, type AppSettingValue } from "@/lib/pomodoro/app-settings"
import { drawInt, type Random } from "@/lib/pomodoro/simulated-days"

/**
 * The rules every line a made-up member says must pass, and the touches that
 * make it read like a person (live activity task 03). Pure, so the server,
 * the Preview and the tests use the same ones. See "Chat and the voice card"
 * in `workspace/docs/made-up-members.md`.
 */

export type Voice = AppSettingValue<"simulated.voice">

/** The moments a made-up member speaks at. */
export type LineKind =
  | "open"
  | "focus"
  | "break"
  | "greet"
  | "reply"
  | "mention"
  | "exchange"
  | "leave"

/** No line is longer than this. */
const LINE_MAX = 140
/** The longest personality line the member window takes. */
export const PERSONALITY_MAX = 160

/** How likely each optional moment is, by the card's chattiness. */
export const CHATTINESS: Record<Voice["chattiness"], { phase: number; reply: number; exchange: number }> = {
  quiet: { phase: 0.2, reply: 0.5, exchange: 0.1 },
  normal: { phase: 0.5, reply: 0.8, exchange: 0.3 },
  talkative: { phase: 0.85, reply: 1, exchange: 0.6 },
}

/** What the card's length means, in words the model is told. */
export const LENGTH_WORDS: Record<Voice["length"], string> = {
  few: "a few words, under 8",
  one: "one short line, under 15 words",
  two: "one or two short sentences, under 25 words",
}

// Any word.letters address, not only the common endings: a refused line is
// only written again, so "evil.xyz" is caught at the cost of a rare "ok.cool".
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b)/i
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const MENTION = /@([a-z0-9_-]{3,30})/gi
const EMOJI = /\p{Extended_Pictographic}|️/gu

/**
 * Why a line may not be sent, or null when it may. `handles` are the real
 * handles of the people in the room, the only names an @ may point at.
 */
export function lineProblem(
  line: string,
  { neverSay, blockedWords, handles }: { neverSay: string[]; blockedWords: string[]; handles: string[] }
) {
  const text = line.trim()
  if (!text) return "empty"
  if (text.length > LINE_MAX) return `longer than ${LINE_MAX} characters`
  if (/\n/.test(text)) return "more than one line"
  if (EMAIL.test(text)) return "has an email address"
  if (LINK.test(text)) return "has a link"
  const allowed = new Set(handles.map((handle) => handle.toLowerCase()))
  for (const match of text.matchAll(MENTION))
    if (!allowed.has(match[1].toLowerCase())) return `names @${match[1]}, who is not in the room`
  if (/@/.test(text.replace(MENTION, ""))) return "has an @ that is not a member's handle"
  const lower = text.toLowerCase()
  for (const phrase of neverSay) {
    const wanted = phrase.trim().toLowerCase()
    if (!wanted) continue
    if (wanted === "!" ? text.endsWith("!") : lower.includes(wanted)) return `says "${phrase.trim()}"`
  }
  if (checkBlockedWords(text, blockedWords).matched) return "has a blocked word"
  return null
}

/** One chance in this many of a typo, by the card's setting; null for none. */
const TYPO_ODDS: Record<Voice["typo"], number | null> = { off: null, "1in20": 20, "1in10": 10 }

/**
 * The card's touches, after the checks: lowercase, no emoji when emoji are
 * off, and now and then two letters swapped in a word that is not a name.
 */
export function styleLine(line: string, voice: Voice, names: string[], random: Random) {
  let text = line.trim().replace(/^["']|["']$/g, "")
  if (!voice.emoji) text = text.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim()
  if (voice.lowercase) text = text.toLowerCase()
  const odds = TYPO_ODDS[voice.typo]
  if (odds && random() < 1 / odds) {
    const protectedWords = new Set(names.flatMap((name) => name.toLowerCase().split(/\s+/)))
    const words = text.split(" ")
    const candidates = words
      .map((word, index) => ({ word, index }))
      .filter(({ word }) => /^[a-z]{4,}$/i.test(word) && !protectedWords.has(word.toLowerCase()) && !word.startsWith("@"))
    if (candidates.length) {
      const { word, index } = candidates[drawInt(random, 0, candidates.length - 1)]
      const at = drawInt(random, 1, word.length - 3)
      words[index] = word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2)
      text = words.join(" ")
    }
  }
  return text
}
