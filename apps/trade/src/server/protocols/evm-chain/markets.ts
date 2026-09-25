import { z } from "zod"
import type {
  MarketCatalog,
  MarketCategory,
  MarketPickerCapabilities,
  MarketRow,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"

export const PRICE_PAGE_SIZE = 30
export const PRICE_REFRESH = { everyMs: 10_000, mostMarkets: 300 }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const ZERO_ADDRESS = `0x${"0".repeat(40)}`
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
type ListedToken = z.infer<typeof tokenSchema>
/** A coin the chain's own list vouches for, and the tab it belongs under. */
export type VettedToken = ListedToken & { category: MarketCategory }
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
/**
 * A pool's own id. Older pools are a contract, so 40 hexadecimal characters.
 * A pool in a v4-style exchange has no contract of its own and is named by a
 * 64-character hash, and one such pair used to fail the whole price page.
 */
const poolId = z
  .string()
  .regex(/^0x(?:[\da-f]{40}|[\da-f]{64})$/i)
  .transform((value) => value.toLowerCase())
const pairSchema = z.object({
  chainId: z.string(),
  pairAddress: poolId,
  baseToken: z.object({ address, symbol: z.string().min(1) }),
  priceUsd: z.string().nullable().optional(),
  priceChange: z.object({ h24: z.number().optional() }).nullable().optional(),
  volume: z.object({ h24: z.number().nonnegative().optional() }).optional(),
  liquidity: z.object({ usd: z.number().nonnegative().optional() }).optional(),
  info: z.object({ imageUrl: z.string().optional() }).optional(),
})
type Pair = z.infer<typeof pairSchema>
const riskSchema = z.object({
  is_honeypot: z.string().nullable().optional(),
  buy_tax: z.string().nullable().optional(),
  sell_tax: z.string().nullable().optional(),
})
type Risk = z.infer<typeof riskSchema>
const securitySchema = z.object({
  code: z.literal(1),
  result: z.record(z.string(), riskSchema),
})

type Service = "gecko" | "dex" | "security"
type Get = (
  service: Service,
  path: string,
  params?: Record<string, string | number>,
  priority?: "read" | "order",
  ceiling?: number
) => Promise<unknown>

/** Everything one chain tells the shared market list about itself. */
type MarketsChain = {
  protocol: ProtocolId
  /** The chain's printed name, for the failure sentence. */
  label: string
  unsupportedNetwork: string
  /** The chain's error code prefix for a refused service answer. */
  serviceCode: string
  /** The chain's name at DexScreener, GoPlus and GeckoTerminal. */
  dexChain: string
  securityChain: number
  geckoNetwork: string
  /** Lowercase addresses. The dollar coin is never listed. */
  dollarCoin: string
  quoteAsset: MarketRow["quoteAsset"]
  wrappedNative: string
  nativeSymbol: string
  picker: MarketPickerCapabilities["categories"]
  get: Get
  counts(): Record<Service, number>
  /**
   * The coins this chain vouches for, from its own list, read once an hour.
   * `service` names the list in the failure sentence when it will not answer.
   */
  vetted: {
    service: string
    load(): Promise<VettedToken[]>
    /**
     * True where the list itself is the proof, so a blank GoPlus answer is
     * not a warning. False where the list only says a coin is known, and the
     * coin stays "Unverified" until GoPlus answers with a clean record.
     */
    trustedWithoutAudit: boolean
  }
}

function suspicious(risk: Risk | null | undefined): boolean {
  return risk?.is_honeypot === "1" || Number(risk?.sell_tax) > 0.1
}
function knownRisk(risk: Risk | null | undefined): boolean {
  return (
    risk?.is_honeypot === "0" &&
    typeof risk.sell_tax === "string" &&
    risk.sell_tax.trim() !== "" &&
    Number.isFinite(Number(risk.sell_tax)) &&
    Number(risk.sell_tax) >= 0
  )
}

/**
 * One chain's market list: its vouched-for coins and the day's busiest pools,
 * priced from each coin's most liquid DexScreener pair and checked by GoPlus.
 *
 * GeckoTerminal is asked for two of its ten pool pages a minute, so the 200
 * busiest pools are all read every five minutes. A coin DexScreener has no
 * pair for is left out rather than shown without a price.
 */
export function evmMarkets(chain: MarketsChain) {
  const { get, counts } = chain

  function failure(service: string): Error {
    return new Error(
      `MARKETS_UNAVAILABLE:${service} could not refresh the ${chain.label} market list. Try again shortly.`
    )
  }
  function mainnet(network: NetworkId): void {
    if (network !== "mainnet") throw new Error(chain.unsupportedNetwork)
  }
  function listable(id: string): boolean {
    return id !== chain.dollarCoin && id !== ZERO_ADDRESS
  }

  /** Only base-token prices are used. A quote token is not priced by this pair. */
  function bestPairs(raw: unknown): Map<string, Pair> {
    if (!Array.isArray(raw)) throw failure("DexScreener")
    const best = new Map<string, Pair>()
    for (const item of raw) {
      if (
        typeof item === "object" &&
        item !== null &&
        "chainId" in item &&
        item.chainId !== chain.dexChain
      )
        continue
      const parsed = pairSchema.safeParse(item)
      if (!parsed.success) throw failure("DexScreener")
      const pair = parsed.data
      if (
        pair.chainId !== chain.dexChain ||
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

  function caution(
    vouched: boolean,
    risk: Risk | null | undefined
  ): MarketRow["caution"] {
    if (suspicious(risk)) return "suspicious"
    if (!vouched) return "unverified"
    return chain.vetted.trustedWithoutAudit || knownRisk(risk)
      ? null
      : "unverified"
  }

  function row(
    token: ListedToken & { category?: MarketCategory },
    pair: Pair,
    vouched: boolean,
    risk: Risk | null | undefined
  ): MarketRow | null {
    const id = token.address.toLowerCase()
    if (!listable(id) || pair.baseToken.address !== id) return null
    return {
      key: marketKey({
        protocol: chain.protocol,
        network: "mainnet",
        marketId: id,
      }),
      marketId: id,
      symbol: id === chain.wrappedNative ? chain.nativeSymbol : token.symbol,
      quoteAsset: chain.quoteAsset,
      category: vouched ? (token.category ?? "crypto") : "crypto",
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
      caution: caution(vouched, risk),
    }
  }

  let vetted = new Map<string, VettedToken>()
  let vettedAt = -Infinity
  const poolPages = new Map<number, ListedToken[]>()
  let nextPoolPage = 1
  let poolsAt = -Infinity
  const found = new Map<string, { token: ListedToken; at: number }>()
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

  async function refreshVetted(): Promise<void> {
    if (Date.now() - vettedAt < HOUR) return
    try {
      const tokens = await chain.vetted.load()
      if (!tokens.length) throw failure(chain.vetted.service)
      vetted = new Map(tokens.map((token) => [token.address, token]))
      vettedAt = Date.now()
    } catch {
      if (!vetted.size) throw failure(chain.vetted.service)
    }
  }
  async function refreshPools(): Promise<void> {
    if (Date.now() - poolsAt < MINUTE) return
    poolsAt = Date.now()
    // A retry spends a slot too. A cold list starts with at most forty pools.
    for (let n = 0; n < 2 && counts().gecko < 2; n++) {
      try {
        const answer = poolsSchema.parse(
          await get(
            "gecko",
            `/api/v2/networks/${chain.geckoNetwork}/pools`,
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
        await get(
          "security",
          `/api/v1/token_security/${chain.securityChain}`,
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
        Math.max(0, 25 - counts().security)
      )) {
        try {
          await checkRisk(id)
        } catch {
          break
        }
        if (lastGood)
          lastGood = {
            ...lastGood,
            rows: lastGood.rows.map((one) =>
              one.marketId === id
                ? { ...one, caution: caution(vetted.has(id), riskFor(id)) }
                : one
            ),
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
    if (suspicious(cached.risk)) return cached.risk
    return Date.now() - cached.checkedAt < HOUR ? cached.risk : null
  }

  function tokensForSession(): Map<string, ListedToken | VettedToken> {
    for (const [id, entry] of found)
      if (Date.now() - entry.at >= HOUR) found.delete(id)
    const tokens = new Map<string, ListedToken | VettedToken>()
    for (const page of poolPages.values())
      for (const token of page) tokens.set(token.address, token)
    for (const [id, entry] of found) tokens.set(id, entry.token)
    for (const [id, token] of vetted) tokens.set(id, token)
    for (const id of tokens.keys()) if (!listable(id)) tokens.delete(id)
    for (const id of risks.keys()) if (!tokens.has(id)) risks.delete(id)
    return tokens
  }

  async function catalog(network: NetworkId): Promise<MarketCatalog> {
    mainnet(network)
    if (flight) return flight
    if (lastGood && Date.now() - attemptedAt < MINUTE) return lastGood
    attemptedAt = Date.now()
    flight = (async () => {
      try {
        await Promise.all([refreshVetted(), refreshPools()])
        const tokens = tokensForSession()
        const ids = [...tokens.keys()]
        const pairs = new Map<string, Pair>()
        // Sequential batches avoid a startup burst of thirty-three requests.
        for (let i = 0; i < ids.length; i += PRICE_PAGE_SIZE) {
          const answer = bestPairs(
            await get(
              "dex",
              `/tokens/v1/${chain.dexChain}/${ids.slice(i, i + PRICE_PAGE_SIZE).join(",")}`
            )
          )
          for (const [id, pair] of answer) pairs.set(id, pair)
        }

        const rows = [...tokens.values()].flatMap((token) => {
          const pair = pairs.get(token.address)
          const made =
            pair &&
            row(
              token,
              pair,
              vetted.has(token.address),
              riskFor(token.address)
            )
          return made ? [made] : []
        })
        if (!rows.length) throw failure("DexScreener")
        lastGood = {
          protocol: chain.protocol,
          protocolLabel: chain.label,
          network: "mainnet",
          networkLabel: "Mainnet",
          picker: {
            categories: chain.picker,
            hip3: false,
            funding: false,
            openInterest: false,
            search: true,
          },
          priceRefresh: PRICE_REFRESH,
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
          error.message.startsWith("EXCHANGE_BUSY:")
        )
          throw new Error(
            `MARKETS_UNAVAILABLE:${error.message.slice(error.message.indexOf(":") + 1)}`
          )
        // A service that refused names itself; its status code is not a sentence.
        const refused =
          error instanceof Error &&
          error.message.startsWith(`${chain.serviceCode}_REFUSED:`)
            ? error.message.split(":")[1]
            : undefined
        throw failure(refused || "The market providers")
      }
    })()
    try {
      return await flight
    } finally {
      flight = null
    }
  }

  async function search(
    network: NetworkId,
    query: string
  ): Promise<MarketRow[]> {
    mainnet(network)
    const text = query.trim()
    if (!text || text.length > 200) return []
    const raw = await get("dex", "/latest/dex/search", { q: text })
    const answer = z
      .object({ pairs: z.array(z.unknown()).nullable() })
      .parse(raw)
    const pairs = bestPairs(answer.pairs ?? [])
    const rows: MarketRow[] = []
    for (const [id, pair] of pairs) {
      if (
        !listable(id) ||
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
      const made = row(token, pair, vetted.has(id), riskFor(id))
      if (!made) continue
      if (found.size >= 2000 && !found.has(id))
        found.delete(found.keys().next().value!)
      found.set(id, { token, at: Date.now() })
      rows.push(made)
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
    const answer = get("dex", `/tokens/v1/${chain.dexChain}/${key}`)
      .then((raw) => {
        const best = bestPairs(raw)
        return new Map(
          ids.flatMap((id) => {
            const pair = best.get(id)
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

  async function prices(
    network: NetworkId,
    ids: readonly string[]
  ): Promise<Map<string, number>> {
    mainnet(network)
    const wanted = [...new Set(ids.map((id) => address.parse(id)))].sort()
    try {
      const pages: Promise<Map<string, number>>[] = []
      for (let i = 0; i < wanted.length; i += PRICE_PAGE_SIZE)
        pages.push(pricePage(wanted.slice(i, i + PRICE_PAGE_SIZE)))
      const answers = await Promise.all(pages)
      rationed = false
      return new Map(answers.flatMap((page) => [...page]))
    } catch {
      rationed = true
      throw new Error(
        `EXCHANGE_BUSY:${chain.label} prices could not be refreshed.`
      )
    }
  }

  /** Catalogue prices cost no new request. Picker discoveries join holdings immediately. */
  async function accountMarkets() {
    if (!lastGood) await catalog("mainnet")
    return {
      ids: [
        ...new Set([
          ...(lastGood?.rows.map((one) => one.marketId) ?? []),
          ...found.keys(),
        ]),
      ],
      prices: new Map(
        (lastGood?.rows ?? []).map((one) => [one.marketId, one.price])
      ),
    }
  }

  /** Explain a failed sell from a known warning, without blocking the sell. */
  function knownUnsellable(id: string): boolean {
    return riskFor(id.toLowerCase())?.is_honeypot === "1"
  }

  /** A flagged buy is stopped before approvals; sells never call this guard. */
  async function buyRefusal(id: string): Promise<string | null> {
    const token = address.parse(id)
    await checkRisk(token, "order")
    const risk = riskFor(token)
    if (risk?.is_honeypot === "1")
      return "GoPlus says this coin cannot be sold once bought, so nothing was bought."
    const tax = Number(risk?.sell_tax ?? 0)
    if (tax > 0.1)
      return `GoPlus says this coin charges a ${(tax * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% sell tax, so nothing was bought.`
    return null
  }

  return {
    bestPairs,
    row,
    catalog,
    search,
    prices,
    pricesWereRationed: () => rationed,
    accountMarkets,
    knownUnsellable,
    buyRefusal,
  }
}
