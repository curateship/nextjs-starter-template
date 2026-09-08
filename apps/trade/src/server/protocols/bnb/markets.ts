import { z } from "zod"
import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"
import {
  BNB_USDT,
  BNB_WRAPPED_NATIVE,
  bnbRequestCounts,
  bnbServiceGet,
} from "./client"

export const BNB_PRICE_REFRESH = { everyMs: 10_000, mostMarkets: 300 }
export const BNB_PRICE_PAGE_SIZE = 30

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const address = z
  .string()
  .regex(/^0x[\da-f]{40}$/i)
  .transform((value) => value.toLowerCase())
const tokenSchema = z.object({
  address,
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(255).nullable().optional(),
  logoURI: z.string().optional(),
})
type Token = z.infer<typeof tokenSchema>
const pancakeSchema = z.object({
  tokens: z.array(tokenSchema.extend({ chainId: z.number() })),
})
const poolsSchema = z.object({
  data: z.array(z.unknown()),
  included: z
    .array(
      z.object({
        type: z.string(),
        attributes: tokenSchema.extend({
          image_url: z.string().nullable().optional(),
        }),
      })
    )
    .optional(),
})
const pairSchema = z.object({
  chainId: z.string(),
  pairAddress: address,
  baseToken: z.object({ address, symbol: z.string().min(1) }),
  priceUsd: z.string().nullable().optional(),
  priceChange: z.object({ h24: z.number().optional() }).nullable().optional(),
  volume: z.object({ h24: z.number().nonnegative().optional() }).optional(),
  liquidity: z.object({ usd: z.number().nonnegative().optional() }).optional(),
  info: z.object({ imageUrl: z.string().optional() }).optional(),
})
type Pair = z.infer<typeof pairSchema>
const riskSchema = z.object({
  is_honeypot: z.string().optional(),
  buy_tax: z.string().optional(),
  sell_tax: z.string().optional(),
})
type Risk = z.infer<typeof riskSchema>
const securitySchema = z.object({
  code: z.literal(1),
  result: z.record(z.string(), riskSchema),
})

function failure(service: string): Error {
  return new Error(
    `MARKETS_UNAVAILABLE:${service} could not refresh the BNB Chain market list. Try again shortly.`
  )
}
function mainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("BNB_NETWORK_UNSUPPORTED")
}

/** Only base-token prices are used. A quote token is not priced by this pair. */
export function bestBnbPairs(raw: unknown): Map<string, Pair> {
  if (!Array.isArray(raw)) throw failure("DexScreener")
  const best = new Map<string, Pair>()
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      "chainId" in item &&
      item.chainId !== "bsc"
    )
      continue
    const parsed = pairSchema.safeParse(item)
    if (!parsed.success) throw failure("DexScreener")
    const pair = parsed.data
    if (
      pair.chainId !== "bsc" ||
      !(Number(pair.priceUsd) > 0) ||
      !Number.isFinite(Number(pair.priceUsd))
    )
      continue
    const id = pair.baseToken.address
    const previous = best.get(id)
    if (
      !previous ||
      (pair.liquidity?.usd ?? 0) > (previous.liquidity?.usd ?? 0)
    )
      best.set(id, pair)
  }
  return best
}

function knownRisk(risk: Risk | null | undefined): boolean {
  return (
    risk?.is_honeypot === "0" &&
    risk.sell_tax !== undefined &&
    risk.sell_tax.trim() !== "" &&
    Number.isFinite(Number(risk.sell_tax)) &&
    Number(risk.sell_tax) >= 0
  )
}
export function bnbMarketRow(
  token: Token,
  pair: Pair,
  vetted: boolean,
  risk: Risk | null | undefined
): MarketRow | null {
  const id = token.address.toLowerCase()
  if (id === BNB_USDT || pair.baseToken.address !== id) return null
  const suspicious = risk?.is_honeypot === "1" || Number(risk?.sell_tax) > 0.1
  return {
    key: marketKey({ protocol: "bnb", network: "mainnet", marketId: id }),
    marketId: id,
    symbol: id === BNB_WRAPPED_NATIVE ? "BNB" : token.symbol,
    quoteAsset: "USDT",
    category: "crypto",
    subExchange: null,
    sizeDecimals: token.decimals ?? null,
    minOrderSize: null,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: token.logoURI ?? pair.info?.imageUrl ?? null,
    price: Number(pair.priceUsd),
    change24h:
      pair.priceChange?.h24 === undefined ? null : pair.priceChange.h24 / 100,
    volume24hUsd: pair.volume?.h24 ?? 0,
    liquidityUsd: pair.liquidity?.usd ?? null,
    poolAddress: pair.pairAddress,
    fundingHourly: null,
    openInterestUsd: null,
    caution: suspicious
      ? "suspicious"
      : vetted && knownRisk(risk)
        ? null
        : "unverified",
  }
}

