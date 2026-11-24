import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH, type AutomationGraph } from "@/lib/automations/graph"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import { waitNode } from "@/lib/automations/nodes/wait"
import type { AutomationRunStatus } from "@/lib/automations/run"
import { now, uuid } from "@/server/auth/security"
import { runAutomationTick, startAutomationRun } from "@/server/automations/engine"
import { pauseAutomation, resumeAutomation, stopAutomation } from "@/server/automations/flow-control"
import { setAutomationEnabled } from "@/server/automations/flows"
import { liveFlowReport, peopleInLiveFlows } from "@/server/automations/live-flow"
import { alertStalledFlows } from "@/server/automations/stalls"
import type { CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomationSegmentEnrollments,
  customShellAutomations,
  customShellContactSegmentMembers,
  customShellContactSegments,
  customShellContacts,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * Pause, Resume and Stop on one live flow (Tyler, 24 Nov 2026), against a
 * real database: a Segment start, then a Wait, on a flow whose people may
 * also be on a sequence it started.
 */

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let userId: string
let segmentId: string
let flowId: string
let sequenceId: string

const HOUR = 3_600_000

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  userId = (await insertUser(database, { role: "admin", name: "Tyler" })).id
  const timestamp = now()

  segmentId = uuid()
  await database.insert(customShellContactSegments).values({
    id: segmentId,
    workspaceId,
    name: "Newsletter",
    kind: "static",
    rules: { conditions: [] },
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  // A Wait rather than an email, so walking the flow sends nothing.
  const graph: AutomationGraph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      { id: "start", kind: segmentDripNode.kind, x: 0, y: 0, settings: { segmentId, segmentName: "Newsletter" } },
      { id: "wait", kind: waitNode.kind, x: 200, y: 0, settings: { amount: 2, unit: "days", stopOnClick: false } },
    ],
    edges: [{ id: "e1", from: "start", sourcePort: "then", to: "wait" }],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  flowId = uuid()
  sequenceId = uuid()
  await database.insert(customShellAutomations).values([
    {
      id: flowId,
      workspaceId,
      userId,
      name: "Newsletter welcome",
      graph,
      compiledConfig: compiled.config,
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: sequenceId,
      workspaceId,
      userId,
      kind: "sequence",
      name: "Welcome series",
      graph,
      compiledConfig: compiled.config,
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])
})

afterEach(async () => {
  await client.close()
})

async function addContact(label: string) {
  const contactId = uuid()
  const timestamp = now()
  await database.insert(customShellContacts).values({
    id: contactId,
    workspaceId,
    email: `${label}@example.test`,
    firstName: label,
    status: "subscribed",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(customShellContactSegmentMembers).values({ segmentId, contactId, createdAt: timestamp })
  return contactId
}

async function flowConfig() {
  const [flow] = await database.select().from(customShellAutomations).where(eq(customShellAutomations.id, flowId))
  return flow.compiledConfig!
}

/** One run written straight in, as the engine would have left it. */
async function insertRun(values: {
  automationId?: string
  status?: AutomationRunStatus
  node: string
  wakeAt?: Date
  contactId?: string | null
  triggerKind?: string
  triggerKey?: string | null
  test?: boolean
}) {
  const timestamp = now()
  const id = uuid()
  await database.insert(customShellAutomationRuns).values({
    id,
    automationId: values.automationId ?? flowId,
    userId,
    workspaceId,
    status: values.status ?? "active",
    currentNodeId: values.node,
    configSnapshot: await flowConfig(),
    wakeAt: values.wakeAt ?? timestamp,
    subjectContactId: values.contactId ?? null,
    subjectUserId: values.test ? userId : null,
    subjectLabel: values.contactId ? "Someone" : null,
    testRun: values.test ?? false,
    testRecipientEmail: values.test ? "admin@example.test" : null,
    triggerKind: values.triggerKind ?? segmentDripNode.kind,
    triggerKey: values.triggerKey === undefined ? (values.contactId ? `${segmentDripNode.kind}:${values.contactId}` : null) : values.triggerKey,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

/** A person put on the sequence by one of the flow's runs. */
async function onSequence(flowRunId: string, wakeAt = new Date(Date.now() - 2 * HOUR)) {
  return insertRun({
    automationId: sequenceId,
    node: "wait",
    wakeAt,
    triggerKind: sendSequenceNode.kind,
    triggerKey: `run:${flowRunId}:send:c:x`,
  })
}

async function run(id: string) {
  const [row] = await database.select().from(customShellAutomationRuns).where(eq(customShellAutomationRuns.id, id))
  return row
}

async function stepsOf(id: string) {
  return database.select().from(customShellAutomationRunSteps).where(eq(customShellAutomationRunSteps.runId, id))
}

async function goLive() {
  await setAutomationEnabled(workspaceId, flowId, true, database)
}

describe("Pause", () => {
  it("holds the flow's people and those on the sequences it started, but not a test", async () => {
    await goLive()
    const due = await insertRun({ node: "wait", wakeAt: new Date(Date.now() - 2 * HOUR), contactId: await addContact("ann") })
    const sequenceRun = await onSequence(due)
    const test = await insertRun({ node: "wait", wakeAt: new Date(Date.now() - 1000), test: true })
    await pauseAutomation(workspaceId, flowId, userId, database)

    await runAutomationTick(database)

    expect(await stepsOf(due)).toHaveLength(0)
    expect(await stepsOf(sequenceRun)).toHaveLength(0)
    expect(await run(due)).toMatchObject({ status: "active", currentNodeId: "wait", claimToken: null })
    expect(await run(sequenceRun)).toMatchObject({ status: "active", currentNodeId: "wait", claimToken: null })
    expect((await stepsOf(test)).length).toBeGreaterThan(0)
  })

  it("lets a new arrival in and holds them at the first step", async () => {
    await goLive()
    await pauseAutomation(workspaceId, flowId, userId, database)
    const contactId = await addContact("bo")

    await runAutomationTick(database)

    const [arrived] = await database
      .select()
      .from(customShellAutomationRuns)
      .where(and(eq(customShellAutomationRuns.automationId, flowId), eq(customShellAutomationRuns.subjectContactId, contactId)))
    expect(arrived).toMatchObject({ status: "active", currentNodeId: "start" })
    expect(await stepsOf(arrived.id)).toHaveLength(0)
  })

  it("rings no stall bell, and says Paused on the panel and the list", async () => {
    await goLive()
    await insertRun({ node: "wait", wakeAt: new Date(Date.now() - 2 * HOUR), contactId: await addContact("cy") })
    await pauseAutomation(workspaceId, flowId, userId, database)

    expect(await alertStalledFlows(database, { force: true })).toBe(0)
    const report = (await liveFlowReport(workspaceId, flowId, {}, database))!
    expect(report.paused).toBe(true)
    expect(await peopleInLiveFlows(workspaceId, database)).toEqual({ [flowId]: { people: 1, paused: true } })
  })

  it("is refused on a flow that is not live", async () => {
    await expect(pauseAutomation(workspaceId, flowId, userId, database)).rejects.toThrow("NOT_LIVE")
  })

  it("refuses a run started by hand, which would only wait at the first step", async () => {
    await goLive()
    await pauseAutomation(workspaceId, flowId, userId, database)
    await expect(startAutomationRun(workspaceId, userId, flowId, database)).rejects.toThrow("FLOW_PAUSED")
  })
})

describe("Resume", () => {
  it("lets everyone carry on, restarts the late clock and moves approval deadlines on", async () => {
    await goLive()
    const held = await insertRun({ node: "wait", wakeAt: new Date(Date.now() - 2 * HOUR), contactId: await addContact("dee") })
    const approval = await insertRun({ node: "wait", status: "waiting_approval" })
    const deadline = new Date(Date.now() + HOUR)
    await database.update(customShellAutomationRuns).set({ approvalDeadlineAt: deadline }).where(eq(customShellAutomationRuns.id, approval))
    await pauseAutomation(workspaceId, flowId, userId, database)
    // As if the pause had lasted three hours.
    await database
      .update(customShellAutomations)
      .set({ pausedAt: new Date(Date.now() - 3 * HOUR) })
      .where(eq(customShellAutomations.id, flowId))

    const resumed = await resumeAutomation(workspaceId, flowId, database)

    expect(resumed.pausedAt).toBeNull()
    expect((await run(held)).wakeAt.getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect((await run(approval)).approvalDeadlineAt!.getTime()).toBeGreaterThan(deadline.getTime() + 3 * HOUR - 60_000)
    expect(await alertStalledFlows(database, { force: true })).toBe(0)

    await runAutomationTick(database)
    expect((await stepsOf(held)).length).toBeGreaterThan(0)
  })
})

describe("Stop", () => {
  it("ends the flow's runs and its sequences', switches it off, and lets everyone it ended start over", async () => {
    await goLive()
    const midFlow = await addContact("eve")
    const midSequence = await addContact("fay")
    const allDone = await addContact("gus")
    for (const contactId of [midFlow, midSequence, allDone]) {
      await database
        .insert(customShellAutomationSegmentEnrollments)
        .values({ automationId: flowId, contactId, startedAt: now() })
    }
    // Still on the flow's own steps.
    const waiting = await insertRun({ node: "wait", wakeAt: new Date(Date.now() + HOUR), contactId: midFlow })
    // Past the flow's steps and partway through the sequence it started.
    const handedOn = await insertRun({ node: "wait", status: "completed", contactId: midSequence })
    const onTheSequence = await onSequence(handedOn, new Date(Date.now() + HOUR))
    // Through the flow and every email of the sequence.
    const finished = await insertRun({ node: "wait", status: "completed", contactId: allDone })
    const sequenceDone = await onSequence(finished)
    await database.update(customShellAutomationRuns).set({ status: "completed" }).where(eq(customShellAutomationRuns.id, sequenceDone))
    await pauseAutomation(workspaceId, flowId, userId, database)

    const off = await stopAutomation(workspaceId, flowId, database)

    expect(off).toMatchObject({ enabled: false, pausedAt: null })
    expect(await run(waiting)).toMatchObject({ status: "canceled", triggerKey: null })
    expect((await run(waiting)).finishedAt).not.toBeNull()
    expect(await run(onTheSequence)).toMatchObject({ status: "canceled" })
    expect(await run(handedOn)).toMatchObject({ status: "completed", triggerKey: null })
    expect(await run(finished)).toMatchObject({ status: "completed", triggerKey: `${segmentDripNode.kind}:${allDone}` })
    expect(await run(sequenceDone)).toMatchObject({ status: "completed" })
    const remembered = await database
      .select({ contactId: customShellAutomationSegmentEnrollments.contactId })
      .from(customShellAutomationSegmentEnrollments)
      .where(eq(customShellAutomationSegmentEnrollments.automationId, flowId))
    expect(remembered).toEqual([{ contactId: allDone }])

    // Run again: both people Stop ended come in from the top, the one who had everything does not.
    await goLive()
    await runAutomationTick(database)
    const runsNow = await database
      .select({ contactId: customShellAutomationRuns.subjectContactId })
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, flowId))
    const count = (contactId: string) => runsNow.filter((row) => row.contactId === contactId).length
    expect(count(midFlow)).toBe(2)
    expect(count(midSequence)).toBe(2)
    expect(count(allDone)).toBe(1)
  })

  it("ends a sequence run its flow run started after the Stop had already landed", async () => {
    const flowRun = await insertRun({ node: "wait", status: "canceled" })
    const late = await onSequence(flowRun)

    await runAutomationTick(database)

    expect(await run(late)).toMatchObject({ status: "canceled" })
    expect(await stepsOf(late)).toHaveLength(0)
  })

  it("is refused on a flow that is not live", async () => {
    await expect(stopAutomation(workspaceId, flowId, database)).rejects.toThrow("NOT_LIVE")
  })
})
