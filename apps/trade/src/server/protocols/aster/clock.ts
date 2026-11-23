import type { NetworkId } from "@/lib/protocols/contracts"

const CLOCK_GOOD_FOR_MS = 5 * 60_000

type Clock = { measuredAt: number; offsetMs: number }

const clocks = new Map<NetworkId, Promise<Clock>>()
const lastNonces = new Map<string, number>()

type ReadTime = (network: NetworkId) => Promise<number>

async function measure(network: NetworkId, readTime: ReadTime): Promise<Clock> {
  const started = Date.now()
  const serverTime = await readTime(network)
  const finished = Date.now()
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0) {
    throw new Error("ASTER_CLOCK_UNREADABLE")
  }
  return {
    measuredAt: finished,
    offsetMs: serverTime - (started + finished) / 2,
  }
}

export async function asterNonce(input: {
  network: NetworkId
  signer: string
  readTime: ReadTime
  now?: number
  refresh?: boolean
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
  const localNow = input.now ?? Date.now()
  const candidate = Math.floor((localNow + offsetMs) * 1_000)
  const key = `${input.network}:${input.signer.toLowerCase()}`
  const next = Math.max(candidate, (lastNonces.get(key) ?? 0) + 1)
  lastNonces.set(key, next)
  return next
}

export function clearAsterClocks(): void {
  clocks.clear()
  lastNonces.clear()
}
