import type { AutomationNodeSettings } from "@/lib/automations/node-descriptor"
import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH } from "@/lib/automations/graph"
import {
  automationEntryNodeId,
  automationNextNodeId,
  automationRunStatusLabel,
} from "@/lib/automations/run"
import { approvalDeadline } from "@/lib/automations/nodes/wait-for-approval"
import { automationExecutors } from "@/server/automation-executors"
import {
  countHeldAutomationRuns,
  readAutomationsPaused,
  setAutomationPause,
} from "@/server/automation-pause"
import {
  decideAutomationApproval,
  deleteAutomationRuns,
  runAutomationTick,
  startAutomationRun,
  sweepExpiredApprovals,
} from "@/server/automation-engine"
import {
  getAutomationRun,
  listRunsAwaitingApproval,
  listRunsForAutomation,
} from "@/server/automation-runs"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellNotifications,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { now, uuid } from "@/server/security"

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb
})

afterEach(async () => {
  await client.close()
})

/** A flow drawn as a straight line of the kinds passed in. */
function graphOf(kinds: Array<{ kind: string; settings: AutomationNodeSettings }>) {
  const nodes = kinds.map((node, index) => ({
    id: `n${index}`,
    kind: node.kind,
    x: index * 200,
    y: 0,
    settings: node.settings,
  }))
  const edges = nodes.slice(1).map((node, index) => ({
    id: `e${index}`,
    from: `n${index}`,
    sourcePort: "then",
    to: node.id,
  }))
  return { ...EMPTY_AUTOMATION_GRAPH, nodes, edges }
}

const placeholder = { kind: "placeholder", settings: { note: "" } }
/** A test-only node kind, registered and removed inside the test that uses it. */
const CLAIM_THIEF = "test-claim-thief"
const approval = {
  kind: "waitForApproval",
  settings: {
    summary: "Sends the changelog email to 42 paying members.",
    timeoutDays: 3,
  },
}

async function insertAutomation(
  userId: string,
  nodes: Array<{ kind: string; settings: AutomationNodeSettings }>,
  name = `flow-${uuid()}`
) {
  const graph = graphOf(nodes)
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])

  const timestamp = now()
  const [row] = await db
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      userId,
      name,
      graph,
      compiledConfig: compiled.config,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

async function readRun(runId: string) {
  const [row] = await db
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.id, runId))
    .limit(1)
  return row
}

describe("compiled config helpers", () => {
  it("finds the one step nothing feeds into", () => {
    const config = compileAutomationGraph(graphOf([placeholder, placeholder]))
      .config as AutomationCompiledConfig
    expect(automationEntryNodeId(config)).toBe("n0")
    expect(automationNextNodeId(config, "n0")).toBe("n1")
    expect(automationNextNodeId(config, "n1")).toBeNull()
  })

  it("refuses a flow drawn as two disconnected lines", () => {
    const graph = graphOf([placeholder, placeholder])
    // Drop the connection, leaving two separate starting steps.
    const config = compileAutomationGraph({ ...graph, edges: [] })
      .config as AutomationCompiledConfig
    expect(automationEntryNodeId(config)).toBeNull()
  })
})

