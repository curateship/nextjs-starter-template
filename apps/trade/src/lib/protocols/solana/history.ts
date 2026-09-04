/**
 * The Solana coins allowed to borrow Binance history, by mint address.
 *
 * **A ticker match is not a coin match, and on Solana that is not a nicety.**
 * Anyone can mint a coin and call it BTC. Jupiter's verified list alone
 * carried fifty tickers twice on 3 Sep 2026, TRUMP among them. A chart drawn
 * from the wrong coin is worse than no chart on a page where money is spent.
 *
 * So this is a pinned list of mint addresses rather than a naming rule, and
 * every entry passed four checks when it was built on 4 Sep 2026:
 *
 * 1. Jupiter has vouched for the coin (its verified list).
 * 2. Exactly ONE verified Solana coin carries that ticker, so nothing
 *    ambiguous can slip in. Six were refused on this alone: TRUMP, UNI,
 *    FIGHT, MEGA, SOON and BABY.
 * 3. Binance lists that ticker as a dollar-settled perpetual.
 * 4. The Solana coin holds at least $200,000 of liquidity, which separates
 *    the coin people mean from a dust wrapper wearing its name. That check
 *    removed 79 further matches, PORTAL at $4 and SUI at $8,487 among them.
 *
 * Even then the chart says whose history it is, every time. A borrowed chart
 * is never drawn as though it were this coin's own.
 *
 * **A coin Binance later delists loses its chart.** The borrowed source is
 * confirmed against Binance's own catalogue before anything is fetched, so a
 * delisted coin borrows nothing — and because it is pinned here, it records
 * nothing either. It draws no chart until its entry is removed. That is the
 * quiet cost of pinning, and it is the trade for never drawing the wrong
 * coin's history.
 *
 * **Adding one is deliberate.** Run the four checks again against Jupiter's
 * verified list and Binance's perpetuals, then paste the mint. A coin that is
 * not here is not broken: it draws whatever the app recorded while watching
 * it, or says it has no history yet.
 */
export const SOLANA_BINANCE_HISTORY: Readonly<Record<string, string>> = {
  // 2Z: $326,101 of liquidity
  "J6pQQ3FAcJQeWPPGppWRb4nM8jU3wLyYbRrLh7feMfvd": "2Z",
  // ACT: $722,279 of liquidity
  "GJAFwWjJ3vnTsrQVabjBVK2TYB1YtRCQXRDfDgUnpump": "ACT",
  // ALCH: $1,280,265 of liquidity
  "HNg5PYJmtqcmzXrv6S9zP1CDKk5BgDuyFBxbvNApump": "ALCH",
  // ARC: $15,486,024 of liquidity
  "61V8vBaqAGMpgDQi4JcAwo1dmBGHsyhzodcPqnEVpump": "ARC",
  // ARX: $372,824 of liquidity
  "ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs": "ARX",
  // AVA: $613,194 of liquidity
  "DKu9kykSfbN5LBfFXtNNDPaX35o4Fv6vJ9FKk7pZpump": "AVA",
  // BAN: $1,459,043 of liquidity
  "9PR7nCP9DpcUotnDPVLUBUZKu5WAYkwrCUx9wDnSpump": "BAN",
  // BIRB: $1,232,250 of liquidity
  "G7vQWurMkMMm2dU3iZpXYFTHT9Biio4F4gZCrwFpKNwG": "BIRB",
  // BOME: $15,671,938 of liquidity
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82": "BOME",
  // CHILLGUY: $688,545 of liquidity
  "Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump": "CHILLGUY",
  // DOOD: $293,017 of liquidity
  "DvjbEsdca43oQcw2h3HW1CT7N3x5vRcr3QrvTUHnXvgV": "DOOD",
  // ETH: $21,238,440 of liquidity
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  // FARTCOIN: $6,134,729 of liquidity
  "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump": "FARTCOIN",
  // FOGO: $241,268 of liquidity
  "FogoWVkKbu7K5TE23B7VvpuSNbjV2HKpBm8hNaVY6Rkg": "FOGO",
  // GOAT: $1,523,609 of liquidity
  "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump": "GOAT",
  // GRIFFAIN: $890,547 of liquidity
  "KENJSUYLASHUMfHyy5o4Hp2FdNqZg1AsUPhfH2kYvEP": "GRIFFAIN",
  // HUMA: $403,793 of liquidity
  "HUMA1821qVDKta3u2ovmfDQeW2fSQouSKE8fkF44wvGw": "HUMA",
  // HYPE: $7,322,439 of liquidity
  "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g": "HYPE",
  // JELLYJELLY: $2,562,292 of liquidity
  "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump": "JELLYJELLY",
  // JTO: $206,379 of liquidity
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": "JTO",
  // JUP: $4,028,567 of liquidity
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
  // KMNO: $1,924,430 of liquidity
  "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS": "KMNO",
  // MELANIA: $2,406,950 of liquidity
  "FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P": "MELANIA",
  // MET: $2,049,579 of liquidity
  "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL": "MET",
  // MEW: $8,905,475 of liquidity
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5": "MEW",
  // MOODENG: $1,342,032 of liquidity
  "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY": "MOODENG",
  // MORPHO: $324,097 of liquidity
  "Morpho2VPeTr2E1Jx6monxCzF7mqwUnjz74RdwLXYyP": "MORPHO",
  // ORCA: $209,302 of liquidity
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": "ORCA",
  // PAXG: $602,781 of liquidity
  "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW": "PAXG",
  // PENGU: $3,195,389 of liquidity
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": "PENGU",
  // PIPPIN: $2,059,972 of liquidity
  "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump": "PIPPIN",
  // PNUT: $3,300,714 of liquidity
  "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump": "PNUT",
  // POPCAT: $4,475,926 of liquidity
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
  // PUMP: $36,174,239 of liquidity
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn": "PUMP",
  // SKR: $1,073,184 of liquidity
  "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3": "SKR",
  // SOL: $809,232,685 of liquidity
  "So11111111111111111111111111111111111111112": "SOL",
  // SPX: $3,270,057 of liquidity
  "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr": "SPX",
  // SWARMS: $721,854 of liquidity
  "74SBV4zDXxTRgv1pEMoECskKBkZHc2yGPnc7GYVepump": "SWARMS",
  // TRX: $3,903,809 of liquidity
  "GbbesPbaYh5uiAZSYNXTc7w9jty1rpg3P9L4JeN4LkKc": "TRX",
  // USELESS: $3,385,039 of liquidity
  "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk": "USELESS",
  // VIRTUAL: $1,990,717 of liquidity
  "3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y": "VIRTUAL",
  // WET: $532,069 of liquidity
  "WETZjtprkDMCcUxPi9PfWnowMRZkiGGHDb9rABuRZ2U": "WET",
  // ZEC: $4,500,688 of liquidity
  "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS": "ZEC",
  // ZEREBRO: $1,635,037 of liquidity
  "8x5VqbHA8D7NkD52uNuS5nnt3PwA8pLD34ymskeSo2Wn": "ZEREBRO",
}

/** The Binance coin this mint may borrow history from, or null for most. */
export function solanaBorrowedCoin(mint: string): string | null {
  return SOLANA_BINANCE_HISTORY[mint] ?? null
}
