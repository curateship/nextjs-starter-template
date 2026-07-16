import { and, eq, sql } from "drizzle-orm"

import {
  compiledConfigSchema,
  nextNodeId,
  type CompiledConfig,
} from "@/lib/automations/compiled-config"
import { nodeExecutors } from "@/server/automations/nodes"
import type { ExecutorResult } from "@/server/automations/types"
import { db, type CustomShellDb } from "@/server/db"
import {
  newsletterAutomationRuns,
  newsletterAutomationRunSteps,
  newsletterContacts,
  type NewsletterAutomationRun,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const TICK_MS = Number.parseInt(process.env.NEWSLETTER_TICK_MS || "15000", 10)
const CLAIM_BATCH_SIZE = 20
const CLAIM_TIMEOUT_MINUTES = 5
const NODE_BUDGET_PER_TICK = 25
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 30_000

declare global {
  var __newsletterTickerStarted: boolean | undefined
}

export function ensureTickerStarted() {
  // Tests drive runTick() directly; an interval would outlive the test run.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  if (globalThis.__newsletterTickerStarted) return
  globalThis.__newsletterTickerStarted = true

  const tick = () => {
    runTick().catch((error) => {
      console.error("Newsletter automation tick failed", error)
    })
  }
  tick()
  setInterval(tick, TICK_MS)
}

/**
 * Claims a batch of due runs with a fresh claim token and processes each one.
 * Stale claims (crashed ticks) self-heal after CLAIM_TIMEOUT_MINUTES.
 */
export async function runTick(database: CustomShellDb = db) {
  const claimToken = uuid()
  const claimed = await database.execute(sql`
    UPDATE newsletter_automation_runs
    SET claim_token = ${claimToken}, claimed_at = now(), updated_at = now()
    WHERE id IN (
      SELECT id FROM newsletter_automation_runs
      WHERE status IN ('active', 'waiting') AND wake_at <= now()
        AND (claimed_at IS NULL OR claimed_at < now() - interval '${sql.raw(
          String(CLAIM_TIMEOUT_MINUTES)
        )} minutes')
      ORDER BY wake_at ASC
      LIMIT ${CLAIM_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `)

  const ids = (claimed.rows as Array<{ id: string }>).map((row) => row.id)

  let processed = 0
  let failed = 0
  for (const id of ids) {
    try {
      await processRun(id, claimToken, database)
      processed += 1
    } catch (error) {
      console.error(`Newsletter automation run ${id} tick failed`, error)
      failed += 1
    }
  }

  return { processed, failed }
}

async function processRun(
  runId: string,
  claimToken: string,
  database: CustomShellDb
) {
  const [run] = await database
    .select()
    .from(newsletterAutomationRuns)
    .where(
      and(
        eq(newsletterAutomationRuns.id, runId),
        eq(newsletterAutomationRuns.claimToken, claimToken)
      )
    )
    .limit(1)

  if (!run) return

  const release = async (
    values: Partial<typeof newsletterAutomationRuns.$inferInsert>
  ) => {
    await database
      .update(newsletterAutomationRuns)
      .set({
        ...values,
        claimToken: null,
        claimedAt: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(newsletterAutomationRuns.id, runId),
          eq(newsletterAutomationRuns.claimToken, claimToken)
        )
      )
  }

  const parsed = compiledConfigSchema.safeParse(run.configSnapshot)
  if (!parsed.success) {
    await release({ status: "failed", error: "Invalid automation snapshot" })
    return
  }
  const config = parsed.data

  const [contact] = await database
    .select()
    .from(newsletterContacts)
    .where(eq(newsletterContacts.id, run.contactId))
    .limit(1)

  if (!contact) {
    await release({ status: "failed", error: "Contact no longer exists" })
    return
  }

  let currentNodeId = run.currentNodeId
  let attempts = run.attempts

  for (let budget = 0; budget < NODE_BUDGET_PER_TICK; budget += 1) {
    const node = config.nodes[currentNodeId]
    if (!node) {
      await release({
        status: "failed",
        error: `Node ${currentNodeId} is missing from the snapshot`,
      })
      return
    }

    const startedAt = now()
    let result: ExecutorResult
    try {
      result = await nodeExecutors[node.kind]({
        database,
        workspaceId: run.workspaceId,
        run,
        contact,
        config,
        nodeId: currentNodeId,
        now,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      attempts += 1
      await recordStep(database, run, currentNodeId, node.kind, {
        status: "failed",
        attempts,
        error: message,
        startedAt,
      })
      if (attempts >= MAX_ATTEMPTS) {
        await release({ status: "failed", attempts, error: message })
      } else {
        await release({
          status: "active",
          attempts,
          wakeAt: new Date(now().getTime() + RETRY_BACKOFF_MS * attempts),
        })
      }
      return
    }

    await recordStep(database, run, currentNodeId, node.kind, {
      status: "completed",
      attempts: attempts + 1,
      output: result.output,
      startedAt,
    })

    if (result.type === "complete") {
      await release({ status: "completed", completedAt: now(), error: null })
      return
    }

    if (result.type === "wait") {
      const next = resolveNext(config, currentNodeId)
      if (!next) {
        await release({ status: "completed", completedAt: now(), error: null })
      } else {
        await release({
          status: "waiting",
          currentNodeId: next,
          attempts: 0,
          wakeAt: result.wakeAt,
        })
      }
      return
    }

    const next = resolveNext(config, currentNodeId, result.port)
    if (!next) {
      await release({ status: "completed", completedAt: now(), error: null })
      return
    }

    currentNodeId = next
    attempts = 0
    // Persist progress after every node so a crash resumes at the right spot
    // (the claim stays held while the loop continues).
    await database
      .update(newsletterAutomationRuns)
      .set({ currentNodeId, attempts, updatedAt: now() })
      .where(eq(newsletterAutomationRuns.id, runId))
  }

  // Budget exhausted (very deep graph or a cycle that slipped through
  // compilation) — release and continue on the next tick.
  await release({ status: "active", attempts, wakeAt: now() })
}

function resolveNext(
  config: CompiledConfig,
  fromNodeId: string,
  port?: string
) {
  const node = config.nodes[fromNodeId]
  if (node?.kind === "branch") {
    return nextNodeId(config, fromNodeId, port ?? "yes")
  }
  return nextNodeId(config, fromNodeId)
}

async function recordStep(
  database: CustomShellDb,
  run: NewsletterAutomationRun,
  nodeId: string,
  kind: string,
  step: {
    status: "completed" | "failed"
    attempts: number
    output?: unknown
    error?: string
    startedAt: Date
  }
) {
  await database.insert(newsletterAutomationRunSteps).values({
    id: uuid(),
    runId: run.id,
    nodeId,
    kind,
    status: step.status,
    attempts: step.attempts,
    output: step.output ?? null,
    error: step.error ?? null,
    startedAt: step.startedAt,
    finishedAt: now(),
  })
}