describe("running a flow", () => {
  it("walks a two-step flow end to end and records what each step did", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [
      placeholder,
      placeholder,
    ])

    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)

    const detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.status).toBe("completed")
    expect(detail?.steps).toHaveLength(2)
    expect(detail?.steps[0].summary).toBe(
      "Did nothing — this is a stand-in step."
    )
    expect(detail?.finishedAt).not.toBeNull()
  })

  it("refuses to start a flow with more than one starting step", async () => {
    const user = await insertUser(db, { role: "admin" })
    const graph = { ...graphOf([placeholder, placeholder]), edges: [] }
    const compiled = compileAutomationGraph(graph)
    const timestamp = now()
    const [automation] = await db
      .insert(customShellAutomations)
      .values({
        id: uuid(),
        userId: user.id,
        name: "two starts",
        graph,
        compiledConfig: compiled.config,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()

    await expect(
      startAutomationRun(user.id, automation.id, db)
    ).rejects.toThrow("NO_SINGLE_START")
  })

  it("fails the run in plain words when a step has no executor", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [
      {
        kind: "aiStep",
        settings: {
          provider: "anthropic",
          model: "claude-opus-5",
          instructions: "Write something.",
        },
      },
    ])

    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)

    const detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.status).toBe("failed")
    expect(detail?.error).toContain("cannot run yet")
    expect(detail?.steps[0].status).toBe("failed")
  })

  it("never claims a run that is already claimed by a live ticker", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [placeholder])
    const run = await startAutomationRun(user.id, automation.id, db)

    // Somebody else's claim, stamped a moment ago.
    await db
      .update(customShellAutomationRuns)
      .set({ claimToken: uuid(), claimedAt: now() })
      .where(eq(customShellAutomationRuns.id, run.id))

    const result = await runAutomationTick(db)
    expect(result.processed).toBe(0)
    expect((await readRun(run.id)).status).toBe("active")
  })

  it("takes back a claim left behind by a process that died", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [placeholder])
    const run = await startAutomationRun(user.id, automation.id, db)

    await db
      .update(customShellAutomationRuns)
      .set({
        claimToken: uuid(),
        claimedAt: new Date(now().getTime() - 10 * 60 * 1000),
      })
      .where(eq(customShellAutomationRuns.id, run.id))

    const result = await runAutomationTick(db)
    expect(result.processed).toBe(1)
    expect((await readRun(run.id)).status).toBe("completed")
  })

  it("stops walking the moment it loses the claim mid-run", async () => {
    const user = await insertUser(db, { role: "admin" })

    // A step that outlives the five-minute stale-claim window can be reclaimed
    // by another ticker while this one is still inside it. This stands in for
    // that: the step itself hands the run to somebody else, and the walk must
    // notice rather than writing its own stale position over the new owner's.
    automationExecutors[CLAIM_THIEF] = async ({ database, run }) => {
      await database
        .update(customShellAutomationRuns)
        .set({ claimToken: uuid(), claimedAt: now() })
        .where(eq(customShellAutomationRuns.id, run.id))
      return { type: "next", summary: "Took the claim." }
    }

    try {
      const automation = await insertAutomation(user.id, [placeholder])
      // Two steps: the thief, then one that must never run.
      await db
        .update(customShellAutomations)
        .set({
          compiledConfig: {
            v: 1,
            kind: "automation",
            nodes: {
              n0: { kind: CLAIM_THIEF, settings: {} },
              n1: { kind: "placeholder", settings: { note: "" } },
            },
            edges: [{ from: "n0", sourcePort: "then", to: "n1" }],
          },
        })
        .where(eq(customShellAutomations.id, automation.id))

      const run = await startAutomationRun(user.id, automation.id, db)
      await runAutomationTick(db)

      const row = await readRun(run.id)
      // Still parked on the stolen step, still holding the thief's claim: this
      // walk wrote nothing over it.
      expect(row.currentNodeId).toBe("n0")
      expect(row.status).toBe("active")

      const detail = await getAutomationRun(user.id, run.id, db)
      // The second step never ran, so it was never walked twice.
      expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0"])
    } finally {
      delete automationExecutors[CLAIM_THIEF]
    }
  })

  it("leaves a run alone until its wake-up time", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [placeholder])
    const run = await startAutomationRun(user.id, automation.id, db)

    await db
      .update(customShellAutomationRuns)
      .set({ wakeAt: new Date(now().getTime() + 60_000) })
      .where(eq(customShellAutomationRuns.id, run.id))

    expect((await runAutomationTick(db)).processed).toBe(0)
    expect((await readRun(run.id)).status).toBe("active")
  })
})

