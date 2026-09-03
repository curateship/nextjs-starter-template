import { CandlestickChartIcon } from "lucide-react"

import type { AppOptions } from "@/lib/app-options"

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 */
export const appOptions: AppOptions = {
  header: {
    rightAction: {
      id: "active-trades",
      label: "Active trades",
      icon: CandlestickChartIcon,
      roles: ["admin"],
      component: () => import("@/components/trade/active-trades-header"),
    },
  },
  settings: {
    /**
     * The trading engine runs as its own program on the server, so "is it
     * running, and pause it" is a real question with a real answer — and
     * Settings is where somebody goes to change how the app behaves.
     */
    tabs: [
      {
        id: "trading-engine",
        label: "Trading engine",
        // A pointer, never the component: this file is read on the server, and
        // the panel reads the engine's state through `@/lib/api/*`.
        panel: () => import("@/components/workers/workers-settings"),
      },
      {
        id: "trading-widgets",
        label: "Widgets",
        panel: () => import("@/components/trade/dashboard-widget-settings"),
      },
      {
        id: "markets",
        label: "Markets",
        panel: () => import("@/components/trade/market-settings"),
      },
      {
        // The tab holds the two sound switches and the master switch for
        // alerts on drawn lines. A switch nobody can find is a switch that
        // is not there, so the label names both.
        id: "sounds",
        label: "Sounds and alerts",
        panel: () => import("@/components/trade/trade-sound-settings"),
      },
    ],
  },
  notifications: {
    /**
     * Where a trade notice goes when it is clicked.
     *
     * Every notice this app sends is written as an announcement, because that
     * is the shell's one way to put a sentence in somebody's inbox — so to the
     * shell they all look like a title with nowhere to go. The page each one
     * came off is remembered in `trade_notice_links` when the notice is
     * written, and this is where the bell asks for it.
     *
     * Only announcements are asked about. The shell's own notices — a reply on
     * a piece of feedback, a published update, a run waiting for approval —
     * already know where they lead, and asking about them would be a database
     * trip that can only ever come back empty.
     */
    linksFor: async (notices) =>
      (await import("@/lib/api/trade/notice-links")).loadTradeNoticeLinks(
        notices
          .filter((one) => one.type === "announcement")
          .map((one) => one.id)
      ),
  },
}
