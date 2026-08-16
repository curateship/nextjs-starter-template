import type { AutomationNodeSettings } from "@/lib/automations/node-descriptor"
import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import { tradeSignalsNode } from "@/lib/automations/nodes/trade-signals"
import { tradeWalletNode } from "@/lib/automations/nodes/trade-wallet"
import type { AppServerOptions } from "@/server/app-options"
import { backtestTick } from "@/server/trade/backtest/worker"
import { runTradeFlow } from "@/server/trade/flow-start"
import {
  ensureLadderLoop,
  LADDER_WORKER_NAME,
} from "@/server/trade/ladder-worker"

/**
 * What this app changes about the shell, on the server side.
 *
 * The companion to `options.ts`. That file is seen by the browser, so it holds
 * the drawing and the wording; this one never is, so it holds the work — the
 * parts that reach the database or call something outside.
 *
 * Open `src/server/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */
export const appServerOptions: AppServerOptions = {
  automations: {
    executors: {
      /**
       * The wallet and the coins carry on. Neither does anything by itself —
       * everything they hold is read off the saved flow when the ladder step
       * starts the run — so all they do here is say what they are set to, which
       * is what the run history is for.
       */
      [tradeWalletNode.kind]: async ({ settings }) => ({
        type: "next",
        summary: tradeWalletNode.description(settings as AutomationNodeSettings),
      }),
      [tradeMarketsNode.kind]: async ({ settings }) => ({
        type: "next",
        summary: tradeMarketsNode.description(
          settings as AutomationNodeSettings
        ),
      }),

      /**
       * The ladder step is the end of the flow, and where it actually does
       * something — one of two things.
       *
       * It hands over only which run this is; the starter re-reads the saved
       * flow and works the rest out from all three steps. No wallet named and
       * that is a backtest, exactly as before. A wallet named and there is
       * nothing to test, so the flow is switched on to trade instead. Either
       * way a flow that cannot do it completes with the plain sentence saying
       * why, rather than failing as broken.
       */
      [tradeDcaNode.kind]: async ({ run, now }) => {
        const outcome = await runTradeFlow(run, now().getTime())
        return { type: "complete", summary: outcome.summary }
      },

      /**
       * The other strategy, and the identical hand-over.
       *
       * `runTradeFlow` re-reads the saved flow and works out which strategy it
       * holds from the steps themselves, so this does not need to say. Written
       * as its own entry rather than sharing one, because the executor table is
       * keyed by kind and a kind with no entry fails the run as broken.
       */
      [tradeSignalsNode.kind]: async ({ run, now }) => {
        const outcome = await runTradeFlow(run, now().getTime())
        return { type: "complete", summary: outcome.summary }
      },
    },
  },
  background: {
    workers: [
      {
        name: "trade-backtests",
        /**
         * One pass claims one run and does a bounded piece of it — a few coins'
         * candles, or the whole walk once they are all in. Riding the shell's
         * one ticker rather than a timer of its own means there is one place to
         * look when something is ticking.
         */
        tick: () => backtestTick(),
      },
      {
        name: LADDER_WORKER_NAME,
        /**
         * Starts the trading engine's own loop, and nothing else.
         *
         * Trading does NOT ride this ticker. It runs on its own timer at four
         * seconds, because fifteen is a price paid in a fall — a rung's level
         * can come and go inside one of them. All this does is start that
         * timer once; every tick after the first returns immediately.
         */
        tick: async () => ensureLadderLoop(),
      },
    ],
  },
}
