
import type { AppOptions } from "@/lib/app-options"
import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import {
  TRADE_PALETTE_GROUP,
  tradeWalletNode,
} from "@/lib/automations/nodes/trade-wallet"

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
    ],
  },
  automations: {
    /**
     * The three steps a backtest is drawn from, in the order they chain:
     * the pot, the coins, the ladder. Reaching the ladder starts the run.
     */
    nodes: [tradeWalletNode, tradeMarketsNode, tradeDcaNode],
    paletteGroups: [TRADE_PALETTE_GROUP],
    /**
     * The backtest, on the canvas, under Run.
     *
     * A backtest's answer is a dozen figures and a list of warnings, which is
     * more than a shared run row should ever have to carry. This app draws its
     * own instead, beside the button that started it.
     *
     * A pointer, never the component: this file is read on the server, and the
     * panel reaches the database through `@/lib/api/*`.
     */
    canvasPanel: {
      label: "Previous result",
      // Only on a flow that actually runs one. Every other flow in this app
      // would otherwise carry a button offering a backtest it never ran.
      appliesTo: (kinds) => kinds.includes(tradeDcaNode.kind),
      panel: () => import("@/components/automations/backtest-canvas-panel"),
    },
  },
}
