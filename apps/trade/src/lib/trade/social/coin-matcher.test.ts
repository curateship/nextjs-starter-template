import { describe, expect, it } from "vitest"

import {
  buildCoinMatchList,
  coinsNamedIn,
  NEVER_A_BARE_TICKER,
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

const list = buildCoinMatchList(MARKETS)

/** Just the coins, in the order the post named them. */
function coins(text: string): string[] {
  return coinsNamedIn(text, list).map((match) => match.coin)
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
    expect(coinsNamedIn("all in on APE", list)).toEqual([
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
    expect(coinsNamedIn("$sol, ETH, bitcoin", list)).toEqual([
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
    expect(coinsNamedIn("$PEPE and SHIB", list)).toEqual([
      { coin: "kPEPE", how: "dollar-ticker", text: "$PEPE" },
      { coin: "kSHIB", how: "ticker", text: "SHIB" },
    ])
    expect(coins("pepe season")).toEqual(["kPEPE"])
  })

  it("drops a name whose coin has no market here", () => {
    const thin = buildCoinMatchList(["BTC"])
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
