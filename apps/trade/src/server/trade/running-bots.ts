import { and, desc, eq, inArray } from "drizzle-orm"

import type { ProtocolId } from "@/lib/protocols/contracts"
import type { RunningBot } from "@/lib/trade/running-bots"
import { db, type CustomShellDb } from "@/server/db"
import { listFlowRuns } from "@/server/trade/flow-run-report"
import { tradeFlowRuns } from "@/server/trade/schema"

/**
 * The switched-on bots for one exchange dashboard.
 *
 * The dashboard reads the same stored run figures as the run list. Nothing
 * asks an exchange, so opening this tab cannot spend a venue's request limit.
 */
export async function listRunningBots(
  userId: string,
  protocol: ProtocolId,
  database: CustomShellDb = db
): Promise<RunningBot[]> {
  const running = (
    await database
      .select({
        runId: tradeFlowRuns.id,
        automationId: tradeFlowRuns.automationId,
        spec: tradeFlowRuns.spec,
        startedAt: tradeFlowRuns.startedAt,
      })
      .from(tradeFlowRuns)
      .where(
        and(
          eq(tradeFlowRuns.userId, userId),
          inArray(tradeFlowRuns.status, ["running", "stopping"])
        )
      )
      .orderBy(desc(tradeFlowRuns.startedAt))
  ).filter((run) => run.spec.protocol === protocol)

  if (running.length === 0) return []

  const ids = new Set(running.map((run) => run.runId))
  const specs = new Map(running.map((run) => [run.runId, run.spec]))
  return (await listFlowRuns(userId, Date.now(), [...ids]))
    .filter((run) => ids.has(run.id))
    .map((run) => {
      const spec = specs.get(run.id)!
      return {
        runId: run.id,
        automationId: run.automationId,
        name: run.automationName,
        strategy:
          spec.strategy.kind === "dca"
            ? "DCA ladder"
            : spec.strategy.kind === "emaGrid"
              ? "Grid"
              : "Signals",
        marketCount: run.coins,
        workingCount: run.working,
        holdingCount: run.holdingCoins,
        netUsd: run.netUsd,
        tradesClosed: run.tradesClosed,
        walletLabel: run.walletLabel,
        real: run.real,
        startedAt: run.startedAt,
        paused: run.paused,
        stopping: run.status === "stopping",
      }
    })
}
