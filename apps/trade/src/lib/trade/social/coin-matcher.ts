import {
  COIN_NAMES,
  NAMES_THAT_ARE_ALSO_PEOPLE,
} from "@/lib/trade/social/coin-names"

/**
 * Which markets a post names, worked out from the words.
 *
 * Three rules and no others: `$SOL` whatever the case, a bare `SOL` only when
 * the post wrote it in capitals, and a written name such as `solana` whatever
 * the case. No fuzzy matching, no edit distance, no guessing at a misspelling.
 * A post naming no market is a post naming no market, which is an answer.
 *
 * **Only markets Trade lists can be matched.** The list comes from the app's
 * own market lists, so "the thing you matched has no market here" can never
 * happen, and a market listed tomorrow is not in posts stored today until the
 * pass in `src/server/trade/social-post-coins.ts` runs over them again.
 *
 * **Coins, and only if the member asked, stocks, metals and currencies.** The
 * kinds are the member's choice, because a stock ticker collides with an
 * ordinary English word far more often than a coin ticker does. The switch is
 * in Settings → Social and starts off.
 *
 * **It costs nothing to run.** No model, no request, one pass over the words,
 * so it can run over every post held.
 */

/** How a market turned up in a post. */
export type CoinMatchHow = "dollar-ticker" | "ticker" | "name"

/**
 * What kind of thing the market is, in the words the screen uses.
 *
 * `commodity` covers gold, silver, copper and oil together, which is what
 * edgeX and ApeX Omni list under one flag. The screen calls it "Metals and
 * oil" rather than inventing a second kind per metal.
 */
export type MarketMatchKind = "coin" | "stock" | "commodity" | "currency"

/** One market a post is allowed to name. */
export type MarketMatchEntry = {
  /** The ticker as Trade lists it: "SOL", "kPEPE", "TSLA". */
  ticker: string
  kind: MarketMatchKind
  /** The market this opens: "hyperliquid:mainnet:SOL". */
  marketKey: string
}

export type CoinMatch = {
  /** The ticker as Trade lists it: "SOL", "kPEPE", "TSLA". */
  coin: string
  kind: MarketMatchKind
  /** The market a chip for this match opens. */
  marketKey: string
  how: CoinMatchHow
  /** The exact words that matched, kept so a bad match can be read back. */
  text: string
}

export type CoinMatchList = {
  /** Upper-case ticker to the market, including the alias for a k-coin. */
  tickers: Map<string, MarketMatchEntry>
  /** Lower-case written name to the market. Coins only, by rule. */
  names: Map<string, MarketMatchEntry>
  /** True when any name in the list is two words. */
  hasTwoWordNames: boolean
}

/** One market handed to the builder, straight off a market catalogue. */
export type MarketToMatch = {
  /** The ticker the exchange prints: "SOL", "kPEPE", "TSLA", "XAU". */
  symbol: string
  /** The market key, so a chip can open the market that was matched. */
  key: string
  kind: MarketMatchKind
}

/**
 * The shortest a bare ticker may be.
 *
 * Hyperliquid lists `S` and `W`, and a post is full of stray capitals. "S" and
 * "W" on their own are never somebody naming a market, so the bare-ticker rule
 * starts at two letters. `$S` still matches, because the dollar sign is the
 * person saying they meant the market.
 */
export const SHORTEST_BARE_TICKER = 2

/**
 * Upper-case words that are never a market, checked before the bare-ticker
 * rule.
 *
 * Each of these is a real ticker somewhere and an ordinary word in a post, and
 * a post shouting one of them would otherwise be filed under a market nobody
 * mentioned. A word here still matches with a dollar sign in front of it,
 * because `$ME` is a person naming the coin on purpose.
 *
 * **Stock tickers are why the list is this long.** A coin ticker is usually a
 * made-up word; a stock ticker is three letters a company liked, so `ALL`,
 * `KEY`, `CAR`, `MAN` and `WELL` are all real listings and all ordinary words.
 * One list covers both kinds rather than a second list per kind, so there is
 * one place to look when a match is wrong.
 *
 * The reason is written beside every word. A list with no reasons is a list the
 * next person deletes.
 */
