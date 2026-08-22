import type { NetworkId } from "@/lib/protocols/contracts"
import { privateKeyToAccount } from "viem/accounts"
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
import type { RationLane } from "@/server/protocols/rationing"
import { asterNonce, clearAsterClocks } from "@/server/protocols/aster/clock"
import { asterRefusalError } from "@/server/protocols/aster/refusals"
import { scrubbedMessage } from "@/server/protocols/scrub"

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

function assertAvailable(
  network: NetworkId,
  lane: RationLane = "public"
): void {
  if (ipBanned) throw new Error("ASTER_IP_BANNED")
  if (isRationed("aster", network, lane)) {
    throw new Error("EXCHANGE_BUSY")
  }
}

async function send(
  network: NetworkId,
  path: string,
  params: Record<string, string | number>,
  options: {
    lane?: RationLane
    method?: "GET" | "POST" | "PUT" | "DELETE"
  } = {}
): Promise<Response> {
  const lane = options.lane ?? "public"
  assertAvailable(network, lane)
  const url = new URL(path, REST_BASE[network])
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
      method: options.method ?? "GET",
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw new Error(scrubbedMessage(error))
  }

  if (response.status === 418) {
    ipBanned = true
    throw new Error("ASTER_IP_BANNED")
  }
  if (response.status === 429) {
    // Aster's request allowance is shared by public and signed calls from the
    // same internet address. The response does not reliably say which limit
    // fired, so continuing on the other lane risks turning the warning into
    // an address block.
    startRationing("aster", network, "public")
    startRationing("aster", network, "signed")
    throw new Error("EXCHANGE_BUSY")
  }
  return response
}

async function payloadOf(response: Response): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as AsterError | null
  if (!response.ok) {
    const code =
      typeof payload?.code === "number" || typeof payload?.code === "string"
        ? String(payload.code)
        : String(response.status)
    throw asterRefusalError({
      status: response.status,
      code,
      message: payload?.msg,
    })
  }
  if (
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.code === "number" &&
    payload.code < 0
  ) {
    throw asterRefusalError({
      status: response.status,
      code: String(payload.code),
      message: payload.msg,
    })
  }
  return payload
}

export type AsterCredential = {
  signer: `0x${string}`
  privateKey: `0x${string}`
}

function normalizedPrivateKey(value: string): `0x${string}` {
  const bare = value.trim().replace(/^0x/i, "").toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(bare)) throw new Error("LIVE_WALLET_KEY")
  return `0x${bare}`
}

export function packAsterCredential(input: { agentKey?: string }): string {
  const privateKey = normalizedPrivateKey(input.agentKey ?? "")
  const signer = privateKeyToAccount(
    privateKey
  ).address.toLowerCase() as `0x${string}`
  return JSON.stringify({ signer, privateKey })
}

export function parseAsterCredential(blob: string): AsterCredential {
  try {
    const parsed = JSON.parse(blob) as {
      signer?: unknown
      privateKey?: unknown
    }
    if (
      typeof parsed.signer !== "string" ||
      typeof parsed.privateKey !== "string"
    ) {
      throw new Error("LIVE_WALLET_KEY")
    }
    const privateKey = normalizedPrivateKey(parsed.privateKey)
    const signer = privateKeyToAccount(privateKey).address.toLowerCase()
    if (signer !== parsed.signer.toLowerCase())
      throw new Error("LIVE_WALLET_KEY")
    return { signer: signer as `0x${string}`, privateKey }
  } catch {
    throw new Error("LIVE_WALLET_KEY")
  }
}

export function asterSigningQuery(
  params: Record<string, string | number>
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    query.set(key, String(value))
  return query.toString()
}

export async function signAsterQuery(
  credential: AsterCredential,
  query: string
): Promise<`0x${string}`> {
  return privateKeyToAccount(credential.privateKey).signTypedData({
    domain: {
      name: "AsterSignTransaction",
      version: "1",
      chainId: 1666,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: { Message: [{ name: "msg", type: "string" }] },
    primaryType: "Message",
    message: { msg: query },
  })
}

/** Aster states its current allowance in this response, loaded once. */
async function ensureBudget(network: NetworkId): Promise<unknown | null> {
  if (budgetsReady.has(network)) return null
  const held = budgetLoads.get(network)
  if (held) return held

  const load = (async () => {
    const response = await send(network, EXCHANGE_INFO_PATH, {})
    const payload = await payloadOf(response)
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

/** Loads Aster's stated limits without refreshing market rules afterwards. */
export async function prepareAsterBudget(network: NetworkId): Promise<void> {
  await ensureBudget(network)
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
  const payload = await payloadOf(response)
  stopRationing("aster", network, "public")
  return payload
}

async function readAsterServerTime(network: NetworkId): Promise<number> {
  const payload = (await asterPublic(network, "/fapi/v3/time", 1)) as {
    serverTime?: unknown
  }
  const serverTime = Number(payload?.serverTime)
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0) {
    throw new Error("ASTER_CLOCK_UNREADABLE")
  }
  return serverTime
}

/** One signed V3 request. The signature and key never leave this function. */
export async function asterSigned(
  network: NetworkId,
  user: string,
  credential: AsterCredential,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  weight: number,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  await prepareAsterBudget(network)
  assertAvailable(network, "signed")
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("ASTER_REQUEST_WEIGHT_INVALID")
  }
  const nonce = await asterNonce({
    network,
    signer: credential.signer,
    readTime: readAsterServerTime,
  })
  const signedParams = {
    ...params,
    user: user.toLowerCase(),
    signer: credential.signer,
    nonce,
  }
  const query = asterSigningQuery(signedParams)
  const signature = await signAsterQuery(credential, query)
  reserveAsterRequest(network, {
    weight,
    lane: "signed",
    priority: method === "GET" ? "background" : "order",
    ...(method === "GET"
      ? {}
      : { orders: 1, orderAccount: user.toLowerCase() }),
  })
  const response = await send(
    network,
    path,
    { ...signedParams, signature },
    { lane: "signed", method }
  )
  observeAsterUsedWeight(network, response.headers.get("x-mbx-used-weight-1m"))
  try {
    const payload = await payloadOf(response)
    stopRationing("aster", network, "signed")
    return payload
  } catch (error) {
    const message = scrubbedMessage(error)
    if (message.startsWith("ASTER_CLOCK:")) {
      await asterNonce({
        network,
        signer: credential.signer,
        readTime: readAsterServerTime,
        refresh: true,
      }).catch(() => undefined)
    }
    throw new Error(message)
  }
}

/** Test state must not carry a refusal or a spent minute into another case. */
export function clearAsterClientState(): void {
  budgetLoads.clear()
  budgetsReady.clear()
  ipBanned = false
  clearAsterBudgets()
  clearAsterClocks()
  stopRationing("aster", "mainnet", "public")
  stopRationing("aster", "testnet", "public")
  stopRationing("aster", "mainnet", "signed")
  stopRationing("aster", "testnet", "signed")
}
