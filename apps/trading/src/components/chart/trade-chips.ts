/**
 * Trade-chip palette — the color IS the meaning: green = long, red = short,
 * yellow = flip. Shared by the on-chart chips (backtest + bot) and the chart
 * legend so the two can never drift apart. The letter (O open / C close /
 * F flip) says what happened; the color says which side.
 */
export const CHIP_COLORS = {
  long: "#089981",
  short: "#f23645",
  flip: "#f5b301",
  /** Dark letter keeps the flip "F" legible on the yellow chip. */
  flipText: "#1a1a1a",
} as const