export const NEVER_A_BARE_TICKER = new Map<string, string>([
  ["AI", "the technology, in nearly every post that says it"],
  ["ALL", "an ordinary word, and shouted: ALL IN"],
  ["AN", "an ordinary word"],
  ["ANY", "an ordinary word"],
  ["AR", "augmented reality"],
  ["BE", "an ordinary word"],
  ["CAR", "an ordinary word"],
  ["CC", "carbon copy"],
  ["FOR", "an ordinary word"],
  ["GAS", "what a transaction costs, on every chain"],
  ["GO", "an ordinary word, and shouted: LET'S GO"],
  ["HOPE", "an ordinary word"],
  ["ID", "identification, and an ID check"],
  ["IO", "the end of a web address"],
  ["IP", "intellectual property, and a network address"],
  ["IT", "an ordinary word"],
  ["KEY", "an ordinary word, and the word for an API key"],
  ["LOVE", "an ordinary word"],
  ["MAN", "an ordinary word, and an exclamation"],
  ["ME", "an ordinary word, and shouted"],
  ["MET", "an ordinary word: we MET yesterday"],
  ["NOT", "an ordinary word"],
  ["NOW", "an ordinary word, and shouted: BUY NOW"],
  ["OM", "an abbreviation and a chant, not the coin, in prose"],
  ["ON", "an ordinary word"],
  ["OPEN", "an ordinary word: OPEN a new position"],
  ["OP", "the original poster, in every reply on X"],
  ["OR", "an ordinary word"],
  ["PLAY", "an ordinary word, and what traders call a trade idea"],
  ["PUMP", "what traders shout at a rising price"],
  ["SO", "an ordinary word"],
  ["SUN", "an ordinary word"],
  ["TST", "reads as a test marker"],
  ["WELL", "an ordinary word"],
  ["WIN", "an ordinary word, and shouted"],
])

/**
 * Build the match list from the markets the app lists.
 *
 * **The first market to claim a ticker keeps it.** Coins are handed in first,
 * so a stock sharing a coin's ticker never takes it off the coin: a coin has a
 * market to trade on Hyperliquid, and the stock venues list far more tickers
 * than they trade.
 *
 * A k-coin gets its plain ticker as well: Hyperliquid lists `kPEPE` because it
 * trades a thousand of them at a time, and nobody on X writes that. `$PEPE`
 * and `PEPE` both point at `kPEPE`, which is the market Trade would trade.
 */
export function buildCoinMatchList(
  markets: readonly MarketToMatch[]
): CoinMatchList {
  const tickers = new Map<string, MarketMatchEntry>()
  for (const market of markets) {
    const ticker = market.symbol.toUpperCase()
    if (!ticker || tickers.has(ticker)) continue
    const entry: MarketMatchEntry = {
      ticker: market.symbol,
      kind: market.kind,
      marketKey: market.key,
    }
    tickers.set(ticker, entry)
    const plain = /^k([A-Z0-9]{2,})$/.exec(market.symbol)
    // The alias never overwrites a real market of the same name.
    if (plain && !tickers.has(plain[1])) tickers.set(plain[1], entry)
  }

  const names = new Map<string, MarketMatchEntry>()
  let hasTwoWordNames = false
  for (const [name, ticker] of Object.entries(COIN_NAMES)) {
    const entry = tickers.get(ticker.toUpperCase())
    // A name for a market the app does not list is dropped, which is the rule
    // that makes "a market nobody lists can never be matched" true by
    // construction.
    if (!entry) continue
    // **A written name only ever names a coin.** See `matchName`.
    if (entry.kind !== "coin") continue
    names.set(name, entry)
    if (name.includes(" ")) hasTwoWordNames = true
  }

  return { tickers, names, hasTwoWordNames }
}

/** A web address, dropped before the words are read. */
const LINK = /https?:\/\/\S+|\bt\.co\/\S+/gi

/**
 * One word: an optional dollar sign, then letters and digits starting with a
 * letter. `16Z` in `AI16Z` is part of its word rather than a word of its own,
 * which is why digits are allowed after the first letter.
 */
const WORD = /(\$?)([A-Za-z][A-Za-z0-9]*)/g

/**
 * The markets a post names, in the order they first appear.
 *
 * One entry per market: a post saying "$SOL" and "solana" gives one SOL,
 * matched the way it was matched first. Which one that is only affects the note
 * kept for reading a bad match back later, never whether the market is there.
 */
