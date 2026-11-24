import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_DRIP_CONFIG, type DripConfig } from "@/lib/broadcasts/drip"
import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH, type AutomationGraph } from "@/lib/automations/graph"
import { dripNode, dripStepSettings } from "@/lib/automations/nodes/drip"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import type { AutomationRunStatus } from "@/lib/automations/run"
import { newSequenceEmail } from "@/lib/broadcasts/sequence-graph"
import { now, uuid } from "@/server/auth/security"
import { runAutomationTick } from "@/server/automations/engine"
import { setAutomationEnabled } from "@/server/automations/flows"
import { describeActivity, liveFlowReport, peopleInFlows, splitSubjectLabel } from "@/server/automations/live-flow"
import { alertStalledFlows } from "@/server/automations/stalls"
import type { CustomShellDb } from "@/server/db"
import { createSequence, saveSequence } from "@/server/email/sequences"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellContactSegmentMembers,
  customShellContactSegments,
  customShellContacts,
  customShellNotifications,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * A live flow's right panel against a real database: Segment start, Drip, then
 * Send sequence, the flow Tyler described on 23 Nov 2026.
 */

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let userId: string
let segmentId: string
let sequenceId: string
let flowId: string

const HOUR = 3_600_000
const PACE: DripConfig = { ...DEFAULT_DRIP_CONFIG, enabled: true, batchSizeMin: 4, batchSizeMax: 4, timezone: "UTC" }

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  userId = (await insertUser(database, { role: "admin" })).id
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

  const made = await createSequence(workspaceId, userId, "Welcome series", database)
  await saveSequence(
    workspaceId,
    {
      id: made.id,
      name: made.name,
      steps: {
        emails: [
          { ...newSequenceEmail(true), id: "one", subject: "Welcome" },
          { ...newSequenceEmail(false), id: "two", subject: "Day three", wait: { amount: 3, unit: "days" } },
          { ...newSequenceEmail(false), id: "three", subject: "Last one", wait: { amount: 3, unit: "days" } },
        ],
      },
    },
    database
  )
  sequenceId = made.id

  const graph: AutomationGraph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      { id: "start", kind: segmentDripNode.kind, x: 0, y: 0, settings: { segmentId, segmentName: "Newsletter" } },
      { id: "drip", kind: dripNode.kind, x: 200, y: 0, settings: dripStepSettings(PACE) },
      { id: "send", kind: sendSequenceNode.kind, x: 400, y: 0, settings: { sequenceId, sequenceName: "Welcome series" } },
    ],
    edges: [
      { id: "e1", from: "start", sourcePort: "then", to: "drip" },
      { id: "e2", from: "drip", sourcePort: "then", to: "send" },
    ],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  flowId = uuid()
  await database.insert(customShellAutomations).values({
    id: flowId,
    workspaceId,
    userId,
    name: "Newsletter welcome",
    graph,
    compiledConfig: compiled.config,
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
})

afterEach(async () => {
  await client.close()
})

