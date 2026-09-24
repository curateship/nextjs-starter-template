import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * edgeX's clock, as this machine should stamp it.
 *
 * Every signed request carries `X-edgeX-Timestamp` in milliseconds, and
 * edgeX refuses one more than 60 seconds from its own time. Measured
 * 24 Sep 2026: edgeX ran 160 milliseconds ahead of this machine (409 behind
 * on 5 Sep). So the app never stamps its own time. It reads
 * `/api/v2/public/meta/getServerTime` at most once a minute, keeps the
 * difference, and stamps "now plus the difference".
 */
const CLOCK_GOOD_FOR_MS = 60_000

type Clock = { measuredAt: number; offsetMs: number }

const clocks = new Map<NetworkId, Promise<Clock>>()

export type ReadEdgexTime = (network: NetworkId) => Promise<number>

async function measure(network: NetworkId, readTime: ReadEdgexTime): Promise<Clock> {
  const started = Date.now()
  const serverTime = await readTime(network)
  const finished = Date.now()
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0) {
    throw new Error("EDGEX_CLOCK_UNREADABLE")
  }
  // The answer was written somewhere between asking and hearing back, so it
  // is compared with the middle of that trip.
  return {
    measuredAt: finished,
    offsetMs: Math.round(serverTime - (started + finished) / 2),
  }
}

/**
 * edgeX's time now, in epoch milliseconds, for one signed request.
 *
 * `refresh` re-reads the clock whatever its age. The client asks for that
 * exactly once, after a timestamp refusal, before sending the same request a
 * second time.
 */
export async function edgexTimestamp(input: {
  network: NetworkId
  readTime: ReadEdgexTime
  refresh?: boolean
  now?: number
}): Promise<number> {
  const checkedAt = input.now ?? Date.now()
  let clock = clocks.get(input.network)
  if (
    input.refresh ||
    !clock ||
    checkedAt - (await clock).measuredAt >= CLOCK_GOOD_FOR_MS
  ) {
    clock = measure(input.network, input.readTime)
    clocks.set(input.network, clock)
    clock.catch(() => {
      if (clocks.get(input.network) === clock) clocks.delete(input.network)
    })
  }
  const { offsetMs } = await clock
  return (input.now ?? Date.now()) + offsetMs
}

/** The difference last measured, for the doc's figures and the tests. */
export async function edgexClockOffset(network: NetworkId): Promise<number | null> {
  const clock = clocks.get(network)
  return clock ? (await clock).offsetMs : null
}

export function clearEdgexClocks(): void {
  clocks.clear()
}
