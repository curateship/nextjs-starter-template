/**
 * Why a switched-on flow has not placed a ladder on a coin.
 *
 * **The problem this solves.** A flow that refuses every coin because the
 * wallet has no free cash looks exactly like a flow patiently waiting for the
 * right price — both show nothing happening. The first needs a person; the
 * second needs to be left alone. Until this existed there was no way to tell
 * them apart from outside, so "nothing is happening" was unanswerable.
 *
 * Every refusal is sorted into one of those two piles, and the pile matters
 * more than the sentence: **waiting is the strategy working**, and a problem is
 * something only a person can clear.
 *
 * Browser-safe. The engine writes these codes and the canvas reads them, so the
 * sentences live where both can see them and neither has to translate.
 */

/** One coin's last refusal, as the run row stores it. */
export type FlowWaitReason = {
  /** The engine's own code, e.g. `SMART_LADDER_NO_BASE`. */
  code: string
  /** When it was last refused, epoch ms. */
  at: number
}

/**
 * A flow that has stopped trying, because the same thing keeps refusing it.
 *
 * **Why this exists at all.** Some refusals are about one coin — it has no base
 * yet — and the next coin is a fair question. Others are about the setup: the
 * rungs come out too small, there is no free cash, the key was refused. Those
 * refuse every coin on the list identically, so asking about the next one is
 * asking a question the exchange has already answered. A flow watching a
 * hundred coins spent all day doing exactly that.
 */
export type FlowHold = {
  /** The code that keeps coming back. */
  code: string
  /** How many times in a row it has. */
  strikes: number
  /** Nothing is tried again before this, epoch ms. */
  until: number
}

/** Three of the same answer is enough. The first two could be coincidence. */
export const STRIKES_BEFORE_HOLD = 3

/**
 * How long to wait after the nth strike, in ms.
 *
 * It doubles, because the answers that get here are the ones a person has to
 * clear — money arriving or a setting changing — and neither happens in the
 * second after it was noticed. Capped so a flow left alone overnight is still
 * checking now and then rather than never again.
 */
export function flowHoldFor(strikes: number, code = ""): number {
  const steps = Math.max(0, strikes - STRIKES_BEFORE_HOLD)
  // A rate limit starts further back and goes further out. Everything else
  // here waits on a person; this one waits on an allowance that only refills
  // if we leave it alone, and coming back early is what spent it.
  const busy = bare(code) === "EXCHANGE_BUSY"
  const first = busy ? 120_000 : 60_000
  const most = busy ? 30 * 60_000 : 15 * 60_000
  return Math.min(first * 2 ** steps, most)
}

/**
 * The hold after one more refusal, or after one that went through.
 *
 * A different problem starts the count again rather than adding to it: two
 * unrelated faults are two things to fix, and rolling them together would hide
 * the second behind the first's wait.
 */
export function nextFlowHold(
  hold: FlowHold | null,
  code: string,
  now: number
): FlowHold | null {
  if (!flowWaitBacksOff(code)) return hold
  const strikes = hold && bare(hold.code) === bare(code) ? hold.strikes + 1 : 1
  return {
    code,
    strikes,
    until: strikes >= STRIKES_BEFORE_HOLD ? now + flowHoldFor(strikes, code) : 0,
  }
}

/** One coin's last refusal, as a screen reads it. */
export type FlowWaiting = {
  marketKey: string
  /** Just the coin, e.g. `ETH` — the market key is not for reading. */
  coin: string
  code: string
  /** What it means, in a few words. */
  words: string
  /** True when a person has to do something. False means it is working. */
  problem: boolean
  at: number
}

/**
 * The refusals that are the strategy doing its job.
 *
 * Everything not listed here counts as a problem, deliberately — a code nobody
 * has thought about yet is far more likely to be something wrong than something
 * fine, and the honest failure is to over-report rather than to go quiet.
 */
const JUST_WAITING: Record<string, string> = {
  // Not a fault, and nobody can fix it — the exchange is asking for a pause
  // and it clears on its own. Calling it a problem would send somebody looking
  // for a broken setting that is not there.
  EXCHANGE_BUSY: "The exchange is asking us to slow down",
  SMART_LADDER_NO_BASE: "Waiting for a base to form",
  SMART_LADDER_UNDER_BASE: "Price has already fallen through the base",
  SMART_LADDER_ABOVE_MARKET: "Price is below every rung, so there is nothing to wait for",
  SMART_LADDER_EXISTS: "Already has a ladder working",
  // The signals flow's own. All three are the strategy working, and all three
  // are about ONE coin — so none of them count towards the back-off, for the
  // same reason "no base yet" does not.
  SIGNAL_NONE_YET: "Waiting for an arrow",
  SIGNAL_RAN_AWAY: "Price ran away before it could buy",
}

