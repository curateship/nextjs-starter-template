import type { AppServerOptions } from "@/server/app-options"
import { backtestTick } from "@/server/trade/backtest/worker"
import { monitorTradingEngine } from "@/server/trade/engine-health"
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
        name: "trading-engine-health",
        /**
         * The engine cannot report its own death. The shell's separate worker
         * watches its database heartbeat and uses the existing notification
         * tray for one outage message and one all clear.
         */
        tick: () => monitorTradingEngine(),
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
