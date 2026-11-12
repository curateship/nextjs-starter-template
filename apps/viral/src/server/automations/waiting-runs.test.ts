import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import type { AutomationRunStatus } from "@/lib/automations/run"
import { now, uuid } from "@/server/auth/security"
import { automationSectionCounts, listRunsAwaitingApproval } from "@/server/automations/runs"
import { type CustomShellDb } from "@/server/db"
import { customShellAutomationRuns, customShellAutomations } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * The Automations dashboard's Waiting on you list and the Dashboards block's
 * counts, against a real database. A flow's own runs are `listRunsForAutomation`,
 * covered in `engine.test.ts`.
 */

let client: PGlite
let db: CustomShellDb
let site: string
let userId: string

const graph = {
  nodes: [
    { id: "n0", kind: "placeholder", x: 0, y: 0, settings: { note: "" } },
    {
      id: "n1",
      kind: "waitForApproval",
      x: 200,
      y: 0,
      settings: { summary: "Sends the weekly email.", timeoutDays: 3 },
    },
  ],
  edges: [{ id: "e0", from: "n0", sourcePort: "then", to: "n1" }],
  viewport: { x: 0, y: 0, zoom: 1 },
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb
  site = (await insertWorkspace(db)).id
  userId = (await insertUser(db, { role: "admin", name: "Tyler" })).id
})

afterEach(async () => {
  await client.close()
})

async function insertFlow(name: string, workspaceId = site) {
  const compiled = compileAutomationGraph(graph as never)
  const at = now()
  const [row] = await db
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      workspaceId,
      userId,
      name,
      graph: graph as never,
      compiledConfig: compiled.config,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return row
}

/** One run row, written straight in: the lists read rows, not the engine. */
async function insertRun(
  flow: Awaited<ReturnType<typeof insertFlow>>,
  values: {
    status?: AutomationRunStatus
    subjectLabel?: string
    test?: boolean
    startedAt?: Date
    deadline?: Date
    workspaceId?: string
  } = {}
) {
  const startedAt = values.startedAt ?? now()
  const waiting = values.status === "waiting_approval"
  const [row] = await db
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId: flow.id,
      userId,
      workspaceId: values.workspaceId ?? site,
      status: values.status ?? "completed",
      currentNodeId: waiting ? "n1" : "n0",
      configSnapshot: flow.compiledConfig!,
      wakeAt: startedAt,
      approvalNodeId: waiting ? "n1" : null,
      approvalDeadlineAt: waiting ? (values.deadline ?? new Date(startedAt.getTime() + 86_400_000)) : null,
      subjectLabel: values.subjectLabel ?? null,
      subjectUserId: values.test ? userId : null,
      testRun: values.test ?? false,
      testRecipientEmail: values.test ? "admin@example.com" : null,
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    .returning()
  return row
}

describe("Waiting on you", () => {
  it("names the step each run is waiting at, closest deadline first, and searches", async () => {
    const welcome = await insertFlow("Welcome email")
    const winBack = await insertFlow("Win-back")
    const later = await insertRun(welcome, { status: "waiting_approval", deadline: new Date("2026-11-20T00:00:00Z") })
    const sooner = await insertRun(winBack, {
      status: "waiting_approval",
      deadline: new Date("2026-11-12T00:00:00Z"),
      subjectLabel: "Bo Chen",
    })
    await insertRun(welcome)

    const queue = await listRunsAwaitingApproval(site, db)
    expect(queue.runs.map((run) => run.id)).toEqual([sooner.id, later.id])
    expect(queue.runs[0].approvalStepName).toBeTruthy()
    expect((await listRunsAwaitingApproval(site, db, { search: "bo" })).runs.map((run) => run.id)).toEqual([sooner.id])
    // The flow's name too, capitals ignored, and a % is a percent sign, not "anything".
    expect((await listRunsAwaitingApproval(site, db, { search: "WIN-" })).runs.map((run) => run.id)).toEqual([sooner.id])
    expect((await listRunsAwaitingApproval(site, db, { search: "%" })).total).toBe(0)
    expect((await listRunsAwaitingApproval(site, db, { offset: 1 })).runs.map((run) => run.id)).toEqual([later.id])
  })
})

describe("the Dashboards block's counts", () => {
  it("counts the flows and the runs waiting, on this site only", async () => {
    const welcome = await insertFlow("Welcome email")
    await insertFlow("Win-back")
    await insertRun(welcome)
    await insertRun(welcome, { status: "waiting_approval" })
    const other = await insertWorkspace(db)
    await insertRun(await insertFlow("Theirs", other.id), { workspaceId: other.id, status: "waiting_approval" })

    expect(await automationSectionCounts(site, db)).toEqual({ automations: 2, waiting: 1 })
  })
})
