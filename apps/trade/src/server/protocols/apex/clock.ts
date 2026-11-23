import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * ApeX Omni's clock, as this machine should stamp it.
 *
 * Every signed request carries `APEX-TIMESTAMP`, and ApeX refuses one whose
 * time it does not accept with `{"code":20002,"msg":"err APEX-TIMESTAMP"}`
 * on an ordinary HTTP 200. Measured 5 Sep 2026: this machine ran 239
 * milliseconds ahead of ApeX. So the app never stamps its own time. It reads
 * `/api/v3/time` once a minute, keeps the difference, and stamps
 * "now plus the difference".
 */
const CLOCK_GOOD_FOR_MS = 60_000

type Clock = { measuredAt: number; offsetMs: number }

const clocks = new Map<NetworkId, Promise<Clock>>()

export type ReadApexTime = (network: NetworkId) => Promise<number>

async function measure(network: NetworkId, readTime: ReadApexTime): Promise<Clock> {
  const started = Date.now()
  const serverTime = await readTime(network)
  const finished = Date.now()
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0) {
    throw new Error("APEX_CLOCK_UNREADABLE")
  }
  // The answer was written somewhere between asking and hearing back, so
  // it is compared with the middle of that trip.
  return {
    measuredAt: finished,
    offsetMs: Math.round(serverTime - (started + finished) / 2),
  }
}

/**
 * ApeX's time now, in epoch milliseconds, for one signed request.
 *
 * `refresh` re-reads the clock whatever its age. The client asks for that
 * exactly once, after a 20002, before sending the request a second time.
 */
export async function apexTimestamp(input: {
  network: NetworkId
  readTime: ReadApexTime
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
export async function apexClockOffset(network: NetworkId): Promise<number | null> {
  const clock = clocks.get(network)
  return clock ? (await clock).offsetMs : null
}

export function clearApexClocks(): void {
  clocks.clear()
}
