import {
  COIN_NAMES,
  NAMES_THAT_ARE_ALSO_PEOPLE,
} from "@/lib/trade/social/coin-names"

/**
 * Which coins a post names, worked out from the words.
 *
 * Three rules and no others: `$SOL` whatever the case, a bare `SOL` only when
 * the post wrote it in capitals, and a written name such as `solana` whatever
 * the case. No fuzzy matching, no edit distance, no guessing at a misspelling.
 * A post naming no coin is a post naming no coin, which is an answer.
 *
 * **Only coins Trade has a market for can be matched.** The list comes from the
 * app's own market list, so "the coin you matched has no market here" can never
 * happen, and a coin listed tomorrow is not in posts stored today until the
 * pass in `src/server/trade/social-post-coins.ts` runs over them again.
 *
 * **It costs nothing to run.** No model, no request, one pass over the words,
 * so it can run over every post held.
 */

/** How a coin turned up in a post. */
export type CoinMatchHow = "dollar-ticker" | "ticker" | "name"

export type CoinMatch = {
  /** The ticker as Trade lists it: "SOL", "kPEPE". */
  coin: string
  how: CoinMatchHow
  /** The exact words that matched, kept so a bad match can be read back. */
  text: string
}

export type CoinMatchList = {
  /** Upper-case ticker to the coin, including the alias for a k-coin. */
  tickers: Map<string, string>
  /** Lower-case written name to the coin. */
  names: Map<string, string>
  /** True when any name in the list is two words. */
  hasTwoWordNames: boolean
}

/**
 * The shortest a bare ticker may be.
 *
 * Hyperliquid lists `S` and `W`, and a post is full of stray capitals. "S" and
 * "W" on their own are never somebody naming a coin, so the bare-ticker rule
 * starts at two letters. `$S` still matches, because the dollar sign is the
 * person saying they meant the coin.
 */
export const SHORTEST_BARE_TICKER = 2

/**
 * Upper-case words that are never a coin, checked before the bare-ticker rule.
 *
 * Each of these is a real ticker somewhere and an ordinary word in a post, and
 * a post shouting one of them would otherwise be filed under a coin nobody
 * mentioned. A word here still matches with a dollar sign in front of it,
 * because `$ME` is a person naming the coin on purpose.
 *
 * The reason is written beside every word. A list with no reasons is a list the
 * next person deletes.
 */
export const NEVER_A_BARE_TICKER = new Map<string, string>([
  ["AI", "the technology, in nearly every post that says it"],
  ["ALL", "an ordinary word, and shouted: ALL IN"],
  ["ANY", "an ordinary word"],
  ["AR", "augmented reality"],
  ["CC", "carbon copy"],
  ["FOR", "an ordinary word"],
  ["GAS", "what a transaction costs, on every chain"],
  ["ID", "identification, and an ID check"],
  ["IO", "the end of a web address"],
  ["IP", "intellectual property, and a network address"],
  ["ME", "an ordinary word, and shouted"],
  ["MET", "an ordinary word: we MET yesterday"],
  ["NOT", "an ordinary word"],
  ["OM", "an abbreviation and a chant, not the coin, in prose"],
  ["OP", "the original poster, in every reply on X"],
  ["PUMP", "what traders shout at a rising price"],
  ["SUN", "an ordinary word"],
  ["TST", "reads as a test marker"],
  ["WIN", "an ordinary word, and shouted"],
])

/**
 * Build the match list from the tickers the app has markets for.
 *
 * A k-coin gets its plain ticker as well: Hyperliquid lists `kPEPE` because it
 * trades a thousand of them at a time, and nobody on X writes that. `$PEPE`
 * and `PEPE` both point at `kPEPE`, which is the market Trade would trade.
 */
export function buildCoinMatchList(symbols: readonly string[]): CoinMatchList {
  const tickers = new Map<string, string>()
  for (const symbol of symbols) {
    tickers.set(symbol.toUpperCase(), symbol)
    const plain = /^k([A-Z0-9]{2,})$/.exec(symbol)
    // The alias never overwrites a real market of the same name.
    if (plain && !tickers.has(plain[1])) tickers.set(plain[1], symbol)
  }

  const names = new Map<string, string>()
  let hasTwoWordNames = false
  for (const [name, ticker] of Object.entries(COIN_NAMES)) {
    const coin = tickers.get(ticker.toUpperCase())
    // A name for a coin with no market here is dropped, which is the rule that
    // makes "a coin nobody trades can never be matched" true by construction.
    if (!coin) continue
    names.set(name, coin)
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
 * The coins a post names, in the order they first appear.
 *
 * One entry per coin: a post saying "$SOL" and "solana" gives one SOL, matched
 * the way it was matched first. Which one that is only affects the note kept
 * for reading a bad match back later, never whether the coin is there.
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

function matchWord(
  word: Word,
  next: Word | undefined,
  list: CoinMatchList
): CoinMatch | null {
  if (word.mention) return null

  // Rule one: a dollar ticker, whatever the case. It beats every other rule
  // and the stop list, because the dollar sign is the person saying they mean
  // the coin.
  if (word.dollar) {
    const coin = list.tickers.get(word.text.toUpperCase())
    return coin ? { coin, how: "dollar-ticker", text: `$${word.text}` } : null
  }

  // Rule two: a bare ticker, only where the post wrote it in capitals.
  if (
    word.text === word.text.toUpperCase() &&
    word.text.length >= SHORTEST_BARE_TICKER
  ) {
    // A word on the stop list stops here rather than falling through to the
    // name rule, or the stop list would only be half a rule.
    if (NEVER_A_BARE_TICKER.has(word.text)) return null
    const coin = list.tickers.get(word.text)
    if (coin) return { coin, how: "ticker", text: word.text }
  }

  // Rule three: a written name, one word or two, whatever the case.
  return matchName(word, next, list)
}

function matchName(
  word: Word,
  next: Word | undefined,
  list: CoinMatchList
): CoinMatch | null {
  if (list.hasTwoWordNames && next && !next.dollar && !next.mention) {
    const phrase = `${word.text} ${next.text}`
    const coin = list.names.get(phrase.toLowerCase())
    if (coin && !heldBackAsAPersonsName(phrase)) {
      return { coin, how: "name", text: phrase }
    }
  }

  const coin = list.names.get(word.text.toLowerCase())
  if (!coin || heldBackAsAPersonsName(word.text)) return null
  return { coin, how: "name", text: word.text }
}

/** "Sol" is a person and "sol" is the coin. See `NAMES_THAT_ARE_ALSO_PEOPLE`. */
function heldBackAsAPersonsName(text: string): boolean {
  return (
    NAMES_THAT_ARE_ALSO_PEOPLE.has(text.toLowerCase()) &&
    text !== text.toLowerCase()
  )
}