async function addContact(label: string, options: { inSegment?: boolean; status?: string } = {}) {
  const contactId = uuid()
  const timestamp = now()
  await database.insert(customShellContacts).values({
    id: contactId,
    workspaceId,
    email: `${label}@example.test`,
    firstName: label,
    status: options.status ?? "subscribed",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  if (options.inSegment !== false) {
    await database.insert(customShellContactSegmentMembers).values({ segmentId, contactId, createdAt: timestamp })
  }
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
  startedAt?: Date
  finishedAt?: Date | null
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
    triggerKey: values.triggerKey ?? null,
    startedAt: values.startedAt ?? timestamp,
    finishedAt: values.finishedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

async function insertStep(runId: string, nodeId: string, status: "completed" | "failed", error?: string) {
  const timestamp = now()
  await database.insert(customShellAutomationRunSteps).values({
    id: uuid(),
    runId,
    nodeId,
    kind: "drip",
    status,
    summary: status === "failed" ? "It broke." : "Done.",
    error: error ?? null,
    startedAt: timestamp,
    finishedAt: timestamp,
  })
}

/**
 * Someone who went through the Drip onto the sequence: a finished flow run,
 * a sequence run at `at`, and the emails before it sent.
 */
async function onSequence(at: "wait-two" | "wait-three", label: string) {
  const contactId = await addContact(label, { inSegment: false })
  const flowRun = await insertRun({ status: "completed", node: "send", contactId })
  const sequenceRun = await insertRun({
    automationId: sequenceId,
    node: at,
    wakeAt: new Date(Date.now() + 48 * HOUR),
    contactId,
    triggerKind: sendSequenceNode.kind,
    triggerKey: `run:${flowRun}:send:c:${contactId}`,
  })
  const emails = at === "wait-two" ? ["one"] : ["one", "two"]
  for (const email of emails) {
    await database.insert(customShellAutomationDeliveries).values({
      id: uuid(),
      runId: sequenceRun,
      nodeId: `email-${email}`,
      contactId,
      toEmail: `${label}@example.test`,
      subject: email,
      status: "sent",
      openedAt: email === "one" && label.endsWith("0") ? now() : null,
      createdAt: now(),
    })
  }
}

describe("liveFlowReport", () => {
  it("counts each email's waiting as the people it goes to next, those held at the Drip included", async () => {
    // Tyler's 1,200 / 800 / 300 at a hundredth: 4 held at the Drip, 5 who
    // had Email 1, 3 who had Email 2 as well.
    for (let index = 0; index < 4; index += 1) {
      await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR), contactId: await addContact(`held-${index}`) })
    }
    for (let index = 0; index < 5; index += 1) await onSequence("wait-two", `one-${index}`)
    for (let index = 0; index < 3; index += 1) await onSequence("wait-three", `two-${index}`)

    const report = await liveFlowReport(workspaceId, flowId, {}, database)
    const sequence = report!.steps.find((step) => step.nodeId === "send")!.sequence!

    expect(sequence.missing).toBe(false)
    expect(sequence.people).toBe(8)
    expect(sequence.emails.map((email) => [email.number, email.subject, email.sent, email.waiting])).toEqual([
      [1, "Welcome", 8, 4],
      [2, "Day three", 3, 5],
      [3, "Last one", 0, 3],
    ])
    // Everyone not finished is counted once, beside one email.
    expect(sequence.emails.reduce((sum, email) => sum + email.waiting, 0)).toBe(12)
    expect(report!.inFlow).toBe(12)
    expect(sequence.emails[0].opened).toBe(2)
  })

  it("splits Running into working now and held, and leaves test runs out", async () => {
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR) })
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR) })
    await insertRun({ node: "start", wakeAt: new Date(Date.now() - 1000) })
    await insertRun({ node: "drip", status: "completed", startedAt: new Date(Date.now() - 2 * HOUR), finishedAt: now() })
    await insertRun({ node: "drip", status: "failed" })
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR), test: true })

    const { stats, steps } = (await liveFlowReport(workspaceId, flowId, {}, database))!
    expect(stats).toMatchObject({ total: 5, completed: 1, workingNow: 1, held: 2, waiting: 0, failed: 1, stopped: 0 })
    expect(stats.typicalSeconds).toBe(7200)
    expect(steps.map((step) => step.nodeId)).toEqual(["start", "drip", "send"])
    const drip = steps.find((step) => step.nodeId === "drip")!
    expect(drip.onNow).toBe(2)
    expect(drip.held).toBe(2)
    expect(drip.nextMoveAt).not.toBeNull()
    expect(drip.drip?.pace).toEqual({ size: "4", gap: "30–60 min", hours: "Any time", hoursNote: "of day" })
  })

  it("counts who passed and who failed a step, and keeps the newest error", async () => {
    const asleep = await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR) })
    await insertStep(asleep, "drip", "completed")
    const through = await insertRun({ node: "send", status: "completed" })
    await insertStep(through, "drip", "completed")
    await insertStep(through, "drip", "completed")
    const broke = await insertRun({ node: "drip", status: "failed" })
    await insertStep(broke, "drip", "failed", "The sequence no longer exists.")

    const drip = (await liveFlowReport(workspaceId, flowId, {}, database))!.steps.find((step) => step.nodeId === "drip")!
    expect(drip.passed).toBe(1)
    expect(drip.failed).toBe(1)
    expect(drip.lastError).toBe("The sequence no longer exists.")
  })

  it("narrows the totals to the period, never the numbers about now", async () => {
    await insertRun({ node: "drip", status: "completed", startedAt: new Date(Date.now() - 10 * 24 * HOUR), finishedAt: new Date() })
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR), startedAt: new Date(Date.now() - 10 * 24 * HOUR) })

    const { stats } = (await liveFlowReport(workspaceId, flowId, { since: new Date(Date.now() - 7 * 24 * HOUR) }, database))!
    expect(stats.total).toBe(0)
    expect(stats.completed).toBe(0)
    expect(stats.held).toBe(1)
  })

  it("tells people new since Run from people already in the segment, and counts who can never be let in", async () => {
    await addContact("ann")
    await addContact("bo")
    await addContact("gone", { status: "unsubscribed" })
    await setAutomationEnabled(workspaceId, flowId, true, database)
    await runAutomationTick(database)
    await addContact("cy")
    await runAutomationTick(database)

    const start = (await liveFlowReport(workspaceId, flowId, {}, database))!.steps[0]
    expect(start.segment).toMatchObject({ newSinceRun: 1, stillToGo: 0, cannotBeEmailed: 1 })
    expect(start.segment!.perDay).toHaveLength(7)
    expect(start.segment!.perDay.at(-1)!.letIn).toBe(3)
  })

  it("numbers the Drip's batches from 1 since Run was last pressed, newest first", async () => {
    const ranAt = new Date(Date.now() - 3 * HOUR)
    await database.update(customShellAutomations).set({ liveSince: ranAt }).where(eq(customShellAutomations.id, flowId))
    const place = async (releaseAt: Date) => {
      const runId = await insertRun({ node: "drip", wakeAt: releaseAt })
      await database.insert(customShellAutomationRunSteps).values({
        id: uuid(),
        runId,
        nodeId: "drip",
        kind: "drip",
        status: "completed",
        summary: "Waiting for its batch.",
        output: { releaseAt: releaseAt.toISOString() },
        startedAt: now(),
        finishedAt: now(),
      })
    }
    // Before Run: not counted.
    await place(new Date(Date.now() - 5 * HOUR))
    const first = new Date(Date.now() - 2 * HOUR)
    const second = new Date(Date.now() + HOUR)
    await place(first)
    await place(first)
    await place(second)

    const report = (await liveFlowReport(workspaceId, flowId, {}, database))!
    const drip = report.steps.find((step) => step.nodeId === "drip")!.drip!
    expect(drip.batches).toEqual([
      { releaseAt: second.toISOString(), size: 1, number: 2 },
      { releaseAt: first.toISOString(), size: 2, number: 1 },
    ])
    expect(report.recent.find((line) => line.until === second.toISOString())?.action).toBe("will go in batch 2")
  })

  it("is null for another site's flow", async () => {
    const other = (await insertWorkspace(database)).id
    expect(await liveFlowReport(other, flowId, {}, database)).toBeNull()
  })
})