/** The refusals somebody has to act on, and what they would do about it. */
const NEEDS_A_PERSON: Record<string, string> = {
  SMART_LADDER_COST: "Not enough free cash to place the whole ladder",
  SMART_RUNG_TOO_SMALL:
    "The rungs come out too small to be orders — use fewer rungs or more money",
  SMART_SHORT_HELD:
    "The wallet is short this coin, so buying would only shrink the short",
  PAPER_ORDER_LIMIT: "The wallet has too many orders open already",
  // A practice wallet and a real one refuse for the same reasons down two
  // different paths, so both sets of codes are answered. A practice flow that
  // said "this app does not have words for it" would be the exact silence this
  // module exists to remove.
  PAPER_MARKET: "The exchange does not list this coin",
  PAPER_NO_PRICE: "The exchange would not give a price for this coin",
  PAPER_PRICE: "The exchange gave a price that cannot be used",
  PAPER_WALLET_NOT_FOUND: "The wallet has been deleted",
  PAPER_WALLET_KIND: "This wallet cannot trade this way",
  WALLET_INACTIVE: "The wallet is switched off",
  LIVE_WALLET_KEY: "The wallet's trading key was refused",
  LIVE_MARKET: "The exchange does not list this coin",
  LIVE_NO_PRICE: "The exchange would not give a price for this coin",
  LIVE_PRICE: "The exchange gave a price that cannot be used",
  LIVE_MAINNET_OFF: "Real trading is switched off on this server",
  LIVE_NETWORK_MISMATCH: "This coin is not on the wallet's network",
  LIVE_SMART_ORDER_NOT_RESTING:
    "A rung did not rest on the exchange, so the ladder was rolled back",
  LIVE_SMART_ROLLBACK_FAILED:
    "The exchange took part of a ladder and would not cancel the rest — check the open orders now",
  EXCHANGE_NO_MARGIN:
    "Not enough margin on this coin's own market — Hyperliquid keeps each market's money separate, so cash in the main account does not back a trade here",
  FLOW_UNKNOWN: "Something refused it that this app does not have words for",
}

/**
 * The bare code an error carries, and nothing else.
 *
 * **Only a code-shaped message is kept.** An unexpected exception's text can
 * carry anything that was in scope when it was thrown, and this ends up in the
 * database and then on a screen — so text that is not plainly one of the app's
 * own codes is thrown away rather than stored and shown. A key that leaked into
 * a message once would be there forever.
 */
export function flowWaitCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  // A rate limit arrives as the exchange's own words, not as one of ours — an
  // HTTP status and a page of HTML. It is far too common and far too
  // explainable to land in "no words for it", which is where it was going.
  if (isRateLimit(message)) return "EXCHANGE_BUSY"
  // The exchange's own refusals arrive as its words, not as one of our codes,
  // so the ones worth naming are recognised here. Everything else still falls
  // through to "no words for it" and is written to the log to be named later.
  if (/insufficient margin/i.test(message)) return "EXCHANGE_NO_MARGIN"
  // `SMART_RUNG_TOO_SMALL:3` — a few codes name which rung, and that number is
  // worth keeping.
  return /^[A-Z][A-Z0-9_]*(:\d+)?$/.test(message) ? message : "FLOW_UNKNOWN"
}

/** The exchange saying "too fast", however it happens to phrase it. */
export function isRateLimit(message: string): boolean {
  return /\b429\b|too many requests|rate limit/i.test(message)
}

/** The code without the `:3` some of them carry. */
function bare(code: string): string {
  const colon = code.indexOf(":")
  return colon === -1 ? code : code.slice(0, colon)
}

/** True when somebody has to do something about it. */
/**
 * Answers a rule no longer asks, left behind on a run that recorded them.
 *
 * **A retired answer is worse than no answer.** Price being under the base
 * stopped refusing a ladder on 18 August 2026, so a coin still carrying that
 * reason is not waiting on anything — it simply has not been looked at since
 * the rule changed, and saying "fallen through the base" tells somebody to go
 * and look at a chart for nothing.
 *
 * The words stay in the list above, because a run's history reads better with
 * them than with a bare code. What this decides is whether the answer is still
 * worth showing as the reason a coin has nothing.
 */
