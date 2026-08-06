/**
 * One made-up market, so the middle panel's header can be drawn and judged
 * before anything real is connected.
 *
 * Every figure is already a display string rather than a number. That is the
 * point of a stand-in: there is no market to format, no exchange to say how
 * many decimals it quotes in, and no rounding rule to get right yet. Real
 * figures arrive with the real feed, formatted by whatever that feed's protocol
 * says — inventing that rule here would only mean writing it twice.
 *
 * Nothing on screen may be mistaken for a live price, so every one of these is
 * drawn through `SampleValue` and the panel carries a "Sample" badge in words.
 */
export type SampleMarket = {
  /** What the market is called on its exchange. */
  symbol: string
  /** The exchange it lives on, shown so account and market can never be confused. */
  protocol: string
  /** Mainnet, testnet — shown for the same reason. */
  network: string
  figures: SampleFigure[]
}

export type SampleFigure = {
  label: string
  value: string
  /** Colours a market move. Left off for figures that are neither. */
  direction?: "up" | "down"
}

export const SAMPLE_MARKET: SampleMarket = {
  symbol: "SOL",
  protocol: "Sample exchange",
  network: "Mainnet",
  figures: [
    { label: "Price", value: "$142.38" },
    { label: "24h", value: "+2.41%", direction: "up" },
    { label: "24h volume", value: "$1.24b" },
    { label: "Funding", value: "0.0041%" },
    { label: "Open interest", value: "$88.6m" },
  ],
}
