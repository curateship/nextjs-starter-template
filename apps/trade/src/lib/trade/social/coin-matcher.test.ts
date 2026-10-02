import { describe, expect, it } from "vitest"

import {
  buildCoinMatchList,
  coinsNamedIn,
  NEVER_A_BARE_TICKER,
  type MarketToMatch,
} from "@/lib/trade/social/coin-matcher"
import { COIN_NAMES } from "@/lib/trade/social/coin-names"

/**
 * The markets Trade has in these tests. A short list on purpose: the point of
 * most of these is that a coin outside the list is never returned, however
 * plainly a post names it.
 */
const MARKETS = [
  "SOL",
  "ETH",
  "BTC",
  "APE",
  "APEX",
  "LINK",
  "ATOM",
  "kPEPE",
  "kSHIB",
  "DOGE",
  "ADA",
  "TIA",
  "HYPE",
  "ME",
  "AI",
  "PUMP",
  "S",
  "SUI",
  "XRP",
  "AVAX",
  "ARB",
  "OP",
  "TAO",
  "JUP",
  "BCH",
]

/** The coins, as the builder takes them: a ticker, a market and a kind. */
function asCoins(symbols: readonly string[]): MarketToMatch[] {
  return symbols.map((symbol) => ({
    symbol,
    key: `hyperliquid:mainnet:${symbol}`,
    kind: "coin" as const,
  }))
}

const list = buildCoinMatchList(asCoins(MARKETS))

/** Just the coins, in the order the post named them. */
function coins(text: string): string[] {
  return coinsNamedIn(text, list).map((match) => match.coin)
}

/** Each match without the market it points at, which has its own tests. */
function howEach(text: string) {
  return coinsNamedIn(text, list).map(({ coin, how, text: words }) => ({
    coin,
    how,
    text: words,
  }))
}

describe("the six sentences this was built for", () => {
  it("reads two coins out of one post, both written in lower case", () => {
    expect(coins("adding more sol here, and eth is still cheap")).toEqual([
      "SOL",
      "ETH",
    ])
  })

  it("does not read APE out of apes", () => {
    expect(coins("apes are buying")).toEqual([])
  })

  it("takes a dollar ticker even when the word is on the stop list", () => {
    expect(NEVER_A_BARE_TICKER.has("PUMP")).toBe(true)
    expect(coins("$APE to the moon")).toEqual(["APE"])
    expect(coins("$PUMP is up")).toEqual(["PUMP"])
  })

  it("reads a bare ticker in capitals", () => {
    expect(howEach("all in on APE")).toEqual([
      { coin: "APE", how: "ticker", text: "APE" },
    ])
  })

  it("leaves Sol the person alone", () => {
    expect(coins("Sol said he'd sell")).toEqual([])
  })

  it("never returns a coin Trade has no market for", () => {
    // Neither one is in MARKETS, and both are named as plainly as a post can.
    expect(coins("$WIF and litecoin and LTC")).toEqual([])
  })

  it("leaves one answer per coin however many times a post names it", () => {
    expect(coins("$SOL, solana, SOL, sol again")).toEqual(["SOL"])
  })
})

describe("the three rules and nothing else", () => {
  it("takes a dollar ticker whatever the case", () => {
    expect(coins("$sol $Eth $BTC")).toEqual(["SOL", "ETH", "BTC"])
  })

  it("takes a bare ticker only in capitals", () => {
    // APEX has no written name in the dictionary, so capitals are the only way
    // a post can name it without a dollar sign.
    expect(coins("APEX is cheap")).toEqual(["APEX"])
    expect(coins("Apex is cheap")).toEqual([])
    expect(coins("apex is cheap")).toEqual([])
  })

  it("takes a written name whatever the case", () => {
    expect(coins("Solana and BITCOIN and ethereum")).toEqual([
      "SOL",
      "BTC",
      "ETH",
    ])
  })

  it("says how each one matched", () => {
    expect(howEach("$sol, ETH, bitcoin")).toEqual([
      { coin: "SOL", how: "dollar-ticker", text: "$sol" },
      { coin: "ETH", how: "ticker", text: "ETH" },
      { coin: "BTC", how: "name", text: "bitcoin" },
    ])
  })

  it("guesses at nothing: a misspelling is not a coin", () => {
    expect(coins("solanna and bitcon and $SOOL")).toEqual([])
  })

  it("wants the word to stand alone", () => {
    expect(coins("resolve the APEXITY of 3sol and SOLs")).toEqual([])
    expect(coins("ATOMIC")).toEqual([])
  })

  it("reads a two-word name, and the first word alone when it is not one", () => {
    expect(coins("shiba inu is back")).toEqual(["kSHIB"])
    expect(coins("bitcoin cash")).toEqual(["BCH"])
    expect(coins("bitcoin is back")).toEqual(["BTC"])
  })
})