describe("approval checkpoints", () => {
  async function parkedRun() {
    const user = await insertUser(db, { role: "admin", name: "Tyler" })
    const automation = await insertAutomation(user.id, [
      placeholder,
      approval,
      placeholder,
    ])
    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)
    return { user, automation, runId: run.id }
  }

  it("parks the run, hands the claim back and asks its owner", async () => {
    const { user, runId } = await parkedRun()

    const row = await readRun(runId)
    expect(row.status).toBe("waiting_approval")
    expect(row.approvalNodeId).toBe("n1")
    expect(row.approvalSummary).toBe(
      "Sends the changelog email to 42 paying members."
    )
    expect(row.approvalDeadlineAt).not.toBeNull()
    // Nothing is holding it: the claim is back and no decision has been made.
    expect(row.claimToken).toBeNull()
    expect(row.approvalDecision).toBeNull()

    const notices = await db
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, user.id))
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe("automation_approval")
    expect(notices[0].automationRunId).toBe(runId)
    expect(notices[0].automationApprovalState).toBe("pending")
  })

  it("costs the engine nothing while it waits", async () => {
    const { runId } = await parkedRun()

    // Ten more passes: a parked run must never be claimed or re-notified.
    for (let pass = 0; pass < 10; pass += 1) {
      expect((await runAutomationTick(db)).processed).toBe(0)
    }
    const notices = await db.select().from(customShellNotifications)
    expect(notices).toHaveLength(1)
    expect((await readRun(runId)).status).toBe("waiting_approval")
  })

  it("carries on from the step after the checkpoint when approved", async () => {
    const { user, runId } = await parkedRun()

    expect(
      await decideAutomationApproval({
        runId,
        decision: "approved",
        decidedByUserId: user.id,
        decidedByName: user.name,
        database: db,
      })
    ).toBe(true)

    // It resumes at the step *after* the checkpoint, so the run cannot park a
    // second time on the same node.
    expect((await readRun(runId)).currentNodeId).toBe("n2")

    await runAutomationTick(db)

    const detail = await getAutomationRun(user.id, runId, db)
    expect(detail?.status).toBe("completed")
    expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0", "n1", "n2"])
    expect(detail?.steps[1].summary).toBe(
      "Approved by Tyler. The flow carried on."
    )
    expect(detail?.approvalDecidedByName).toBe("Tyler")
  })

  it("ends the run when rejected, and nothing after it runs", async () => {
    const { user, runId } = await parkedRun()

    await decideAutomationApproval({
      runId,
      decision: "rejected",
      decidedByUserId: user.id,
      decidedByName: user.name,
      database: db,
    })
    await runAutomationTick(db)

    const detail = await getAutomationRun(user.id, runId, db)
    expect(detail?.status).toBe("rejected")
    expect(detail?.approvalDecision).toBe("rejected")
    // Two steps, never the third: the step after the checkpoint never ran.
    expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0", "n1"])
    expect(detail?.steps[1].status).toBe("rejected")
    expect(automationRunStatusLabel("rejected", "rejected")).toBe("Rejected")
  })

  it("refuses a second decision on the same run", async () => {
    const { user, runId } = await parkedRun()

    const first = await decideAutomationApproval({
      runId,
      decision: "approved",
      decidedByUserId: user.id,
      decidedByName: user.name,
      database: db,
    })
    const second = await decideAutomationApproval({
      runId,
      decision: "rejected",
      decidedByUserId: user.id,
      decidedByName: user.name,
      database: db,
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect((await readRun(runId)).approvalDecision).toBe("approved")
  })

  it("auto-rejects a checkpoint nobody answered, and says so", async () => {
    const { user, runId } = await parkedRun()

    await db
      .update(customShellAutomationRuns)
      .set({ approvalDeadlineAt: new Date(now().getTime() - 1000) })
      .where(eq(customShellAutomationRuns.id, runId))

    expect(await sweepExpiredApprovals(db)).toBe(1)

    const detail = await getAutomationRun(user.id, runId, db)
    expect(detail?.status).toBe("rejected")
    expect(detail?.approvalDecision).toBe("timed_out")
    expect(detail?.approvalDecidedByName).toBeNull()
    expect(detail?.steps[1].summary).toContain("Nobody answered")
    expect(automationRunStatusLabel("rejected", "timed_out")).toBe("Timed out")

    const notices = await db
      .select()
      .from(customShellNotifications)
      .where(
        and(
          eq(customShellNotifications.recipientUserId, user.id),
          eq(customShellNotifications.automationApprovalState, "timed_out")
        )
      )
    expect(notices).toHaveLength(1)

    // The deadline can only fire once, however many times the sweep runs.
    expect(await sweepExpiredApprovals(db)).toBe(0)
  })

  it("leaves a checkpoint alone until its deadline passes", async () => {
    const { runId } = await parkedRun()
    expect(await sweepExpiredApprovals(db)).toBe(0)
    expect((await readRun(runId)).status).toBe("waiting_approval")
  })

  it("gives a second checkpoint its own decision", async () => {
    const user = await insertUser(db, { role: "admin", name: "Tyler" })
    const automation = await insertAutomation(user.id, [approval, approval])
    const run = await startAutomationRun(user.id, automation.id, db)

    await runAutomationTick(db)
    expect((await readRun(run.id)).approvalNodeId).toBe("n0")

    await decideAutomationApproval({
      runId: run.id,
      decision: "approved",
      decidedByUserId: user.id,
      decidedByName: user.name,
      database: db,
    })
    await runAutomationTick(db)

    // Parked again, on the second checkpoint, with the first one's answer
    // cleared rather than inherited.
    const row = await readRun(run.id)
    expect(row.status).toBe("waiting_approval")
    expect(row.approvalNodeId).toBe("n1")
    expect(row.approvalDecision).toBeNull()
  })

  it("fails an approved run whose saved flow can no longer be read", async () => {
    const { user, runId } = await parkedRun()

    await db
      .update(customShellAutomationRuns)
      .set({ configSnapshot: { junk: true } as never })
      .where(eq(customShellAutomationRuns.id, runId))

    // Not a decision that went through, so the caller is told so — and the run
    // says it failed rather than claiming the rest of the flow ran.
    expect(
      await decideAutomationApproval({
        runId,
        decision: "approved",
        decidedByUserId: user.id,
        decidedByName: user.name,
        database: db,
      })
    ).toBe(false)

    const row = await readRun(runId)
    expect(row.status).toBe("failed")
    expect(row.error).toContain("could not be read")
  })

  it("counts the deadline forward from when the run parked", () => {
    const parkedAt = new Date("2026-08-03T10:00:00.000Z")
    expect(approvalDeadline(parkedAt, 3).toISOString()).toBe(
      "2026-08-06T10:00:00.000Z"
    )
  })
})