describe("peopleInFlows", () => {
  it("counts the flow's own runs still going and the sequence runs it started", async () => {
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR) })
    await insertRun({ node: "drip", status: "completed" })
    await onSequence("wait-two", "ann")
    expect((await peopleInFlows([flowId], database)).get(flowId)).toBe(2)
  })
})

describe("alertStalledFlows", () => {
  it("tells admins once when somebody in a live flow is over an hour late, and again after it moved", async () => {
    await database.update(customShellAutomations).set({ enabled: true }).where(eq(customShellAutomations.id, flowId))
    const late = await insertRun({ node: "drip", wakeAt: new Date(Date.now() - 2 * HOUR) })
    // A Drip batch still to come is a planned hold, never late.
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() + HOUR) })

    expect(await alertStalledFlows(database, { force: true })).toBe(1)
    expect(await alertStalledFlows(database, { force: true })).toBe(0)
    const notices = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.type, "automation_stalled"))
    expect(notices).toHaveLength(1)
    expect(notices[0].automationRunId).toBe(late)
    expect(notices[0].message).toBe("Newsletter welcome has stopped moving")
    expect(notices[0].detail).toBe("1 person in it was due to move on over an hour ago and has not. Open the flow to see where.")

    await database.update(customShellAutomationRuns).set({ status: "completed" }).where(eq(customShellAutomationRuns.id, late))
    expect(await alertStalledFlows(database, { force: true })).toBe(0)
    const [flow] = await database.select().from(customShellAutomations).where(eq(customShellAutomations.id, flowId))
    expect(flow.stallAlertedAt).toBeNull()

    await insertRun({ node: "drip", wakeAt: new Date(Date.now() - 2 * HOUR) })
    expect(await alertStalledFlows(database, { force: true })).toBe(1)
  })

  it("says nothing about a flow that is off", async () => {
    await insertRun({ node: "drip", wakeAt: new Date(Date.now() - 2 * HOUR) })
    expect(await alertStalledFlows(database, { force: true })).toBe(0)
    const notices = await database
      .select()
      .from(customShellNotifications)
      .where(and(eq(customShellNotifications.type, "automation_stalled")))
    expect(notices).toHaveLength(0)
  })
})

