import { z } from "zod"
import { evmMarkets } from "@/server/protocols/evm-chain/markets"
import {
  BNB_USDT,
  BNB_WRAPPED_NATIVE,
  bnbRequestCounts,
  bnbServiceGet,
} from "./client"

const pancakeSchema = z.object({
  tokens: z.array(
    z.object({
      address: z
        .string()
        .regex(/^0x[\da-f]{40}$/i)
        .transform((value) => value.toLowerCase()),
      symbol: z.string().min(1),
      decimals: z.number().int().min(0).max(255).nullable().optional(),
      logoURI: z.string().optional(),
      chainId: z.number(),
    })
  ),
})

/**
 * BNB Chain's market list: PancakeSwap's token list is the coins it vouches
 * for, and a coin on it still reads "Unverified" until GoPlus answers clean.
 */
const markets = evmMarkets({
  protocol: "bnb",
  label: "BNB Chain",
  unsupportedNetwork: "BNB_NETWORK_UNSUPPORTED",
  serviceCode: "BNB_SERVICE",
  dexChain: "bsc",
  securityChain: 56,
  geckoNetwork: "bsc",
  dollarCoin: BNB_USDT,
  quoteAsset: "USDT",
  wrappedNative: BNB_WRAPPED_NATIVE,
  nativeSymbol: "BNB",
  picker: "crypto-only",
  get: bnbServiceGet,
  counts: bnbRequestCounts,
  vetted: {
    service: "PancakeSwap",
    load: async () =>
      pancakeSchema
        .parse(await bnbServiceGet("tokens", "/pancakeswap-extended.json"))
        .tokens.filter((token) => token.chainId === 56)
        .map(({ chainId: _chainId, ...token }) => ({
          ...token,
          category: "crypto" as const,
        })),
    trustedWithoutAudit: false,
  },
})

export const bestBnbPairs = markets.bestPairs
export const bnbMarketRow = markets.row
export const fetchBnbMarkets = markets.catalog
export const searchBnbMarkets = markets.search
export const fetchBnbPrices = markets.prices
export const bnbPricesWereRationed = markets.pricesWereRationed
export const bnbAccountMarkets = markets.accountMarkets
export const bnbKnownUnsellable = markets.knownUnsellable
export const bnbBuyRefusal = markets.buyRefusal
