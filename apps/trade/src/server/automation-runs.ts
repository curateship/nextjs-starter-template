import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import { automationNodeName } from "@/lib/automations/node-registry"
import type { AutomationRunStatus } from "@/lib/automations/run"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellUsers,
  type CustomShellAutomationRun,
} from "@/server/schema"

/**
 * Reading run history. The engine writes these rows; nothing here changes one.
 *
 * Two lists, because there are two questions. "What has this flow done?" is
 * answered while you are looking at that flow, in the editor's bottom panel.
 * "What is waiting on me?" is not about one flow at all, so it reaches across
 * every flow you own — same panel, second tab.
 */

/** One panel's worth of history. More is a "Load more" away. */
const RUNS_PAGE_SIZE = 25

/**
 * The most decisions one person can be shown at once. A queue longer than this
 * is a problem to fix in the flows, not to scroll — and the panel says plainly
 * that it is showing the oldest ones rather than quietly truncating.
 */
const WAITING_LIMIT = 50

export type AutomationRunRow = {
  id: string
  automationId: string
  automationName: string
  status: AutomationRunStatus
  approvalDecision: string | null
  approvalDeadlineAt: Date | null
  stepCount: number
  startedAt: Date
  finishedAt: Date | null
}

export type AutomationRunStepRow = {
  id: string
  nodeId: string
  /** The node's name as the canvas writes it — `kind` is only used to find it. */
  stepName: string
  status: string
  summary: string
  error: string | null
  startedAt: Date
  finishedAt: Date
}

export type AutomationRunDetail = AutomationRunRow & {
  approvalSummary: string | null
  approvalDecidedAt: Date | null
  approvalDecidedByName: string | null
  error: string | null
  steps: AutomationRunStepRow[]
}

/** How many steps each run has, counted by the database rather than fetched. */
const stepCountExpression = count(customShellAutomationRunSteps.id)

/**
 * How many runs match in total, carried on every row instead of asked for
 * separately.
 *
 * A window function runs after the grouping and before the `limit`, so this
 * counts every run the filter matched, not the page. One round trip per list
 * rather than two — worth having on a slow link, where the saving is a whole
 * query's latency and not a fraction of a millisecond.
 */
const totalExpression = sql<number>`(count(*) over())::int`

/** The shape both lists select, so a row reads the same in either tab. */
function runQuery(database: CustomShellDb) {
  return database
    .select({
      run: customShellAutomationRuns,
      automationName: customShellAutomations.name,
      stepCount: stepCountExpression,
      total: totalExpression,
    })
    .from(customShellAutomationRuns)
    .innerJoin(
      customShellAutomations,
      eq(customShellAutomations.id, customShellAutomationRuns.automationId)
    )
    .leftJoin(
      customShellAutomationRunSteps,
      eq(customShellAutomationRunSteps.runId, customShellAutomationRuns.id)
    )
    .groupBy(customShellAutomationRuns.id, customShellAutomations.name)
}

/** One flow's runs, newest first — the editor's Runs tab. */
export async function listRunsForAutomation(
  userId: string,
  automationId: string,
  offset = 0,
  database: CustomShellDb = db
): Promise<{ runs: AutomationRunRow[]; total: number }> {
  const owned = and(
    eq(customShellAutomationRuns.userId, userId),
    eq(customShellAutomationRuns.automationId, automationId)
  )

  const rows = await runQuery(database)
    .where(owned)
    // Two runs started in the same millisecond would otherwise arrive in
    // whatever order the database felt like, which lets one show up on two
    // pages of the same list.
    .orderBy(desc(customShellAutomationRuns.startedAt), desc(customShellAutomationRuns.id))
    .limit(RUNS_PAGE_SIZE)
    .offset(offset)

  return toPage(rows)
}

/**
 * Every run waiting on a decision, across every flow this person owns — the
 * Waiting tab. Oldest first: the one closest to its deadline is the one that
 * needs answering.
 */
export async function listRunsAwaitingApproval(
  userId: string,
  database: CustomShellDb = db
): Promise<{ runs: AutomationRunRow[]; total: number }> {
  const waiting = and(
    eq(customShellAutomationRuns.userId, userId),
    eq(customShellAutomationRuns.status, "waiting_approval")
  )

  const rows = await runQuery(database)
    .where(waiting)
    .orderBy(asc(customShellAutomationRuns.approvalDeadlineAt), asc(customShellAutomationRuns.id))
    .limit(WAITING_LIMIT)

  return toPage(rows)
}

/**
 * The rows, plus the total each of them is carrying. No rows means nothing
 * matched, which is a total of zero — there is no page to be wrong about.
 */
function toPage(
  rows: Array<{
    run: CustomShellAutomationRun
    automationName: string
    stepCount: number
    total: number
  }>
): { runs: AutomationRunRow[]; total: number } {
  return {
    runs: rows.map((row) => toRunRow(row.run, row.automationName, row.stepCount)),
    total: rows[0]?.total ?? 0,
  }
}

/** One run and everything it did, or null when it is not this person's. */
export async function getAutomationRun(
  userId: string,
  runId: string,
  database: CustomShellDb = db
): Promise<AutomationRunDetail | null> {
  const [row] = await database
    .select({
      run: customShellAutomationRuns,
      automationName: customShellAutomations.name,
      decidedByName: customShellUsers.name,
    })
    .from(customShellAutomationRuns)
    .innerJoin(
      customShellAutomations,
      eq(customShellAutomations.id, customShellAutomationRuns.automationId)
    )
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellAutomationRuns.approvalDecidedBy)
    )
    .where(
      and(
        eq(customShellAutomationRuns.id, runId),
        eq(customShellAutomationRuns.userId, userId)
      )
    )
    .limit(1)
  if (!row) return null

  const steps = await database
    .select()
    .from(customShellAutomationRunSteps)
    .where(eq(customShellAutomationRunSteps.runId, runId))
    .orderBy(
      asc(customShellAutomationRunSteps.startedAt),
      asc(customShellAutomationRunSteps.id)
    )

  return {
    ...toRunRow(row.run, row.automationName, steps.length),
    approvalSummary: row.run.approvalSummary,
    approvalDecidedAt: row.run.approvalDecidedAt,
    approvalDecidedByName: row.decidedByName,
    error: row.run.error,
    steps: steps.map((step) => ({
      id: step.id,
      nodeId: step.nodeId,
      stepName: automationNodeName({
        id: step.nodeId,
        kind: step.kind,
        x: 0,
        y: 0,
        settings: {},
      }),
      status: step.status,
      summary: step.summary,
      error: step.error,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    })),
  }
}

function toRunRow(
  run: CustomShellAutomationRun,
  automationName: string,
  stepCount: number
): AutomationRunRow {
  return {
    id: run.id,
    automationId: run.automationId,
    automationName,
    status: run.status,
    approvalDecision: run.approvalDecision,
    approvalDeadlineAt: run.approvalDeadlineAt,
    stepCount,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}