describe("the words that are never a coin", () => {
  it("skips a stop-listed word in capitals", () => {
    expect(coins("ME AND AI PUMP IT")).toEqual([])
  })

  it("gives a reason for every word on the list", () => {
    for (const [word, reason] of NEVER_A_BARE_TICKER) {
      expect(word).toBe(word.toUpperCase())
      expect(reason.length).toBeGreaterThan(4)
    }
  })

  it("is never a name as well, or the stop list would be half a rule", () => {
    // The stop list is checked on the bare-ticker rule. A word that was also in
    // the name dictionary would walk straight past it in lower case, so the two
    // lists must never overlap.
    for (const word of NEVER_A_BARE_TICKER.keys()) {
      expect(COIN_NAMES[word.toLowerCase()]).toBeUndefined()
    }
  })

  it("still reads the coins in a post that also shouts one", () => {
    expect(coins("AI IS ALL ANYONE TALKS ABOUT, I AM BUYING $SOL")).toEqual([
      "SOL",
    ])
  })
})

describe("what a post is not", () => {
  it("does not read a coin out of an account name", () => {
    expect(coins("@solana shipped it")).toEqual([])
    expect(coins("thanks @ape and @BTC_maxi")).toEqual([])
  })

  it("does not read a coin out of a link", () => {
    expect(
      coins("read it https://t.co/ETHxyz and https://sol.example/APE")
    ).toEqual([])
  })

  it("leaves a one-letter ticker to the dollar sign", () => {
    expect(coins("S is my pick")).toEqual([])
    expect(coins("$S is my pick")).toEqual(["S"])
    expect(coins("sonic is my pick")).toEqual(["S"])
  })
})

describe("the market list decides what can match", () => {
  it("points a plain ticker at the k-coin Trade actually trades", () => {
    expect(howEach("$PEPE and SHIB")).toEqual([
      { coin: "kPEPE", how: "dollar-ticker", text: "$PEPE" },
      { coin: "kSHIB", how: "ticker", text: "SHIB" },
    ])
    expect(coins("pepe season")).toEqual(["kPEPE"])
  })

  it("drops a name whose coin has no market here", () => {
    const thin = buildCoinMatchList(asCoins(["BTC"]))
    expect(
      coinsNamedIn("solana and bitcoin", thin).map((one) => one.coin)
    ).toEqual(["BTC"])
  })

  it("reads twelve coins out of one post", () => {
    expect(
      coins(
        "portfolio: $SOL, eth, BTC, xrp, $AVAX, dogecoin, ARB, $OP, sui, tia, bittensor, jupiter"
      )
    ).toEqual([
      "SOL",
      "ETH",
      "BTC",
      "XRP",
      "AVAX",
      "DOGE",
      "ARB",
      "OP",
      "SUI",
      "TIA",
      "TAO",
      "JUP",
    ])
  })
})

/**
 * Stocks, metals and currencies: task 31.
 *
 * The stock list is its own fixture, because the point of most of these is
 * that a stock behaves differently from a coin on purpose.
 */