let vetted = new Map<string, Token>()
let vettedAt = -Infinity
const poolPages = new Map<number, Token[]>()
let nextPoolPage = 1
let poolsAt = -Infinity
const found = new Map<string, { token: Token; at: number }>()
const risks = new Map<
  string,
  { risk: Risk | null; at: number; checkedAt: number }
>()
const riskFlights = new Map<string, Promise<void>>()
let lastGood: MarketCatalog | null = null
let attemptedAt = -Infinity
let flight: Promise<MarketCatalog> | null = null
let rationed = false
let riskPass: Promise<void> | null = null

async function refreshTokens(): Promise<void> {
  if (Date.now() - vettedAt < HOUR) return
  try {
    const answer = pancakeSchema.parse(
      await bnbServiceGet("tokens", "/pancakeswap-extended.json")
    )
    const tokens = answer.tokens.filter((token) => token.chainId === 56)
    if (!tokens.length) throw failure("PancakeSwap")
    vetted = new Map(tokens.map((token) => [token.address, token]))
    vettedAt = Date.now()
  } catch {
    if (!vetted.size) throw failure("PancakeSwap")
  }
}
async function refreshPools(): Promise<void> {
  if (Date.now() - poolsAt < MINUTE) return
  poolsAt = Date.now()
  // A retry spends a slot too. A cold list starts with at most forty pools.
  for (let n = 0; n < 2 && bnbRequestCounts().gecko < 2; n++) {
    try {
      const answer = poolsSchema.parse(
        await bnbServiceGet(
          "gecko",
          "/api/v2/networks/bsc/pools",
          {
            page: nextPoolPage,
            include: "base_token,quote_token",
            order: "h24_volume_usd_desc",
          },
          "read",
          2
        )
      )
      if (answer.data.length && !answer.included?.length)
        throw failure("GeckoTerminal")
      const tokens = (answer.included ?? [])
        .filter((item) => item.type === "token")
        .map((item) => ({
          ...item.attributes,
          logoURI: item.attributes.image_url ?? undefined,
        }))
      poolPages.set(nextPoolPage, tokens)
      nextPoolPage = (nextPoolPage % 10) + 1
    } catch {
      // Keep that page's last successful answer and try it next minute.
      break
    }
  }
}

async function checkRisk(
  id: string,
  priority: "read" | "order" = "read"
): Promise<void> {
  if (Date.now() - (risks.get(id)?.at ?? -Infinity) < HOUR) return
  const pending = riskFlights.get(id)
  if (pending) return pending
  const request = (async () => {
    const answer = securitySchema.parse(
      await bnbServiceGet(
        "security",
        "/api/v1/token_security/56",
        { contract_addresses: id },
        priority
      )
    )
    const risk = answer.result[id] ?? null
    const previous = risks.get(id)
    risks.set(id, {
      risk: risk ?? previous?.risk ?? null,
      at: Date.now(),
      checkedAt: risk ? Date.now() : (previous?.checkedAt ?? -Infinity),
    })
  })()
  riskFlights.set(id, request)
  try {
    await request
  } finally {
    riskFlights.delete(id)
  }
}
function refreshRisks(ids: string[]): void {
  if (riskPass) return
  const pending = ids
    .filter((id) => Date.now() - (risks.get(id)?.at ?? -Infinity) >= HOUR)
    .sort(
      (a, b) =>
        (risks.get(a)?.at ?? -Infinity) - (risks.get(b)?.at ?? -Infinity)
    )
  const pass = (async () => {
    for (const id of pending.slice(
      0,
      Math.max(0, 25 - bnbRequestCounts().security)
    )) {
      try {
        await checkRisk(id)
      } catch {
        break
      }
      if (lastGood)
        lastGood = {
          ...lastGood,
          rows: lastGood.rows.map((row) => {
            if (row.marketId !== id) return row
            const risk = riskFor(id)
            const suspicious =
              risk?.is_honeypot === "1" || Number(risk?.sell_tax) > 0.1
            return {
              ...row,
              caution: suspicious
                ? "suspicious"
                : vetted.has(id) && knownRisk(risk)
                  ? null
                  : "unverified",
            }
          }),
        }
      // The free service refused bursts during validation. Space the hourly
      // scan without holding up the market list or queuing searches behind it.
      await new Promise((resolve) => setTimeout(resolve, 2100))
    }
  })()
  riskPass = pass
  void pass.finally(() => {
    if (riskPass === pass) riskPass = null
  })
}