describe("run history", () => {
  it("shows one flow's own runs, newest first, and counts their steps", async () => {
    const user = await insertUser(db, { role: "admin" })
    const flow = await insertAutomation(user.id, [placeholder, placeholder], "mine")
    const other = await insertAutomation(user.id, [placeholder], "other")

    await startAutomationRun(user.id, other.id, db)
    const first = await startAutomationRun(user.id, flow.id, db)
    const second = await startAutomationRun(user.id, flow.id, db)
    await runAutomationTick(db)

    const page = await listRunsForAutomation(user.id, flow.id, 0, db)
    // The other flow's run is not this flow's history.
    expect(page.total).toBe(2)
    expect(page.runs.map((run) => run.id)).toEqual([second.id, first.id])
    expect(page.runs[0].stepCount).toBe(2)
  })

  it("counts runs, not the rows their steps multiply into", async () => {
    const user = await insertUser(db, { role: "admin" })
    // Three steps each, so the join behind the list fans every run out to three
    // rows. The total has to survive that — an inflated one would leave "Load
    // more" offering pages that do not exist.
    const flow = await insertAutomation(user.id, [
      placeholder,
      placeholder,
      placeholder,
    ])
    await startAutomationRun(user.id, flow.id, db)
    await startAutomationRun(user.id, flow.id, db)
    await runAutomationTick(db)

    const page = await listRunsForAutomation(user.id, flow.id, 0, db)
    expect(page.total).toBe(2)
    expect(page.runs).toHaveLength(2)
    expect(page.runs[0].stepCount).toBe(3)
  })

  it("reports the whole total from a single page, and pages past it", async () => {
    const user = await insertUser(db, { role: "admin" })
    const flow = await insertAutomation(user.id, [placeholder])
    // One more than a page holds.
    for (let index = 0; index < 26; index += 1) {
      await startAutomationRun(user.id, flow.id, db)
    }

    const first = await listRunsForAutomation(user.id, flow.id, 0, db)
    expect(first.runs).toHaveLength(25)
    // The count is the whole set, not the page it arrived on.
    expect(first.total).toBe(26)

    const second = await listRunsForAutomation(user.id, flow.id, 25, db)
    expect(second.runs).toHaveLength(1)
    expect(second.total).toBe(26)
    // No run appears on both pages.
    const ids = new Set([...first.runs, ...second.runs].map((run) => run.id))
    expect(ids.size).toBe(26)
  })

  it("says nothing is there rather than guessing when the list is empty", async () => {
    const user = await insertUser(db, { role: "admin" })
    const flow = await insertAutomation(user.id, [placeholder])

    const page = await listRunsForAutomation(user.id, flow.id, 0, db)
    expect(page).toEqual({ runs: [], total: 0 })
  })

  it("keeps one person's runs out of another's list", async () => {
    const mine = await insertUser(db, { role: "admin" })
    const theirs = await insertUser(db, { role: "admin" })
    const theirFlow = await insertAutomation(theirs.id, [placeholder], "theirs")
    await startAutomationRun(theirs.id, theirFlow.id, db)

    const page = await listRunsForAutomation(mine.id, theirFlow.id, 0, db)
    expect(page.total).toBe(0)
    expect(page.runs).toEqual([])
  })

  it("gathers what is waiting on you across every flow, closest deadline first", async () => {
    const user = await insertUser(db, { role: "admin" })
    const other = await insertUser(db, { role: "admin" })
    const slow = await insertAutomation(
      user.id,
      [{ ...approval, settings: { ...approval.settings, timeoutDays: 30 } }],
      "slow"
    )
    const urgent = await insertAutomation(
      user.id,
      [{ ...approval, settings: { ...approval.settings, timeoutDays: 1 } }],
      "urgent"
    )
    const notMine = await insertAutomation(other.id, [approval], "theirs")

    await startAutomationRun(user.id, slow.id, db)
    await startAutomationRun(user.id, urgent.id, db)
    await startAutomationRun(other.id, notMine.id, db)
    await runAutomationTick(db)

    const queue = await listRunsAwaitingApproval(user.id, db)
    expect(queue.total).toBe(2)
    expect(queue.runs.map((run) => run.automationName)).toEqual([
      "urgent",
      "slow",
    ])
  })

  it("drops a run out of the waiting list once it is decided", async () => {
    const user = await insertUser(db, { role: "admin", name: "Tyler" })
    const flow = await insertAutomation(user.id, [approval])
    const run = await startAutomationRun(user.id, flow.id, db)
    await runAutomationTick(db)
    expect((await listRunsAwaitingApproval(user.id, db)).total).toBe(1)

    await decideAutomationApproval({
      runId: run.id,
      decision: "rejected",
      decidedByUserId: user.id,
      decidedByName: user.name,
      database: db,
    })

    expect((await listRunsAwaitingApproval(user.id, db)).total).toBe(0)
  })

  it("refuses to hand somebody else's run over", async () => {
    const mine = await insertUser(db, { role: "admin" })
    const theirs = await insertUser(db, { role: "admin" })
    const theirFlow = await insertAutomation(theirs.id, [placeholder])
    const run = await startAutomationRun(theirs.id, theirFlow.id, db)

    expect(await getAutomationRun(mine.id, run.id, db)).toBeNull()
  })

  it("deletes finished runs and refuses the ones still going", async () => {
    const user = await insertUser(db, { role: "admin" })
    const done = await insertAutomation(user.id, [placeholder], "done")
    const waiting = await insertAutomation(user.id, [approval], "waiting")

    const doneRun = await startAutomationRun(user.id, done.id, db)
    const waitingRun = await startAutomationRun(user.id, waiting.id, db)
    await runAutomationTick(db)

    const result = await deleteAutomationRuns(
      user.id,
      [doneRun.id, waitingRun.id],
      db
    )
    expect(result.deleted).toEqual([doneRun.id])
    expect(result.kept).toEqual([waitingRun.id])
  })

  it("will not delete another person's run", async () => {
    const mine = await insertUser(db, { role: "admin" })
    const theirs = await insertUser(db, { role: "admin" })
    const theirFlow = await insertAutomation(theirs.id, [placeholder])
    const run = await startAutomationRun(theirs.id, theirFlow.id, db)
    await runAutomationTick(db)

    const result = await deleteAutomationRuns(mine.id, [run.id], db)
    expect(result.deleted).toEqual([])
    expect(result.kept).toEqual([run.id])
  })

  it("takes an approval notice with the run it was about", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [approval])
    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)
    expect(await db.select().from(customShellNotifications)).toHaveLength(1)

    await db
      .delete(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.id, run.id))

    expect(await db.select().from(customShellNotifications)).toHaveLength(0)
  })
})

