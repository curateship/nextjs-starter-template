import type { ChatTrend } from "./options"

/**
 * Whether a chat is warming up or cooling off (part 9 of
 * "features/01-chats-and-replies"), worked out without the AI from their
 * messages: how long they are, and how soon after ours they came. Their
 * first three are set against their last three.
 *
 * The times are when Date saw each message, not when Tinder says it was sent,
 * because a chat read off the phone carries no times. So the speed half only
 * counts when both ends have at least two answers to compare.
 */

export type TrendMessage = { direction: "in" | "out"; length: number; at: Date }

export type TrendRead = { trend: ChatTrend; reason: string }

/** Fewer messages than this from them is too early to tell. */
export const TREND_NEEDS_FROM_THEM = 6

const SAMPLE = 3

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function gapWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"}`
}

export function chatTrend(messages: TrendMessage[]): TrendRead {
  const theirs = messages.filter((message) => message.direction === "in")
  if (theirs.length < TREND_NEEDS_FROM_THEM) {
    return { trend: "too_early", reason: `Too early to tell: ${theirs.length} of the ${TREND_NEEDS_FROM_THEM} messages from them it needs.` }
  }

  const firstLength = average(theirs.slice(0, SAMPLE).map((message) => message.length))
  const lastLength = average(theirs.slice(-SAMPLE).map((message) => message.length))
  const lengthRatio = lastLength / Math.max(1, firstLength)

  // How long each of their answers took after our message before it.
  const gaps: number[] = []
  for (let index = 1; index < messages.length; index += 1) {
    const message = messages[index]
    const before = messages[index - 1]
    if (message.direction === "in" && before.direction === "out") gaps.push(Math.max(0, message.at.getTime() - before.at.getTime()))
  }
  const speed =
    gaps.length >= 4
      ? { first: average(gaps.slice(0, Math.min(SAMPLE, Math.floor(gaps.length / 2)))), last: average(gaps.slice(-Math.min(SAMPLE, Math.floor(gaps.length / 2)))) }
      : null
  // Above 1 means they answer faster now than at the start.
  const speedRatio = speed ? Math.max(1, speed.first) / Math.max(1, speed.last) : 1

  const lengthWords = `${Math.round(lastLength)} characters a message lately, against ${Math.round(firstLength)} at the start`
  const speedWords = speed ? `answering in about ${gapWords(speed.last)}, against ${gapWords(speed.first)} at the start` : ""
  const because = [lengthWords, speedWords].filter(Boolean).join(", ")

  const warming = (lengthRatio >= 1.25 && speedRatio >= 0.8) || (speedRatio >= 1.5 && lengthRatio >= 0.8)
  const cooling = (lengthRatio <= 0.75 && speedRatio <= 1.25) || (speedRatio <= 0.5 && lengthRatio <= 1.2)
  if (warming && !cooling) return { trend: "warming", reason: `Warming up: ${because}.` }
  if (cooling && !warming) return { trend: "cooling", reason: `Cooling off: ${because}.` }
  return { trend: "steady", reason: `Steady: ${because}.` }
}

export const CHAT_TREND_WORDS: Record<ChatTrend, string> = {
  warming: "Warming up",
  steady: "Steady",
  cooling: "Cooling off",
  too_early: "Too early to tell",
}
