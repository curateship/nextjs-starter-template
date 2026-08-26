import type { NetworkId } from "@/lib/protocols/contracts"
import {
  reserveLighterRequest,
  clearLighterBudgets,
} from "@/server/protocols/lighter/budget"
import { lighterRefusalError } from "@/server/protocols/lighter/refusals"
import {
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * Mainnet only. The registry lists no other network for Lighter, so a
 * testnet call reaching this deep is a bug, stopped loudly rather than sent
 * to a host nothing should ever talk to.
 *
 * Lighter runs a testnet and it is deliberately not carried (decided 26 Aug
 * 2026). It held three markets, had been reset two days earlier, and served
 * zero candles on every timeframe over a 400-day window, so there was nothing
 * to look at there. The signing work proves itself the way Phemex's and
 * KuCoin's did: signed READS first, which cost nothing and move no money,
 * then one deliberately tiny real order behind both real-money switches.
 */
function restBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("LIGHTER_NETWORK_UNSUPPORTED")
  return "https://mainnet.zklighter.elliot.ai"
}

/**
 * How long Lighter is left alone after a 429 or 405.
 *
 * Sixty seconds rather than the shared rationing file's twenty, because
 * Lighter's own docs state a static 60-second firewall cooldown — asking
 * again at twenty would spend a third of the next minute's sixty requests on
 * refusals. Held here rather than in `rationing.ts` so the other venues keep
 * their measured shorter hold.
 */
const RATE_HOLD_MS = 60_000

const holds = new Map<NetworkId, number>()

function assertAvailable(network: NetworkId): void {
  const until = holds.get(network)
  if (until === undefined) return
  if (Date.now() >= until) {
    holds.delete(network)
    return
  }
  throw new Error("EXCHANGE_BUSY")
}

type LighterEnvelope = { code?: unknown; message?: unknown }

/**
 * One budgeted public Lighter read.
 *
 * `weight` is Lighter's stated weight for the endpoint, declared at the call
 * site the way Aster's client demands it. A Standard account's cap counts
 * requests rather than weight, so the budget spends one request either way —
 * the weight rides along for the snapshot and the doc's arithmetic.
 */
export async function lighterPublic(
  network: NetworkId,
  path: string,
  weight: number,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  assertAvailable(network)
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("LIGHTER_REQUEST_WEIGHT_INVALID")
  }
  const base = restBase(network)
  reserveLighterRequest(network, { weight, priority: "background" })

  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw new Error(scrubbedMessage(error))
  }

  if (response.status === 429 || response.status === 405) {
    holds.set(network, Date.now() + RATE_HOLD_MS)
    throw lighterRefusalError({ status: response.status, code: "" })
  }

  const payload = (await response
    .json()
    .catch(() => null)) as LighterEnvelope | null
  // Lighter answers `code: 200` inside a healthy body; anything else is its
  // own refusal code, kept as a number and never as its free-form text.
  const code =
    payload !== null &&
    (typeof payload.code === "number" || typeof payload.code === "string")
      ? String(payload.code)
      : String(response.status)
  if (!response.ok || (payload !== null && code !== "200")) {
    throw lighterRefusalError({ status: response.status, code })
  }
  return payload
}

/** Test state must not carry a hold or a spent minute into another case. */
export function clearLighterClientState(): void {
  holds.clear()
  clearLighterBudgets()
}