export function coinsNamedIn(text: string, list: CoinMatchList): CoinMatch[] {
  const words = readWords(text.replace(LINK, " "))
  const found = new Map<string, CoinMatch>()

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    const match = matchWord(word, words[index + 1], list)
    if (!match) continue
    if (!found.has(match.coin)) found.set(match.coin, match)
    // A two-word name swallows the word after it, so "shiba inu" cannot also
    // be read as an attempt at "inu".
    if (match.text.includes(" ")) index += 1
  }

  return [...found.values()]
}

type Word = {
  /** As the post wrote it, without the dollar sign. */
  text: string
  /** True when a dollar sign was in front of it. */
  dollar: boolean
  /** True when it is one of somebody's @mentions. */
  mention: boolean
}

function readWords(text: string): Word[] {
  const words: Word[] = []
  WORD.lastIndex = 0
  let hit: RegExpExecArray | null
  while ((hit = WORD.exec(text)) !== null) {
    const before = text[hit.index - 1] ?? " "
    // "3sol" is a number and a word run together, not somebody naming SOL.
    if (/[A-Za-z0-9_]/.test(before)) continue
    words.push({
      text: hit[2],
      dollar: hit[1] === "$",
      // "@solana" is an account, and naming an account is not naming a coin.
      mention: before === "@",
    })
  }
  return words
}

/** The stored row's shape, from the market that matched and how. */
function matched(
  entry: MarketMatchEntry,
  how: CoinMatchHow,
  text: string
): CoinMatch {
  return {
    coin: entry.ticker,
    kind: entry.kind,
    marketKey: entry.marketKey,
    how,
    text,
  }
}

function matchWord(
  word: Word,
  next: Word | undefined,
  list: CoinMatchList
): CoinMatch | null {
  if (word.mention) return null

  // Rule one: a dollar ticker, whatever the case. It beats every other rule
  // and the stop list, because the dollar sign is the person saying they mean
  // the market.
  if (word.dollar) {
    const entry = list.tickers.get(word.text.toUpperCase())
    return entry ? matched(entry, "dollar-ticker", `$${word.text}`) : null
  }

  // Rule two: a bare ticker, only where the post wrote it in capitals.
  if (
    word.text === word.text.toUpperCase() &&
    word.text.length >= SHORTEST_BARE_TICKER
  ) {
    // A word on the stop list stops here rather than falling through to the
    // name rule, or the stop list would only be half a rule.
    if (NEVER_A_BARE_TICKER.has(word.text)) return null
    const entry = list.tickers.get(word.text)
    if (entry) return matched(entry, "ticker", word.text)
  }

  // Rule three: a written name, one word or two, whatever the case.
  return matchName(word, next, list)
}

/**
 * A written name, and the rule that it only ever names a coin.
 *
 * **A stock is never matched from a lower-case company name.** "apple",
 * "tesla" and "meta" are ordinary words in ordinary sentences, so a stock
 * needs `$TSLA` or an upper-case `TSLA` before Trade will say the post named
 * it. `buildCoinMatchList` keeps every non-coin out of the name dictionary, so
 * this rule holds by construction rather than by each name being left out one
 * at a time.
 */
function matchName(
  word: Word,
  next: Word | undefined,
  list: CoinMatchList
): CoinMatch | null {
  if (list.hasTwoWordNames && next && !next.dollar && !next.mention) {
    const phrase = `${word.text} ${next.text}`
    const entry = list.names.get(phrase.toLowerCase())
    if (entry && !heldBackAsAPersonsName(phrase)) {
      return matched(entry, "name", phrase)
    }
  }

  const entry = list.names.get(word.text.toLowerCase())
  if (!entry || heldBackAsAPersonsName(word.text)) return null
  return matched(entry, "name", word.text)
}

/** "Sol" is a person and "sol" is the coin. See `NAMES_THAT_ARE_ALSO_PEOPLE`. */
function heldBackAsAPersonsName(text: string): boolean {
  return (
    NAMES_THAT_ARE_ALSO_PEOPLE.has(text.toLowerCase()) &&
    text !== text.toLowerCase()
  )
}