const RETIRED: readonly string[] = ["SMART_LADDER_UNDER_BASE"]

export function flowWaitIsRetired(code: string): boolean {
  return RETIRED.includes(bare(code))
}

export function flowWaitIsProblem(code: string): boolean {
  return !(bare(code) in JUST_WAITING)
}

/**
 * True when the same answer repeating means "stop asking".
 *
 * **Not the same question as whether it is a fault.** A rate limit is nobody's
 * mistake and needs no fixing, and it is still the strongest possible reason to
 * stop asking — carrying on is what caused it. "No base yet" is the opposite:
 * not a fault either, but a true answer about that one coin, and the next coin
 * deserves its own question.
 */
export function flowWaitBacksOff(code: string): boolean {
  return bare(code) === "EXCHANGE_BUSY" || flowWaitIsProblem(code)
}

/** What a refusal means, in a few words. */
export function flowWaitWords(code: string): string {
  const key = bare(code)
  return (
    JUST_WAITING[key] ??
    NEEDS_A_PERSON[key] ??
    NEEDS_A_PERSON.FLOW_UNKNOWN
  )
}

/** One coin's refusal, turned from what is stored into what is read. */
export function describeFlowWait(
  marketKey: string,
  reason: FlowWaitReason
): FlowWaiting {
  const colon = marketKey.lastIndexOf(":")
  return {
    marketKey,
    coin: colon === -1 ? marketKey : marketKey.slice(colon + 1),
    code: reason.code,
    words: flowWaitWords(reason.code),
    problem: flowWaitIsProblem(reason.code),
    at: reason.at,
  }
}

/**
 * The one line at the top of the chip: what is wrong, with how many coins, and
 * when it will look again.
 *
 * **One line, because it was three.** The chip used to carry the hold's
 * sentence, then a summary of the waiting list, then the list itself — and on
 * a flow where every coin is refused for the same reason, all three said the
 * same thing. Reading the same fact three times is how somebody starts
 * skipping the whole panel.
 *
 * Null when there is nothing to say, which is a flow quietly working.
 */
export function flowHeadline(
  list: FlowWaiting[],
  working: number,
  hold: FlowHold | null,
  now: number
): { words: string; code: string | null; problem: boolean } | null {
  // A hold that is not a fault still leads: "the exchange is asking us to slow
  // down, trying again in 4 minutes" is the answer, and burying it under a
  // count of coins waiting for a base would hide the only thing happening.
  if (hold && !flowWaitIsProblem(hold.code)) {
    const same = list.filter((one) => bare(one.code) === bare(hold.code))
    const who = same.length > 1 ? `${same.length} coins` : "Every coin"
    return {
      words: `${who} — ${lowerFirst(flowWaitWords(hold.code))}. ${retryIn(hold, now)}.`,
      code: hold.code,
      problem: false,
    }
  }

  const problems = list.filter((one) => one.problem)

  if (problems.length > 0) {
    // Whatever is refusing the most coins is the thing to fix, and the hold
    // names it outright when there is one.
    const code = hold ? hold.code : commonest(problems)
    const words = flowWaitWords(code)
    const many = problems.filter((one) => bare(one.code) === bare(code))
    const who =
      many.length === 1 ? many[0].coin : `${many.length} coins`
    const holding = hold && hold.until > now ? ` ${retryIn(hold, now)}.` : ""
    return { words: `${who} — ${lowerFirst(words)}.${holding}`, code, problem: true }
  }

  if (list.length === 0) return working > 0 ? null : null
  return {
    words: `${list.length} ${list.length === 1 ? "coin is" : "coins are"} waiting for the right price.`,
    code: null,
    problem: false,
  }
}

/** The code refusing the most coins. */
function commonest(list: FlowWaiting[]): string {
  const counts = new Map<string, { code: string; n: number }>()
  for (const one of list) {
    const key = bare(one.code)
    const seen = counts.get(key)
    if (seen) seen.n += 1
    else counts.set(key, { code: one.code, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0].code
}

/** "Trying again in about 6 minutes", or sooner than that. */
function retryIn(hold: FlowHold, now: number): string {
  const left = Math.max(0, hold.until - now)
  const minutes = Math.round(left / 60_000)
  return left < 60_000
    ? "Trying again in under a minute"
    : `Trying again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
}

/** Sentences are stored capitalised; mid-sentence they should not be. */
function lowerFirst(words: string): string {
  return words.charAt(0).toLowerCase() + words.slice(1)
}