function riskFor(id: string): Risk | null {
  const cached = risks.get(id)
  if (!cached) return null
  if (cached.risk?.is_honeypot === "1" || Number(cached.risk?.sell_tax) > 0.1)
    return cached.risk
  return Date.now() - cached.checkedAt < HOUR ? cached.risk : null
}

function tokensForSession(): Map<string, Token> {
  for (const [id, entry] of found)
    if (Date.now() - entry.at >= HOUR) found.delete(id)
  const tokens = new Map<string, Token>()
  for (const page of poolPages.values())
    for (const token of page) tokens.set(token.address, token)
  for (const [id, entry] of found) tokens.set(id, entry.token)
  for (const [id, token] of vetted) tokens.set(id, token)
  tokens.delete(BNB_USDT)
  for (const id of risks.keys()) if (!tokens.has(id)) risks.delete(id)
  return tokens
}

export async function fetchBnbMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  mainnet(network)
  if (flight) return flight
  if (lastGood && Date.now() - attemptedAt < MINUTE) return lastGood
  attemptedAt = Date.now()
  flight = (async () => {
    try {
      await Promise.all([refreshTokens(), refreshPools()])
      const tokens = tokensForSession()
      const ids = [...tokens.keys()]
      const pairs = new Map<string, Pair>()
      // Sequential batches avoid a startup burst of thirty-three requests.
      for (let i = 0; i < ids.length; i += BNB_PRICE_PAGE_SIZE) {
        const answer = bestBnbPairs(
          await bnbServiceGet(
            "dex",
            `/tokens/v1/bsc/${ids.slice(i, i + BNB_PRICE_PAGE_SIZE).join(",")}`
          )
        )
        for (const [id, pair] of answer) pairs.set(id, pair)
      }

      const rows = [...tokens.values()].flatMap((token) => {
        const pair = pairs.get(token.address)
        const row =
          pair &&
          bnbMarketRow(
            token,
            pair,
            vetted.has(token.address),
            riskFor(token.address)
          )
        return row ? [row] : []
      })
      if (!rows.length) throw failure("DexScreener")
      lastGood = {
        protocol: "bnb",
        protocolLabel: "BNB Chain",
        network: "mainnet",
        networkLabel: "Mainnet",
        picker: {
          categories: "crypto-only",
          hip3: false,
          funding: false,
          openInterest: false,
          search: true,
        },
        priceRefresh: BNB_PRICE_REFRESH,
        rows,
      }
      rationed = false
      refreshRisks(ids.filter((id) => pairs.has(id)))
      return lastGood
    } catch (error) {
      rationed = true
      if (lastGood) return lastGood
      if (
        error instanceof Error &&
        error.message.startsWith("MARKETS_UNAVAILABLE:")
      )
        throw error
      if (
        error instanceof Error &&
        /^(EXCHANGE_BUSY|BNB_SERVICE_REFUSED):/.test(error.message)
      )
        throw new Error(
          `MARKETS_UNAVAILABLE:${error.message.slice(error.message.indexOf(":") + 1)}`
        )
      throw failure("The market providers")
    }
  })()
  try {
    return await flight
  } finally {
    flight = null
  }
}

