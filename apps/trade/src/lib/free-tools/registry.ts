/**
 * Every free public tool, shipped or not, in the order the tools page lists
 * them.
 *
 * The one list the `/tools` page reads, and later the share button (task 30).
 * A tool reaches visitors only once `shipped` is true: until then it is
 * missing from the page, and `registry.test.ts` refuses a page declaration at
 * its address, which is what keeps it out of the sitemap too.
 *
 * Addresses for the four alert tools are placeholders. Their tasks do not name
 * a page yet, so whoever builds one sets the real address when it ships.
 */

export const FREE_TOOL_GROUPS = [
  { id: "calculators", label: "Calculators" },
  { id: "market", label: "Live market pages" },
  { id: "wallets", label: "Wallet tools" },
  { id: "alerts", label: "Alerts" },
] as const

export type FreeToolGroupId = (typeof FREE_TOOL_GROUPS)[number]["id"]

export type FreeTool = {
  /** Stable key for the list and for the share button. Never reused. */
  id: string
  name: string
  /** One line on what the tool answers, shown under its name. */
  summary: string
  group: FreeToolGroupId
  /** The tool's own public address, matching its `*.page.ts` declaration. */
  path: string
  /** False until the tool's page is built and switched on for visitors. */
  shipped: boolean
}

export const FREE_TOOLS: readonly FreeTool[] = [
  {
    id: "leverage",
    name: "Leverage calculator",
    summary:
      "The price where the exchange closes your trade, and what you make at your target after fees.",
    group: "calculators",
    path: "/tools/leverage",
    shipped: false,
  },
  {
    id: "position-size",
    name: "Position size calculator",
    summary:
      "How much of a coin to buy so hitting your stop loses only what you chose.",
    group: "calculators",
    path: "/tools/position-size",
    shipped: false,
  },
  {
    id: "compound-growth",
    name: "Compound growth calculator",
    summary:
      "What a steady gain each day, week or month grows your money to, and what it takes to reach a goal.",
    group: "calculators",
    path: "/tools/compound-growth",
    shipped: true,
  },
  {
    id: "convert",
    name: "Price converter",
    summary: "Coins into dollars and dollars into coins at the live price.",
    group: "calculators",
    path: "/tools/convert",
    shipped: true,
  },
  {
    id: "fee-comparison",
    name: "Fee comparison",
    summary: "What your trading costs in fees on each exchange, side by side.",
    group: "calculators",
    path: "/tools/fee-comparison",
    shipped: true,
  },
  {
    id: "funding-fee",
    name: "Funding fee calculator",
    summary: "What holding a trade open for days pays or earns in funding.",
    group: "calculators",
    path: "/tools/funding-fee",
    shipped: false,
  },
  {
    id: "grid-bot",
    name: "Grid bot calculator",
    summary:
      "Each line's price, the order size and the profit every time the price crosses two lines.",
    group: "calculators",
    path: "/tools/grid-bot",
    shipped: false,
  },
  {
    id: "what-if",
    name: "What if I had bought",
    summary:
      "What money put into a coin or stock on a past date is worth today.",
    group: "calculators",
    path: "/tools/what-if",
    shipped: false,
  },
  {
    id: "compare",
    name: "Coin vs coin",
    summary: "What $1,000 in each of two to four coins became since a date.",
    group: "calculators",
    path: "/tools/compare",
    shipped: false,
  },
  {
    id: "correlation",
    name: "Correlation checker",
    summary: "How often two coins rose and fell on the same day lately.",
    group: "calculators",
    path: "/tools/correlation",
    shipped: false,
  },
  {
    id: "exchange-status",
    name: "Exchange status",
    summary:
      "Whether each exchange is answering right now, and its outages this month.",
    group: "market",
    path: "/status",
    shipped: false,
  },
  {
    id: "new-listings",
    name: "New listings",
    summary:
      "Coins that just appeared on each exchange, and how they moved since.",
    group: "market",
    path: "/tools/new-listings",
    shipped: false,
  },
  {
    id: "moving-now",
    name: "Moving now",
    summary: "The coins rising and falling fastest across every exchange.",
    group: "market",
    path: "/tools/moving-now",
    shipped: false,
  },
  {
    id: "funding",
    name: "Funding rate board",
    summary:
      "What each coin's funding costs a day on $1,000, on every exchange.",
    group: "market",
    path: "/tools/funding",
    shipped: false,
  },
  {
    id: "open-interest",
    name: "Open interest board",
    summary:
      "How much money sits in open trades on each coin, and how that changed today.",
    group: "market",
    path: "/tools/open-interest",
    shipped: false,
  },
  {
    id: "volatility",
    name: "Volatility ranking",
    summary: "How much each coin moves on a normal day, wildest first.",
    group: "market",
    path: "/tools/volatility",
    shipped: false,
  },
  {
    id: "stock-tokens",
    name: "Stock token price gap",
    summary:
      "Which Robinhood Chain stock tokens cost more or less than the real share.",
    group: "market",
    path: "/tools/stock-tokens",
    shipped: false,
  },
  {
    id: "patterns",
    name: "Pattern scanner",
    summary:
      "Coins that just formed a known candle pattern or broke out of their range.",
    group: "market",
    path: "/tools/patterns",
    shipped: false,
  },
  {
    id: "liquidations",
    name: "Big liquidations",
    summary: "The largest trades exchanges are force-closing right now.",
    group: "market",
    path: "/tools/liquidations",
    shipped: false,
  },
  {
    id: "whales",
    name: "Whale trades",
    summary: "The largest single trades on Hyperliquid, as they happen.",
    group: "market",
    path: "/tools/whales",
    shipped: false,
  },
  {
    id: "wallet-checker",
    name: "Wallet checker",
    summary: "What any Hyperliquid wallet really made and lost.",
    group: "wallets",
    path: "/tools/wallet-checker",
    shipped: false,
  },
  {
    id: "watch-wallet",
    name: "Watch any wallet",
    summary: "A message every time a Hyperliquid wallet you pick trades.",
    group: "wallets",
    path: "/tools/watch-wallet",
    shipped: false,
  },
  {
    id: "top-wallets",
    name: "Top Hyperliquid wallets",
    summary: "Hyperliquid's biggest earners this month.",
    group: "wallets",
    path: "/tools/top-wallets",
    shipped: false,
  },
  {
    id: "price-alert",
    name: "Email price alert",
    summary: "One email when a coin reaches your price. No account needed.",
    group: "alerts",
    path: "/tools/price-alert",
    shipped: false,
  },
  {
    id: "telegram-alerts",
    name: "Telegram price alerts",
    summary: "The same price alert, as a Telegram message.",
    group: "alerts",
    path: "/tools/telegram-alerts",
    shipped: false,
  },
  {
    id: "new-listing-alerts",
    name: "New-listing alerts",
    summary: "A message when a coin first appears on an exchange you choose.",
    group: "alerts",
    path: "/tools/new-listing-alerts",
    shipped: false,
  },
  {
    id: "daily-recap",
    name: "Daily market recap",
    summary:
      "A morning email with yesterday's biggest movers, new listings and outages.",
    group: "alerts",
    path: "/tools/daily-recap",
    shipped: false,
  },
]

/** The tools a visitor may see. Everything else is left out, not greyed. */
export function shippedFreeTools(
  tools: readonly FreeTool[] = FREE_TOOLS
): FreeTool[] {
  return tools.filter((tool) => tool.shipped)
}

/** Tools whose name holds the typed text, ignoring case and outer spaces. */
export function filterFreeToolsByName(
  tools: readonly FreeTool[],
  query: string
): readonly FreeTool[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tools
  return tools.filter((tool) => tool.name.toLowerCase().includes(needle))
}

/** The groups in page order, each holding its tools, with empty groups left out. */
export function groupFreeTools(tools: readonly FreeTool[]) {
  return FREE_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: tools.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length > 0)
}
