type ChartEngine = typeof import("lightweight-charts")

let chartEngine: Promise<ChartEngine> | null = null

export function loadChartEngine(): Promise<ChartEngine> {
  chartEngine ??= import("lightweight-charts").catch((error: unknown) => {
    chartEngine = null
    throw error
  })
  return chartEngine
}

/** Starts the chart download as soon as the trading route's code arrives. */
export function prefetchChartEngine(): void {
  void loadChartEngine().catch(() => {
    // The chart itself owns the visible error and retry when it mounts.
  })
}
