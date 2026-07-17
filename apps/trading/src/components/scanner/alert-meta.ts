export const ALERT_TYPE_LABELS: Record<string, string> = {
  whale_trade: "Whale trade",
  repeat_trades: "Repeat buyer",
  coordinated_trades: "Coordinated",
  position_opened: "Opened",
  position_increased: "Position up",
  position_reduced: "Position down",
  position_flipped: "Flipped",
  position_closed: "Closed",
  position_reopened: "Back active",
  crowd_signal: "Crowded",
  crowd_exit: "Smart exit",
  smart_flow_divergence: "Flow vs price",
  wall_appeared: "Wall",
  wall_pulled: "Wall pulled",
  book_imbalance: "Imbalance",
  thin_book: "Thin book",
  worker_down: "Worker down",
  worker_recovered: "Worker back",
}

export function isWorkerAlert(type: string) {
  return type === "worker_down" || type === "worker_recovered"
}

export type ScannerRoute =
  | "/scanner/whale-trades"
  | "/scanner/positions"
  | "/scanner/crowded"
  | "/scanner/book"

/** The scanner page a given alert type came from, for click-through. */
export function alertRoute(type: string): ScannerRoute {
  if (type.startsWith("position_")) return "/scanner/positions"
  if (type.startsWith("crowd") || type === "smart_flow_divergence") {
    return "/scanner/crowded"
  }
  if (type.startsWith("wall") || type === "book_imbalance" || type === "thin_book") {
    return "/scanner/book"
  }
  return "/scanner/whale-trades"
}

/**
 * Click-through target for any scanner_alerts row. Watchdog alerts go to
 * Settings → Workers; everything else goes to its scanner page.
 */
export function alertTarget(type: string) {
  if (isWorkerAlert(type)) {
    return {
      to: "/admin/settings/$tab",
      params: { tab: "workers" },
    } as const
  }
  return { to: alertRoute(type) } as const
}
