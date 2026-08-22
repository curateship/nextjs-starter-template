import type { NetworkId } from "@/lib/protocols/contracts"
import {
  clearAsterBudgets,
  configureAsterBudget,
  observeAsterUsedWeight,
  reserveAsterRequest,
} from "@/server/protocols/aster/budget"
import {
  isRationed,
  startRationing,
  stopRationing,
} from "@/server/protocols/rationing"
import {
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"

const REST_BASE: Record<NetworkId, string> = {
  mainnet: "https://fapi.asterdex.com",
  testnet: "https://fapi.asterdex-testnet.com",
}

type AsterError = { code?: unknown; msg?: unknown }

const EXCHANGE_INFO_PATH = "/fapi/v3/exchangeInfo"
const EXCHANGE_INFO_WEIGHT = 1

const budgetLoads = new Map<NetworkId, Promise<unknown>>()
const budgetsReady = new Set<NetworkId>()
let ipBanned = false

function assertAvailable(network: NetworkId): void {
  if (ipBanned) throw new Error("ASTER_IP_BANNED")
  if (isRationed("aster", network, "public")) {
    throw new Error("EXCHANGE_BUSY")
  }
}

async function send(
  network: NetworkId,
  path: string,
  params: Record<string, string | number>
): Promise<Response> {
  assertAvailable(network)
  const url = new URL(path, REST_BASE[network])
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
    throw error
  }

  if (response.status === 418) {
    ipBanned = true
    throw new Error("ASTER_IP_BANNED")
  }
  if (response.status === 429) {
    startRationing("aster", network, "public")
    throw new Error("EXCHANGE_BUSY")
  }
  return response
}

async function payloadOf(response: Response, path: string): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as AsterError | null
  if (!response.ok) {
    const code =
      typeof payload?.code === "number" || typeof payload?.code === "string"
        ? String(payload.code)
        : String(response.status)
    throw new Error(`ASTER_${code}:${path}`)
  }
  if (
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.code === "number" &&
    payload.code < 0
  ) {
    throw new Error(`ASTER_${payload.code}:${path}`)
  }
  return payload
}

/** Aster states its current allowance in this response, loaded once. */
async function ensureBudget(network: NetworkId): Promise<unknown | null> {
  if (budgetsReady.has(network)) return null
  const held = budgetLoads.get(network)
  if (held) return held

  const load = (async () => {
    const response = await send(network, EXCHANGE_INFO_PATH, {})
    const payload = await payloadOf(response, EXCHANGE_INFO_PATH)
    configureAsterBudget(network, payload, EXCHANGE_INFO_WEIGHT)
    observeAsterUsedWeight(
      network,
      response.headers.get("x-mbx-used-weight-1m")
    )
    stopRationing("aster", network, "public")
    budgetsReady.add(network)
    return payload
  })()
  budgetLoads.set(network, load)
  try {
    return await load
  } finally {
    if (budgetLoads.get(network) === load) {
      budgetLoads.delete(network)
    }
  }
}

/** One budgeted public V3 read with its measured request weight declared. */
export async function asterPublic(
  network: NetworkId,
  path: string,
  weight: number,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  assertAvailable(network)
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("ASTER_REQUEST_WEIGHT_INVALID")
  }
  if (path === EXCHANGE_INFO_PATH && weight !== EXCHANGE_INFO_WEIGHT) {
    throw new Error("ASTER_REQUEST_WEIGHT_INVALID")
  }
  const initialExchangeInfo = await ensureBudget(network)
  if (path === EXCHANGE_INFO_PATH && initialExchangeInfo !== null) {
    return initialExchangeInfo
  }

  reserveAsterRequest(network, {
    weight,
    lane: "public",
    priority: "background",
  })
  const response = await send(network, path, params)
  observeAsterUsedWeight(network, response.headers.get("x-mbx-used-weight-1m"))
  const payload = await payloadOf(response, path)
  stopRationing("aster", network, "public")
  return payload
}

/** Test state must not carry a refusal or a spent minute into another case. */
export function clearAsterClientState(): void {
  budgetLoads.clear()
  budgetsReady.clear()
  ipBanned = false
  clearAsterBudgets()
  stopRationing("aster", "mainnet", "public")
  stopRationing("aster", "testnet", "public")
}