describe("Recent activity's lines", () => {
  const step = {
    nodeId: "drip",
    status: "completed",
    summary: "Done.",
    output: null,
    stepName: "Drip",
    subject: null,
    runStatus: "active",
    runNodeId: "send",
  }

  it("splits a run's label into the name in bold and the address under it", () => {
    expect(splitSubjectLabel("Sample held-28 (sample-held-28@example.test)")).toEqual({
      name: "Sample held-28",
      email: "sample-held-28@example.test",
    })
    expect(splitSubjectLabel("ann@example.test")).toEqual({ name: "ann@example.test", email: null })
    expect(splitSubjectLabel(null)).toEqual({ name: null, email: null })
  })

  it("says what happened at each kind of step", () => {
    expect(describeActivity({ ...step, kind: "segmentDrip", nodeId: "start" })).toEqual({ kind: "letIn", action: "was let in from the segment" })
    expect(describeActivity({ ...step, kind: "drip", output: { releaseAt: "2099-01-01T09:00:00.000Z" } })).toEqual({ kind: "waiting", action: "is waiting for the batch on", until: "2099-01-01T09:00:00.000Z" })
    expect(describeActivity({ ...step, kind: "drip" })).toEqual({ kind: "movedOn", action: "went through the Drip" })
    expect(describeActivity({ ...step, kind: "drip", batch: 3, output: { releaseAt: "2099-01-01T09:00:00.000Z" } })).toEqual({ kind: "waiting", action: "will go in batch 3", until: "2099-01-01T09:00:00.000Z" })
    const asleep = { ...step, kind: "wait", nodeId: "wait-two", stepName: "Wait", output: { waitingUntil: "2099-01-03T09:00:00.000Z" } }
    expect(describeActivity({ ...asleep, nextEmail: 2 })).toEqual({ kind: "waiting", action: "will get email 2", until: "2099-01-03T09:00:00.000Z" })
    expect(describeActivity({ ...asleep, nextEmail: null })).toEqual({ kind: "waiting", action: "is waiting until", until: "2099-01-03T09:00:00.000Z" })
    expect(describeActivity({ ...step, kind: "drip", runStatus: "completed", runNodeId: "drip" })).toEqual({ kind: "stopped", action: "stopped at Drip" })
    expect(describeActivity({ ...step, kind: "sendEmail", nodeId: "email-one", subject: "Welcome", summary: "Emailed 1, 0 failed, 0 skipped." })).toEqual({ kind: "sent", action: "was sent “Welcome”" })
    expect(describeActivity({ ...step, kind: "sendEmail", nodeId: "email-one", subject: "Welcome", summary: "Emailed 0, 0 failed, the person could not receive email." })).toEqual({ kind: "notSent", action: "was not sent “Welcome”" })
    expect(describeActivity({ ...step, kind: "sendSequence", nodeId: "send", subject: "Welcome series" })).toEqual({ kind: "started", action: "was added to “Welcome series”" })
    expect(describeActivity({ ...step, kind: "webhook", stepName: "Webhook", status: "failed" })).toEqual({ kind: "failed", action: "hit a problem at Webhook" })
  })
})
