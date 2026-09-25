import type { TradingOverviewOrderKind } from "@/lib/trade/dashboard/overview"

const ORDER_KIND_LABELS: Record<TradingOverviewOrderKind, string> = {
  manual: "Manual",
  dca: "DCA ladder",
  grid: "Grid",
  signal: "Signal",
}

export function orderKindLabel(kind: TradingOverviewOrderKind): string {
  return ORDER_KIND_LABELS[kind]
}