const STOCKS: MarketToMatch[] = [
  { symbol: "TSLA", key: "edgex:mainnet:TSLAUSDC", kind: "stock" },
  { symbol: "NVDA", key: "edgex:mainnet:NVDAUSDC", kind: "stock" },
  { symbol: "SPY", key: "apex:mainnet:SPY-USDT", kind: "stock" },
  { symbol: "AAPL", key: "edgex:mainnet:AAPLUSDC", kind: "stock" },
  { symbol: "META", key: "edgex:mainnet:METAUSDC", kind: "stock" },
  { symbol: "ALL", key: "edgex:mainnet:ALLUSDC", kind: "stock" },
  { symbol: "OPEN", key: "edgex:mainnet:OPENUSDC", kind: "stock" },
  { symbol: "XAU", key: "edgex:mainnet:XAUUSDC", kind: "commodity" },
  { symbol: "EURUSD", key: "edgex:mainnet:EURUSD", kind: "currency" },
]

const withStocks = buildCoinMatchList([...asCoins(MARKETS), ...STOCKS])
const coinsOnly = buildCoinMatchList(asCoins(MARKETS))

/** Just the tickers, in the order the post named them, with stocks on. */
function named(text: string): string[] {
  return coinsNamedIn(text, withStocks).map((match) => match.coin)
}

describe("the sentences task 31 was built for", () => {
  it("matches a dollar ticker", () => {
    expect(named("$TSLA into earnings")).toEqual(["TSLA"])
  })

  it("matches a bare ticker in capitals", () => {
    expect(named("NVDA is the only thing that matters this quarter")).toEqual([
      "NVDA",
    ])
  })

  it("does not match a bare lower-case ticker", () => {
    expect(named("nvda is the only thing that matters this quarter")).toEqual(
      []
    )
  })

  it("does not match a lower-case company name", () => {
    expect(named("apple and tesla and meta had a good week")).toEqual([])
  })

  it("matches a stop-list word only with a dollar sign", () => {
    expect(named("all the ALL ords news")).toEqual([])
    expect(named("$ALL is up")).toEqual(["ALL"])
  })

  it("reads nothing out of a sentence about opening a position", () => {
    expect(named("open a new position, OPEN a new position")).toEqual([])
    expect(named("$OPEN though")).toEqual(["OPEN"])
  })

  it("matches nothing in the stock list while the switch is off", () => {
    expect(coinsNamedIn("$TSLA, NVDA, SPY and $AAPL", coinsOnly)).toEqual([])
  })

  it("reads four stocks and two coins out of one post", () => {
    expect(
      named("$TSLA NVDA $SPY META, plus $SOL and ETH")
    ).toEqual(["TSLA", "NVDA", "SPY", "META", "SOL", "ETH"])
  })

  it("says what kind each match is, and which market it opens", () => {
    expect(coinsNamedIn("$TSLA, $XAU, $EURUSD and $SOL", withStocks)).toEqual([
      {
        coin: "TSLA",
        kind: "stock",
        marketKey: "edgex:mainnet:TSLAUSDC",
        how: "dollar-ticker",
        text: "$TSLA",
      },
      {
        coin: "XAU",
        kind: "commodity",
        marketKey: "edgex:mainnet:XAUUSDC",
        how: "dollar-ticker",
        text: "$XAU",
      },
      {
        coin: "EURUSD",
        kind: "currency",
        marketKey: "edgex:mainnet:EURUSD",
        how: "dollar-ticker",
        text: "$EURUSD",
      },
      {
        coin: "SOL",
        kind: "coin",
        marketKey: "hyperliquid:mainnet:SOL",
        how: "dollar-ticker",
        text: "$SOL",
      },
    ])
  })

  it("leaves a coin's ticker with the coin when a stock shares it", () => {
    const clash = buildCoinMatchList([
      ...asCoins(["SOL"]),
      { symbol: "SOL", key: "edgex:mainnet:SOLUSDC", kind: "stock" },
    ])
    expect(coinsNamedIn("$SOL", clash)).toEqual([
      {
        coin: "SOL",
        kind: "coin",
        marketKey: "hyperliquid:mainnet:SOL",
        how: "dollar-ticker",
        text: "$SOL",
      },
    ])
  })

  it("keeps every stock out of the written-name dictionary", () => {
    for (const entry of withStocks.names.values()) {
      expect(entry.kind).toBe("coin")
    }
  })
})
