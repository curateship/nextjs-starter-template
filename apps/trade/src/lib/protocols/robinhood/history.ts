/**
 * Robinhood Chain markets that borrow older history, pinned by contract
 * address and never by ticker: on 23 Sep 2026, 18 tokens called themselves
 * NVDA and Robinhood made one of them.
 *
 * Stock tokens, checked on 24 Sep 2026. Each one passed all three:
 * - Robinhood's StockFactory deployed it (`Deployed` events on
 *   0x4783c67b63de2b358ac5951a7d41f47a38f3c046);
 * - Dukascopy lists an instrument for its ticker;
 * - the factory's company name and Dukascopy's describe the same company
 *   (IBM, AMD, CRM, AMZN and UPS differ only in wording and were read by
 *   hand).
 * A stock token trades at its stock's price: NVDA $225.21 against the
 * stock's $225.03, TSLA $379.20 against $378.47, META $737.43 against
 * $735.94 on 24 Sep 2026. 72 of the factory's 204 tokens qualified; the
 * rest have no Dukascopy instrument and keep the pool's own bars.
 * `resolveHistorySource` confirms the instrument again at read time.
 */
export const ROBINHOOD_DUKASCOPY_HISTORY: Readonly<Record<string, string>> = {
  // Apple = Dukascopy aaplususd, "APPLE INC"
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": "AAPL",
  // Adobe = Dukascopy adbeususd, "ADOBE SYSTEMS INC"
  "0x232b8ed6377be97813853b0ac104c4cda8378d1b": "ADBE",
  // Applied Materials = Dukascopy amatususd, "APPLIED MATERIALS INC"
  "0x36046893810a7e7fce501229d57dc3fc8c8716d0": "AMAT",
  // AMD = Dukascopy amdususd, "ADVANCED MICRO DEVICES"
  "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc": "AMD",
  // Amazon = Dukascopy amznususd, "AMAZON.COM INC"
  "0x12f190a9f9d7d37a250758b26824b97ce941bf54": "AMZN",
  // Broadcom = Dukascopy avgoususd, "Broadcom Limited"
  "0x156e175dd063a8ce274c50654ef40e0032b3fbcf": "AVGO",
  // Boeing = Dukascopy baususd, "Boeing Co"
  "0x4d21483a44bf67a86b77e3da301411880797d452": "BA",
  // Alibaba = Dukascopy babaususd, "ALIBABA GROUP HOLDING-SP ADR"
  "0xad25ac6c84d497db898fa1e8387bf6af3532a1c4": "BABA",
  // Carnival Corporation = Dukascopy cclususd, "CARNIVAL CORP"
  "0x9651342cea770ae9a2969ba2a52611523146aef9": "CCL",
  // Costco = Dukascopy costususd, "COSTCO WHOLESALE CORP"
  "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2": "COST",
  // Salesforce = Dukascopy crmususd, "SALESFORCE.COM INC"
  "0xd95b44124e475743a7589e68f3d74008a5536d44": "CRM",
  // Cisco Systems = Dukascopy cscoususd, "CISCO SYSTEMS INC"
  "0xf543967eebb6f1917992ef0e68de63ab07a5a0da": "CSCO",
  // Cognizant = Dukascopy ctshususd, "COGNIZANT TECH SOLUTIONS-A"
  "0x63d5a3b6939a33f1e75d8bcd85759858239600db": "CTSH",
  // Carvana = Dukascopy cvnaususd, "CARVANA CO"
  "0xa4f319104089fe321dc8093c6e707d4fe190a988": "CVNA",
  // Dell = Dukascopy dellususd, "DELL TECHNOLOGIES -C"
  "0x941ae714ec6d8130c7b75d67160ca08f1e7d11dd": "DELL",
  // Ford Motor = Dukascopy fususd, "FORD MOTOR CO"
  "0x25c288e6d899b9bc30160965ad9644c67e73be0c": "F",
  // Fair Isaac = Dukascopy ficoususd, "FAIR ISAAC CORP"
  "0xa48f22a46c0f1c46ca7d111cb6c137c271987180": "FICO",
  // Fortinet = Dukascopy ftntususd, "FORTINET INC"
  "0x3fb8976980d486084b2eb4a404bd12e72823958f": "FTNT",
  // General Electric = Dukascopy geususd, "GENERAL ELECTRIC CO"
  "0x63b814ddbd6bf339f25fed8c36158a008d5b373e": "GE",
  // SPDR Gold Trust = Dukascopy gldususd, "SPDR Gold Shares ETF"
  "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e": "GLD",
  // Corning = Dukascopy glwususd, "CORNING INC"
  "0x7c04e6a3368f2a1de3874f0e80d2e0a1a9915da6": "GLW",
  // Alphabet Class A = Dukascopy googlususd, "ALPHABET INC-CL A"
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": "GOOGL",
  // Huntington Ingalls = Dukascopy hiiususd, "HUNTINGTON INGALLS INDUSTRIE"
  "0xeb61c0ed490a367d4e3631ccf8a74b3bfc7e775d": "HII",
  // HP Enterprise = Dukascopy hpeususd, "HEWLETT PACKARD ENTERPRISE"
  "0x59dd09d4900c2e4b5f75b7c0d4e6796fcc234cb1": "HPE",
  // Howmet Aerospace = Dukascopy hwmususd, "HOWMET AEROSPACE INC"
  "0xaea445c5f3db1a462998ccc422a875a361ee5d99": "HWM",
  // IBM = Dukascopy ibmususd, "INTL BUSINESS MACHINES CORP"
  "0x980dcf6766fa79f5cf0c4aadb3ab477ff15a9619": "IBM",
  // Intel = Dukascopy intcususd, "INTEL CORP"
  "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681": "INTC",
  // Intuit = Dukascopy intuususd, "INTUIT INC"
  "0x56d23bee5f41a7120170b0c603dae30128e460e9": "INTU",
  // Johnson & Johnson = Dukascopy jnjususd, "JOHNSON & JOHNSON"
  "0x03dfbbe0ac4e7bcdafd08ed41a400326b77d8c80": "JNJ",
  // Kohls Corporation = Dukascopy kssususd, "KOHLS CORP"
  "0x12e3c047bf9aecaf9ddc98c05c31bfd1dd043993": "KSS",
  // L3Harris = Dukascopy lhxususd, "L3HARRIS TECHNOLOGIES INC"
  "0x48d60243c66437c6ac3c2495be94747aed5dfe25": "LHX",
  // Eli Lilly = Dukascopy llyususd, "ELI LILLY & CO"
  "0x8005d266423c7ea827372c9c864491e5786600ea": "LLY",
  // Lockheed = Dukascopy lmtususd, "LOCKHEED MARTIN CORP"
  "0x329fcaceb9ad6f9580dd5f643fed0646900d043c": "LMT",
  // Lam Research Corp = Dukascopy lrcxususd, "LAM RESEARCH CORP"
  "0x57b0030166db0c31690d1a5aa167e2e26e2c29a4": "LRCX",
  // Lululemon = Dukascopy luluususd, "LULULEMON ATHLETICA INC"
  "0x4e62068525ab11fe768e29dfd00ef909b9803016": "LULU",
  // MongoDB = Dukascopy mdbususd, "MONGODB INC"
  "0xddf2266b79abf0b48898959b0ed6e6adf512be74": "MDB",
  // Meta Platforms = Dukascopy fbususd, "FACEBOOK INC-A / Meta"
  "0xc0d6457c16cc70d6790dd43521c899c87ce02f35": "META",
  // Monolithic Power Systems = Dukascopy mpwrususd, "MONOLITHIC POWER SYSTEMS INC"
  "0x52d50d0280ad1054b43f052bd70a49a212a1b128": "MPWR",
  // Moderna = Dukascopy mrnaususd, "Moderna Inc"
  "0x43b07d15ce533bec5476d70c22a78a1b2b662155": "MRNA",
  // Marvell Technology = Dukascopy mrvlususd, "MARVELL TECHNOLOGY INC"
  "0x62fd0668e10d8b72339be2dcf7643001688ff13b": "MRVL",
  // Microsoft = Dukascopy msftususd, "MICROSOFT CORP"
  "0xe93237c50d904957cf27e7b1133b510c669c2e74": "MSFT",
  // Micron Technology = Dukascopy muususd, "MICRON TECHNOLOGY INC"
  "0xff080c8ce2e5feadaca0da81314ae59d232d4afd": "MU",
  // Netflix = Dukascopy nflxususd, "NETFLIX INC"
  "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8": "NFLX",
  // ServiceNow = Dukascopy nowususd, "SERVICENOW INC"
  "0x0c3260af4b8f13a69c4c2dfb84fd667890cdfa14": "NOW",
  // NVIDIA = Dukascopy nvdaususd, "NVIDIA CORP"
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": "NVDA",
  // ON Semiconductor = Dukascopy onususd, "ON SEMICONDUCTOR"
  "0xbbd09f72b025360fee5c928053dca6248d35be54": "ON",
  // Oracle = Dukascopy orclususd, "ORACLE CORP"
  "0xb0992820e760d836549ba69bc7598b4af75dee03": "ORCL",
  // Palo Alto Networks = Dukascopy panwususd, "PALO ALTO NETWORKS INC"
  "0xb039597ed45cba7b6e2fb9e8be51802969cee5be": "PANW",
  // Pfizer = Dukascopy pfeususd, "PFIZER INC"
  "0x7066a64c24e4206cd62e83bf198c1e7eb361f51e": "PFE",
  // Palantir Technologies = Dukascopy pltrususd, "Palantir Technologies Inc. (Class A)"
  "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a": "PLTR",
  // Qualcomm = Dukascopy qcomususd, "QUALCOMM INC"
  "0x0f17206447090e464c277571124dd2688e48aea9": "QCOM",
  // Invesco QQQ = Dukascopy qqqususd, "PowerShares QQQ ETF"
  "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68": "QQQ",
  // iShares Silver Trust = Dukascopy slvususd, "iShares Silver Trust ETF"
  "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f": "SLV",
  // VanEck Semiconductor ETF = Dukascopy smhususd, "VanEck Semiconductors UCITS ETF"
  "0x072f979c2cac8e1391b0162a87fee094bf8744a0": "SMH",
  // Snap = Dukascopy snapususd, "SNAP Inc."
  "0xf6589f11bc40b669e584073f428b05562f568733": "SNAP",
  // Snowflake = Dukascopy snowususd, "Snowflake Inc. (Class A)"
  "0xba0cab75495255d0cb58e22b648bfed4ecd1f47e": "SNOW",
  // SPDR S&P 500 ETF Trust = Dukascopy spyususd, "SPDR S&P 500 ETF"
  "0x117cc2133c37b721f49de2a7a74833232b3b4c0c": "SPY",
  // Atlassian Corporation = Dukascopy teamususd, "ATLASSIAN CORP PLC-CLASS A"
  "0x5b97476b922f3305131b8f0b9d333172e87f4aae": "TEAM",
  // Tesla = Dukascopy tslaususd, "TESLA MOTORS INC"
  "0x322f0929c4625ed5bad873c95208d54e1c003b2d": "TSLA",
  // Taiwan Semiconductor Manufacturing = Dukascopy tsmususd, "Taiwan Semiconductor Manufacturing Company Limited"
  "0x58ffe4a942d3885baa22d7520691f611ef09e7aa": "TSM",
  // Trade Desk = Dukascopy ttdususd, "TRADE DESK INC/THE -CLASS A"
  "0x0b5fb4031cae9163db10b169ee72685f0edc8545": "TTD",
  // Take-Two Interactive Software = Dukascopy ttwoususd, "TAKE-TWO INTERACTIVE SOFTWRE"
  "0x5e81213613b6b86eab4c6c50d718d34359459786": "TTWO",
  // UnitedHealth = Dukascopy unhususd, "UNITEDHEALTH GROUP INC"
  "0xcf364ea52787e289de6f32077834056e3e70d6a8": "UNH",
  // UPS = Dukascopy upsususd, "UNITED PARCEL SERVICE-CL B"
  "0xf23250dac154d05bb671cb0d0ebef3c635c79ce2": "UPS",
  // United States Oil Fund = Dukascopy usoususd, "United States Oil"
  "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344": "USO",
  // Vistra = Dukascopy vstususd, "VISTRA CORP"
  "0x561e2a49212b7ccf47f2744ccb83e200722fadbc": "VST",
  // Workday = Dukascopy wdayususd, "WORKDAY INC-CLASS A"
  "0x82da4646242e1d962e96e932269dc644c94a9caa": "WDAY",
  // Western Digital = Dukascopy wdcususd, "WESTERN DIGITAL CORP"
  "0xf52597345a8edf418bc4071b4a35112472277d3e": "WDC",
  // State Street Technology Select Sector SPDR ETF = Dukascopy xlkususd, "Technology Select Sector SPDR Fund"
  "0x15cd20759ce7f3285c29a319de2d1a2e098c6f43": "XLK",
  // Exxon Mobil = Dukascopy xomususd, "EXXON MOBIL CORP"
  "0xf9b46d3d1b22199d4d1025a9cedb540a33f1a2d5": "XOM",
  // Zoom = Dukascopy zmususd, "Zoom Video Communications Inc. (Class A)"
  "0x44c4f142009036cf477ed2d09932051843137cf1": "ZM",
  // Zscaler = Dukascopy zsususd, "ZSCALER INC"
  "0x7dc013eb55e436f30d7ed1afe4e36d6e45e3c3f7": "ZS",
}

/**
 * Coins that borrow Binance. Only the chain's own wrapped ETH qualifies: it
 * is Arbitrum's standard `aeWETH` with 560,856 holders, Binance lists ETH,
 * and its USDG pool held $19m on 23 Sep 2026. At least seven other tokens
 * call themselves WETH and borrow nothing. The other pool coins are not on
 * any list that vouches for them, which Binance history would need.
 */
const ROBINHOOD_BINANCE_HISTORY: Readonly<Record<string, string>> = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "ETH",
}

/** The stock ticker a Robinhood stock token borrows Dukascopy history under. */
export function robinhoodBorrowedStock(address: string): string | null {
  return ROBINHOOD_DUKASCOPY_HISTORY[address.toLowerCase()] ?? null
}

/** The Binance coin a Robinhood Chain coin borrows history from. */
export function robinhoodBorrowedCoin(address: string): string | null {
  return ROBINHOOD_BINANCE_HISTORY[address.toLowerCase()] ?? null
}