export async function searchBnbMarkets(
  network: NetworkId,
  query: string
): Promise<MarketRow[]> {
  mainnet(network)
  const text = query.trim()
  if (!text || text.length > 200) return []
  const raw = await bnbServiceGet("dex", "/latest/dex/search", { q: text })
  const answer = z.object({ pairs: z.array(z.unknown()).nullable() }).parse(raw)
  const pairs = bestBnbPairs(answer.pairs ?? [])
  const rows: MarketRow[] = []
  for (const [id, pair] of pairs) {
    if (
      id === BNB_USDT ||
      (/^0x[\da-f]{40}$/i.test(text) && id !== text.toLowerCase())
    )
      continue
    const token = vetted.get(id) ?? {
      address: id,
      symbol: pair.baseToken.symbol,
      decimals: null,
    }
    try {
      await checkRisk(id, "order")
    } catch {
      /* An unchecked result stays unverified. */
    }
    const row = bnbMarketRow(token, pair, vetted.has(id), riskFor(id))
    if (!row) continue
    if (found.size >= 2000 && !found.has(id))
      found.delete(found.keys().next().value!)
    found.set(id, { token, at: Date.now() })
    rows.push(row)
  }
  return rows
}

const pricePages = new Map<
  string,
  { at: number; answer: Promise<Map<string, number>> }
>()

/** Share concurrent reads and reuse only prices requested within two seconds. */
function pricePage(ids: string[]): Promise<Map<string, number>> {
  const now = Date.now()
  for (const [key, entry] of pricePages)
    if (now - entry.at >= 2000) pricePages.delete(key)
  const key = ids.join(",")
  const held = pricePages.get(key)
  if (held) return held.answer
  const answer = bnbServiceGet("dex", `/tokens/v1/bsc/${key}`)
    .then((raw) => {
      const pairs = bestBnbPairs(raw)
      return new Map(
        ids.flatMap((id) => {
          const pair = pairs.get(id)
          return pair ? [[id, Number(pair.priceUsd)] as const] : []
        })
      )
    })
    .catch((error: unknown) => {
      if (pricePages.get(key)?.answer === answer) pricePages.delete(key)
      throw error
    })
  pricePages.set(key, { at: now, answer })
  return answer
}

export async function fetchBnbPrices(
  network: NetworkId,
  ids: readonly string[]
): Promise<Map<string, number>> {
  mainnet(network)
  const wanted = [...new Set(ids.map((id) => address.parse(id)))].sort()
  try {
    const pages: Promise<Map<string, number>>[] = []
    for (let i = 0; i < wanted.length; i += BNB_PRICE_PAGE_SIZE)
      pages.push(pricePage(wanted.slice(i, i + BNB_PRICE_PAGE_SIZE)))
    const answers = await Promise.all(pages)
    rationed = false
    return new Map(answers.flatMap((page) => [...page]))
  } catch {
    rationed = true
    throw new Error("EXCHANGE_BUSY:BNB Chain prices could not be refreshed.")
  }
}
export function bnbPricesWereRationed(): boolean {
  return rationed
}

/** Catalogue prices cost no new request. Picker discoveries join holdings immediately. */
export async function bnbAccountMarkets() {
  if (!lastGood) await fetchBnbMarkets("mainnet")
  return {
    ids: [
      ...new Set([
        ...(lastGood?.rows.map((row) => row.marketId) ?? []),
        ...found.keys(),
      ]),
    ],
    prices: new Map(
      (lastGood?.rows ?? []).map((row) => [row.marketId, row.price])
    ),
  }
}

/** Explain a failed sell from a known warning, without blocking the sell. */
export function bnbKnownUnsellable(id: string): boolean {
  return riskFor(id.toLowerCase())?.is_honeypot === "1"
}

/** A flagged buy is stopped before approvals; sells never call this guard. */
export async function bnbBuyRefusal(id: string): Promise<string | null> {
  const token = address.parse(id)
  await checkRisk(token, "order")
  const risk = riskFor(token)
  if (risk?.is_honeypot === "1") return "GoPlus says this coin cannot be sold once bought, so nothing was bought."
  const tax = Number(risk?.sell_tax ?? 0)
  if (tax > 0.1) return `GoPlus says this coin charges a ${(tax * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% sell tax, so nothing was bought.`
  return null
}
