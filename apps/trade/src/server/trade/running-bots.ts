import { and, desc, eq, inArray } from "drizzle-orm"

import type { ProtocolId } from "@/lib/protocols/contracts"
import type { RunningBot } from "@/lib/trade/running-bots"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAutomations } from "@/server/schema"
import { tradeFlowRuns } from "@/server/trade/schema"

/**
 * The switched-on bots for one exchange dashboard.
 *
 * The dashboard only needs the saved name, strategy and number of markets.
 * Reading fills, wallets or an exchange to draw these rows would make opening
 * a small tab cost the same as opening the full results dashboard.
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
          eq(tradeFlowRuns.status, "running")
        )
      )
      .orderBy(desc(tradeFlowRuns.startedAt))
  ).filter((run) => run.spec.protocol === protocol)

  if (running.length === 0) return []

  const names = await database
    .select({
      id: customShellAutomations.id,
      name: customShellAutomations.name,
    })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.userId, userId),
        inArray(
          customShellAutomations.id,
          running.map((run) => run.automationId)
        )
      )
    )
  const nameOf = new Map(
    names.map((automation) => [automation.id, automation.name])
  )

  return running.map((run) => ({
    runId: run.runId,
    name: nameOf.get(run.automationId) ?? "This flow has been deleted",
    strategy: run.spec.strategy.kind === "dca" ? "DCA ladder" : "Signals",
    marketCount: run.spec.marketKeys.length,
  }))
}
