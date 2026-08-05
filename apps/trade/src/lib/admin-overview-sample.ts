/**
 * Every figure on the Overview the app cannot answer yet.
 *
 * One module, so "what is still made up" is one file to read rather than a
 * hunt through the page. Three rules keep it honest:
 *
 * 1. Every value carries `sample: true` beside it. The page marks a figure
 *    from that flag and nothing else, so wiring one up to real data is one
 *    function body — return the real value with `sample: false` and every
 *    place it is drawn stops calling itself a sample on its own.
 * 2. Nothing is random. `Math.random()` gives the server one number and the
 *    browser another, which breaks the page as it hydrates, and it would
 *    reshuffle on every redraw. Values are picked from a fixed table by a hash
 *    of the id, so the same automation always reads the same.
 * 3. Nothing here is presented as real anywhere. If a card cannot be marked,
 *    it does not get a stand-in — it gets left out.
 *
 * What is missing and why:
 * - Traffic. There is no pageview or visitor tracking in this app at all.
 * - Automation runs. There is no run engine yet, so nothing records a run,
 *   a failure, or a success rate. The only real health signal an automation
 *   has is whether it compiles, which the card shows beside these.
 */

export type Sampled<T> = { value: T; sample: boolean }

const sampled = <T>(value: T): Sampled<T> => ({ value, sample: true })

/** A small, stable number from a string — the same everywhere, every time. */
function hash(text: string) {
  let total = 0
  for (let index = 0; index < text.length; index += 1) {
    total = (total * 31 + text.charCodeAt(index)) % 100000
  }
  return total
}

function pick<T>(id: string, salt: number, choices: readonly T[]): T {
  return choices[(hash(id) + salt) % choices.length]!
}

const RUN_COUNTS = [38, 96, 145, 214, 288, 341, 412, 507] as const
const SUCCESS_RATES = [88, 91, 94, 96, 97, 99, 100] as const

/** How many times an automation has run. Nothing counts runs yet. */
export function automationRuns(automationId: string): Sampled<number> {
  return sampled(pick(automationId, 0, RUN_COUNTS))
}

/** How many of those runs finished. Nothing records an outcome yet. */
export function automationSuccessRate(automationId: string): Sampled<number> {
  return sampled(pick(automationId, 3, SUCCESS_RATES))
}

/** What the runs figure is counted over, once there is something to count. */
export const AUTOMATION_RUNS_CAPTION = "last 30 days"

export type TrafficSource = { label: string; percent: number }

export type TrafficSummary = {
  sessions: number
  users: number
  sources: TrafficSource[]
}

/** Visits and where they came from. Nothing in the app tracks either. */
export function trafficSummary(): Sampled<TrafficSummary> {
  return sampled({
    sessions: 128_400,
    users: 61_200,
    sources: [
      { label: "Organic search", percent: 41 },
      { label: "Direct", percent: 26 },
      { label: "Newsletter", percent: 18 },
      { label: "Referral and paid", percent: 15 },
    ],
  })
}

const TRAFFIC_DAYS = [
  4100, 4600, 4300, 5200, 5000, 3900, 3600, 5100, 5400, 5900, 5700, 4400, 6300,
] as const

/**
 * Visits per day for the bar chart. The labels are worked out from the day
 * passed in rather than read off a clock, so the server and the browser draw
 * the same axis.
 */
export function trafficByDay(
  today: Date
): Sampled<{ label: string; sessions: number }[]> {
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  })

  return sampled(
    TRAFFIC_DAYS.map((sessions, index) => {
      const date = new Date(today)
      date.setDate(date.getDate() - (TRAFFIC_DAYS.length - 1 - index))
      return { label: day.format(date), sessions }
    })
  )
}
