/**
 * The written-out names of coins, and the short spellings people type in lower
 * case, each pointing at the ticker Trade lists the coin under.
 *
 * **This file is a dictionary, not a list of coins Trade trades.** A name here
 * only ever matches when the ticker it points at is in the app's own market
 * list, so an entry for a coin nobody trades is harmless and an entry that is
 * wrong can never invent a market. `buildCoinMatchList` in `coin-matcher.ts`
 * does that filtering.
 *
 * **What is deliberately missing matters as much as what is here.** A lower-case
 * name that is also an ordinary English word is left out, because "check the
 * link", "atom", "the sandbox", "render it again" and "sushi for lunch" would
 * each file a post under a coin nobody was talking about. Those coins still
 * match from their upper-case ticker and from `$LINK`, which is how anybody
 * actually naming them writes it. Each omission is marked below so the next
 * person does not helpfully add it back.
 */

/**
 * Written name, or the lower-case short spelling, to the coin's ticker. Keys
 * are lower case; a two-word name is written with one space.
 */
export const COIN_NAMES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  ripple: "XRP",
  xrp: "XRP",
  dogecoin: "DOGE",
  doge: "DOGE",
  cardano: "ADA",
  ada: "ADA",
  bnb: "BNB",
  avalanche: "AVAX",
  avax: "AVAX",
  polygon: "POL",
  polkadot: "DOT",
  chainlink: "LINK",
  // "link" is left out: "click the link" is not a coin.
  litecoin: "LTC",
  ltc: "LTC",
  "bitcoin cash": "BCH",
  bch: "BCH",
  cosmos: "ATOM",
  // "atom" is left out: it is an ordinary word.
  "near protocol": "NEAR",
  // "near" is left out: it is an ordinary word.
  uniswap: "UNI",
  // "uni" is left out: it is what people call a university.
  aave: "AAVE",
  arbitrum: "ARB",
  // "arb" is left out: traders write it for arbitrage.
  optimism: "OP",
  sui: "SUI",
  aptos: "APT",
  // "apt" is left out: it is an ordinary word.
  injective: "INJ",
  inj: "INJ",
  celestia: "TIA",
  tia: "TIA",
  toncoin: "TON",
  // "ton" is left out: it is a weight.
  tron: "TRX",
  trx: "TRX",
  stellar: "XLM",
  xlm: "XLM",
  monero: "XMR",
  xmr: "XMR",
  zcash: "ZEC",
  zec: "ZEC",
  "ethereum classic": "ETC",
  // "etc" is left out: it means "and so on".
  pepe: "kPEPE",
  bonk: "kBONK",
  "shiba inu": "kSHIB",
  shib: "kSHIB",
  floki: "kFLOKI",
  dogwifhat: "WIF",
  wif: "WIF",
  popcat: "POPCAT",
  fartcoin: "FARTCOIN",
  hyperliquid: "HYPE",
  // "hype" is left out: it is an ordinary word.
  worldcoin: "WLD",
  wld: "WLD",
  // "render" is left out: it is a verb.
  filecoin: "FIL",
  fil: "FIL",
  maker: "MKR",
  mkr: "MKR",
  crv: "CRV",
  // "curve" is left out: every chart has one.
  lido: "LDO",
  ldo: "LDO",
  pyth: "PYTH",
  jupiter: "JUP",
  jup: "JUP",
  ondo: "ONDO",
  ethena: "ENA",
  ena: "ENA",
  eigenlayer: "EIGEN",
  jito: "JTO",
  jto: "JTO",
  kaspa: "KAS",
  kas: "KAS",
  algorand: "ALGO",
  algo: "ALGO",
  hedera: "HBAR",
  hbar: "HBAR",
  "internet computer": "ICP",
  icp: "ICP",
  immutable: "IMX",
  imx: "IMX",
  starknet: "STRK",
  strk: "STRK",
  stacks: "STX",
  stx: "STX",
  mantle: "MNT",
  mnt: "MNT",
  bittensor: "TAO",
  tao: "TAO",
  virtuals: "VIRTUAL",
  aixbt: "AIXBT",
  pengu: "PENGU",
  pancakeswap: "CAKE",
  dydx: "DYDX",
  gmx: "GMX",
  synthetix: "SNX",
  snx: "SNX",
  // "compound" and "sandbox" are left out for COMP and SAND: both are
  // ordinary words, and "compound interest" is a phrase this app's own free
  // tools use.
  "axie infinity": "AXS",
  axs: "AXS",
  zksync: "ZK",
  zora: "ZORA",
  linea: "LINEA",
  berachain: "BERA",
  bera: "BERA",
  monad: "MON",
  sophon: "SOPH",
  sonic: "S",
  wormhole: "W",
  resolv: "RESOLV",
  moodeng: "MOODENG",
  "paxos gold": "PAXG",
  paxg: "PAXG",
  ordinals: "ORDI",
  chillguy: "CHILLGUY",
  // "trump" and "melania" are left out: written that way they are people far
  // more often than coins, and anybody trading either writes $TRUMP.
}

/**
 * Names that are also somebody's first name, so they count only when written
 * in lower case.
 *
 * "adding more sol here" is the coin. "Sol said he'd sell" is a person, and the
 * capital letter is the only thing in the sentence that says so. The cost is
 * that a post opening with "Sol is cheap" is missed, which is the quiet answer
 * rather than the wrong one.
 */
export const NAMES_THAT_ARE_ALSO_PEOPLE = new Set([
  // Sol.
  "sol",
  // Ada.
  "ada",
  // Tia.
  "tia",
])
