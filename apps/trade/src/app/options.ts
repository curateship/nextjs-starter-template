
import type { AppOptions } from "@/lib/app-options"
import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import { tradeSignalsNode } from "@/lib/automations/nodes/trade-signals"
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
      {
        id: "trading-widgets",
        label: "Widgets",
        panel: () => import("@/components/trade/dashboard-widget-settings"),
      },
    ],
  },
  automations: {
    /**
     * The steps a trading flow is drawn from, in the order they chain: the
     * pot, the coins, then a strategy. Reaching the strategy starts the run.
     *
     * **Two strategies are offered and a flow holds one of them.** The ladder
     * waits for price to fall into a plan; Signals waits for an indicator to
     * call it. A flow holding both is refused in words when it is switched on
     * — see `flowNodesOf` and `backtestSpecFromFlow` — rather than left to
     * discover itself with money on the line.
     */
    nodes: [tradeWalletNode, tradeMarketsNode, tradeDcaNode, tradeSignalsNode],
    paletteGroups: [TRADE_PALETTE_GROUP],
    /**
     * A trading flow has no member to test against.
     *
     * "Test with member…" runs the flow for one chosen person, which is the
     * right way to try a welcome sequence and means nothing here: a backtest
     * walks a strategy over months of price history and there is nobody in it.
     * So it is hidden on any flow holding one of this app's own steps, and left
     * alone on every other flow, which still works the way the shell intends.
     */
    memberTest: {
      appliesTo: (kinds) =>
        ![
          tradeWalletNode.kind,
          tradeMarketsNode.kind,
          tradeDcaNode.kind,
          tradeSignalsNode.kind,
        ].some((kind) => kinds.includes(kind)),
    },
    canvasPanel: {
      // The panel is the backtest: its last result, and the button that runs
      // the next one. It was called "This flow" while it also carried what a
      // flow trades and why Run would not test it — that moved to the header
      // chip, so the honest name is the plain one.
      label: "Backtest",
      // Only on a flow that actually runs one. Every other flow in this app
      // would otherwise carry a button offering a backtest it never ran. Both
      // strategies back-test, so both bring the panel.
      appliesTo: (kinds) =>
        kinds.includes(tradeDcaNode.kind) || kinds.includes(tradeSignalsNode.kind),
      panel: () => import("@/components/automations/backtest-canvas-panel"),
    },
    /**
     * Everything this app puts in the canvas header, in one component.
     *
     * What the flow is right now, and the buttons that act on it: Switch on
     * out on the strip, and Try again, Pause and Stop inside the chip. Running
     * a backtest is not here — it lives in the Backtest panel beside its last
     * result, which is the same act.
     */
    canvasHeaderStatus: {
      appliesTo: (kinds) => kinds.includes(tradeWalletNode.kind),
      status: () => import("@/components/automations/flow-status-header"),
    },
    /**
     * Run is not an honest word for anything this app's flows do.
     *
     * A flow here is a backtest, or real money being switched on, or already
     * trading and having nothing to press. The chip and the Backtest panel
     * draw all three between them; the shell's own button would be a fourth
     * thing beside them meaning something else again.
     */
    runButton: "hidden",
  },
}