/**
 * The kill switch: one flag that stops every flow at once, loses nothing and
 * doubles nothing. See `server/automation-pause.ts` for the rule these check.
 */
describe("the automations kill switch", () => {
  /** A step that hits the switch while the engine is inside it. */
  const SWITCH_FLIPPER = "test-switch-flipper"

  async function pause(database = db) {
    await setAutomationPause(
      { enabled: true, changedBy: "Tyler" },
      database
    )
  }

  async function resume(database = db) {
    await setAutomationPause(
      { enabled: false, changedBy: "Tyler" },
      database
    )
  }

  it("claims nothing at all while it is on", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [
      placeholder,
      placeholder,
    ])
    const run = await startAutomationRun(user.id, automation.id, db)

    await pause()
    const result = await runAutomationTick(db)

    expect(result.paused).toBe(true)
    expect(result.processed).toBe(0)

    // Untouched: still due, still on its first step, with nothing recorded.
    const row = await readRun(run.id)
    expect(row.status).toBe("active")
    expect(row.currentNodeId).toBe("n0")
    expect(row.claimToken).toBeNull()
    const detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.steps).toEqual([])
  })

  it("refuses to start a flow by hand, rather than queueing one quietly", async () => {
    const user = await insertUser(db, { role: "admin" })
    const automation = await insertAutomation(user.id, [placeholder])

    await pause()
    await expect(
      startAutomationRun(user.id, automation.id, db)
    ).rejects.toThrow("AUTOMATIONS_PAUSED")

    // Nothing was written, so there is no surprise run waiting to fire on
    // resume — which is the whole reason this one path refuses instead of
    // holding.
    expect(await countHeldAutomationRuns(db)).toBe(0)
  })

  it("finishes the step it is inside, then holds the run where it stands", async () => {
    const user = await insertUser(db, { role: "admin" })

    // The switch goes on part-way through the walk, from inside a step. The
    // promise is that this step finishes and nothing after it starts.
    automationExecutors[SWITCH_FLIPPER] = async ({ database }) => {
      await setAutomationPause(
        { enabled: true, changedBy: "Tyler" },
        database as typeof db
      )
      return { type: "next", summary: "Hit the switch." }
    }

    try {
      const automation = await insertAutomation(user.id, [placeholder])
      await db
        .update(customShellAutomations)
        .set({
          compiledConfig: {
            v: 1,
            kind: "automation",
            nodes: {
              n0: { kind: SWITCH_FLIPPER, settings: {} },
              n1: { kind: "placeholder", settings: { note: "" } },
              n2: { kind: "placeholder", settings: { note: "" } },
            },
            edges: [
              { from: "n0", sourcePort: "then", to: "n1" },
              { from: "n1", sourcePort: "then", to: "n2" },
            ],
          },
        })
        .where(eq(customShellAutomations.id, automation.id))

      const run = await startAutomationRun(user.id, automation.id, db)
      await runAutomationTick(db)

      // The step that hit the switch finished and was recorded; the two after
      // it never started.
      let detail = await getAutomationRun(user.id, run.id, db)
      expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0"])

      // Held, not killed: still active, claim handed back, and pointing at the
      // step it was about to take.
      let row = await readRun(run.id)
      expect(row.status).toBe("active")
      expect(row.currentNodeId).toBe("n1")
      expect(row.claimToken).toBeNull()
      expect(await countHeldAutomationRuns(db)).toBe(1)

      // Passes while it is on change nothing, however many there are.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await runAutomationTick(db)).paused).toBe(true)
      }
      expect((await readRun(run.id)).currentNodeId).toBe("n1")

      // Switch it back off and the run carries on from exactly where it
      // stopped — the first step is not walked a second time.
      await resume()
      await runAutomationTick(db)

      detail = await getAutomationRun(user.id, run.id, db)
      expect(detail?.status).toBe("completed")
      expect(detail?.steps.map((step) => step.nodeId)).toEqual([
        "n0",
        "n1",
        "n2",
      ])
      row = await readRun(run.id)
      expect(row.status).toBe("completed")
      expect(await countHeldAutomationRuns(db)).toBe(0)
    } finally {
      delete automationExecutors[SWITCH_FLIPPER]
    }
  })

  it("stops approval deadlines counting down instead of auto-rejecting", async () => {
    const user = await insertUser(db, { role: "admin", name: "Tyler" })
    const automation = await insertAutomation(user.id, [
      approval,
      placeholder,
    ])
    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)
    expect((await readRun(run.id)).status).toBe("waiting_approval")

    // Its deadline passes while everything is paused. Auto-rejecting here
    // would be the switch throwing away work nobody could have answered for.
    await db
      .update(customShellAutomationRuns)
      .set({ approvalDeadlineAt: new Date(now().getTime() - 1000) })
      .where(eq(customShellAutomationRuns.id, run.id))
    await pause()

    expect((await runAutomationTick(db)).expired).toBe(0)
    expect((await readRun(run.id)).status).toBe("waiting_approval")
    // A parked run is waiting on a person, not on the switch, so it is not
    // counted among the runs being held.
    expect(await countHeldAutomationRuns(db)).toBe(0)

    // Off again, and the deadline it missed is answered on the next pass.
    await resume()
    expect((await runAutomationTick(db)).expired).toBe(1)
    const detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.approvalDecision).toBe("timed_out")
  })

  it("holds an approved run rather than refusing the decision", async () => {
    const user = await insertUser(db, { role: "admin", name: "Tyler" })
    const automation = await insertAutomation(user.id, [
      approval,
      placeholder,
    ])
    const run = await startAutomationRun(user.id, automation.id, db)
    await runAutomationTick(db)
    await pause()

    // Saying yes is a decision, not work starting, so it is still allowed —
    // an investigation should not leave the approval queue frozen.
    expect(
      await decideAutomationApproval({
        runId: run.id,
        decision: "approved",
        decidedByUserId: user.id,
        decidedByName: user.name,
        database: db,
      })
    ).toBe(true)

    await runAutomationTick(db)
    // The step after the checkpoint waits for the switch like everything else.
    expect((await readRun(run.id)).status).toBe("active")
    let detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0"])

    await resume()
    await runAutomationTick(db)
    detail = await getAutomationRun(user.id, run.id, db)
    expect(detail?.status).toBe("completed")
    expect(detail?.steps.map((step) => step.nodeId)).toEqual(["n0", "n1"])
  })

  it("remembers who flipped it and reads a missing setting as running", async () => {
    // A database that has never held this setting must read as running, or an
    // install that upgrades into the switch would freeze on the first tick.
    expect(await readAutomationsPaused(db)).toBe(false)

    const saved = await setAutomationPause(
      { enabled: true, changedBy: "Tyler" },
      db
    )
    expect(saved.enabled).toBe(true)
    expect(saved.changedBy).toBe("Tyler")
    expect(saved.changedAt).not.toBe("")
    expect(await readAutomationsPaused(db)).toBe(true)

    await resume()
    expect(await readAutomationsPaused(db)).toBe(false)
  })
})
