import {
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"

export const BNB_CHAIN_ID = 56
export const BNB_DEX_REQUESTS_PER_MINUTE = 300

export function bnbRpcUrl(): string {
  return process.env.TRADE_BNB_RPC?.trim() || "https://bsc-dataseed.binance.org"
}

export const BNB_USDT = "0x55d398326f99059ff775485246999027b3197955"
export const BNB_WRAPPED_NATIVE = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"

const services = {
  tokens: {
    label: "PancakeSwap",
    base: "https://tokens.pancakeswap.finance",
    cap: 2,
    windowMs: 60_000,
    reserve: 0,
  },
  security: {
    label: "GoPlus",
    base: "https://api.gopluslabs.io",
    cap: 30,
    windowMs: 60_000,
    reserve: 5,
  },
  kyber: {
    label: "KyberSwap",
    base: "https://aggregator-api.kyberswap.com",
    cap: 30,
    windowMs: 10_000,
    reserve: 10,
  },
  gecko: {
    label: "GeckoTerminal",
    base: "https://api.geckoterminal.com",
    cap: 30,
    windowMs: 60_000,
    reserve: 0,
  },
  dex: {
    label: "DexScreener",
    base: "https://api.dexscreener.com",
    cap: BNB_DEX_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
    reserve: 0,
  },
} as const

type Service = keyof typeof services
type Priority = "read" | "order"
const sentAt: Record<Service, number[]> = {
  tokens: [],
  security: [],
  kyber: [],
  gecko: [],
  dex: [],
}

let geckoPausedUntil = 0

export function reserveBnbRequest(
  service: Service,
  priority: Priority = "read",
  ceiling = Infinity
): void {
  const config = services[service]
  const now = Date.now()
  if (service === "gecko" && now < geckoPausedUntil)
    throw new Error(
      "EXCHANGE_BUSY:GeckoTerminal — requests are paused after a rate-limit response"
    )
  const sent = sentAt[service]
  while (sent.length && sent[0] <= now - config.windowMs) sent.shift()
  const cap = Math.min(
    ceiling,
    config.cap - (priority === "read" ? config.reserve : 0)
  )
  if (sent.length >= cap) {
    throw new Error(
      `EXCHANGE_BUSY:${config.label} spent ${sent.length} of ${cap} requests in ${config.windowMs / 1000} seconds.`
    )
  }
  sent.push(now)
}

/** Reads only. Signed transactions must never use a retrying request. */
export async function bnbServiceGet(
  service: Service,
  path: string,
  params: Record<string, string | number> = {},
  priority: Priority = "read",
  ceiling = Infinity
): Promise<unknown> {
  const config = services[service]
  const url = new URL(path, config.base)
  if (url.origin !== config.base || url.username || url.password)
    throw new Error("BNB_SERVICE_PATH")
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value))
  async function send(): Promise<Response> {
    reserveBnbRequest(service, priority, ceiling)
    try {
      return await fetch(url, {
        headers: { accept: "application/json" },
        signal: requestSignal(READ_TIMEOUT_MS),
        redirect: "error",
      })
    } catch {
      // Do not expose a provider URL or response containing credentials.
      throw new Error(
        `EXCHANGE_BUSY:${config.label} did not answer. Try again shortly.`
      )
    }
  }
  let response = await send()
  if (response.status === 429 && service === "gecko") {
    const retryAfter = response.headers.get("retry-after")
    const seconds = Number(retryAfter)
    const retryAt =
      retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN
    const delay = Number.isFinite(retryAt)
      ? retryAt - Date.now()
      : Number.isFinite(seconds)
        ? seconds * 1000
        : 0
    geckoPausedUntil = Date.now() + Math.max(60_000, delay)
    throw new Error(
      "EXCHANGE_BUSY:GeckoTerminal — requests are paused after a rate-limit response"
    )
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"))
    const delay =
      Number.isFinite(seconds) && seconds > 0
        ? Math.min(seconds * 1000, 5000)
        : 1000
    await new Promise((resolve) => setTimeout(resolve, delay))
    response = await send()
  }
  if (response.status === 429)
    throw new Error(
      `EXCHANGE_BUSY:${config.label} refused the retry. Try again shortly.`
    )
  if (!response.ok)
    throw new Error(`BNB_SERVICE_REFUSED:${config.label}:${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`BNB_SERVICE_REFUSED:${config.label}:invalid-json`)
  }
}

/** Actual outgoing requests in each rolling window, including retries. */
export function bnbRequestCounts(): Record<Service, number> {
  return Object.fromEntries(
    Object.entries(services).map(([name, config]) => [
      name,
      sentAt[name as Service].filter((at) => at > Date.now() - config.windowMs)
        .length,
    ])
  ) as Record<Service, number>
}
