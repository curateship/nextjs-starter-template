import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import { automationNodeName } from "@/lib/automations/node-registry"
import {
  automationEntryNodeId,
  type AutomationRunStatus,
} from "@/lib/automations/run"
import { db, type CustomShellDb } from "@/server/db"
import { currentWorkspaceId } from "@/server/people/workspaces"
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
  /**
   * Who the run is about, as they read on the day it started. Null for a run
   * somebody set going by hand, which is about nobody in particular.
   */
  subjectLabel: string | null
  /** The step that started it, named the way the canvas names it. */
  triggerName: string | null
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
/**
 * The site a run belongs to.
 *
 * Almost always the value written when it started, which is the whole point —
 * a run's audience is fixed the moment it begins and cannot drift afterwards.
 *
 * The fallback covers runs saved before that column existed: for those, the
 * person who wrote the flow is the only clue there is. A run with neither says
 * so out loud rather than guessing, because guessing here means emailing the
 * wrong site's customers.
 */
export async function workspaceForRun(
  run: Pick<CustomShellAutomationRun, "id" | "workspaceId" | "userId">,
  database: CustomShellDb = db
): Promise<string> {
  if (run.workspaceId) return run.workspaceId
  if (!run.userId) {
    throw new Error(
      `Run ${run.id} has no site and nobody left to ask which it was for.`
    )
  }
  return currentWorkspaceId(run.userId, database)
}

export async function listRunsForAutomation(
  workspaceId: string,
  automationId: string,
  offset = 0,
  database: CustomShellDb = db
): Promise<{ runs: AutomationRunRow[]; total: number }> {
  // The site's runs, not one person's. Two admins working on the same site see
  // the same history, and a departed admin's runs stay where they belong.
  const owned = and(
    eq(customShellAutomationRuns.workspaceId, workspaceId),
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
 * Every run waiting on a decision, across every flow on this site — the
 * Waiting tab. Oldest first: the one closest to its deadline is the one that
 * needs answering.
 */
export async function listRunsAwaitingApproval(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ runs: AutomationRunRow[]; total: number }> {
  const waiting = and(
    eq(customShellAutomationRuns.workspaceId, workspaceId),
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

/** One run and everything it did, or null when it is not this site's. */
export async function getAutomationRun(
  workspaceId: string,
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
        eq(customShellAutomationRuns.workspaceId, workspaceId)
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
      // The settings come from the run's frozen copy of the flow, not from an
      // empty bag: a step whose name depends on how it was set — a billing
      // trigger, say — would otherwise be called by that node kind's default
      // rather than by what this run actually did.
      stepName: automationNodeName({
        id: step.nodeId,
        kind: step.kind,
        x: 0,
        y: 0,
        settings: row.run.configSnapshot?.nodes?.[step.nodeId]?.settings ?? {},
      }),
      status: step.status,
      summary: step.summary,
      error: step.error,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    })),
  }
}

/**
 * The step that started this run, named as it was named on the day.
 *
 * Read out of the run's own frozen copy of the flow, settings and all, because
 * one trigger kind covers several moments and only its settings say which. A
 * name built from the bare kind would call every billing run by whichever
 * moment happens to be that node's default.
 *
 * Null for a run somebody pressed Run for. Null too if the frozen copy cannot
 * be read — a list of runs must not fall over on one bad row.
 */
function runTriggerName(run: CustomShellAutomationRun): string | null {
  if (!run.triggerKind) return null
  const config = run.configSnapshot
  if (!config?.nodes) return null

  const entryNodeId = automationEntryNodeId(config)
  const entry = entryNodeId ? config.nodes[entryNodeId] : undefined
  if (!entryNodeId || !entry) return null

  return automationNodeName({
    id: entryNodeId,
    kind: entry.kind,
    x: 0,
    y: 0,
    settings: entry.settings,
  })
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
    subjectLabel: run.subjectLabel,
    triggerName: runTriggerName(run),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}
