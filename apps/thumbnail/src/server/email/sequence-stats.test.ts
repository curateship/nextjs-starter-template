import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { newSequenceEmail, type SequenceSteps } from "@/lib/broadcasts/sequence-graph"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { sequenceProgressForFlowRuns, sequenceStats } from "@/server/email/sequence-stats"
import { createSequence, saveSequence, startSequenceForRun } from "@/server/email/sequences"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellContacts,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let userId: string

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  userId = (await insertUser(database, { role: "admin" })).id
})

afterEach(async () => {
  await client.close()
})

const steps = (): SequenceSteps => ({
  emails: [
    { ...newSequenceEmail(true), id: "one", subject: "Welcome" },
    { ...newSequenceEmail(false), id: "two", subject: "Day three", wait: { amount: 3, unit: "days" } },
    { ...newSequenceEmail(false), id: "three", subject: "Last one", wait: { amount: 3, unit: "days" } },
  ],
})

async function makeSequence() {
  const made = await createSequence(workspaceId, userId, "Welcome series", database)
  return saveSequence(workspaceId, { id: made.id, name: made.name, steps: steps() }, database)
}

async function addContact(label: string, status = "subscribed") {
  const id = uuid()
  await database.insert(customShellContacts).values({
    id,
    workspaceId,
    email: `${label}@example.test`,
    firstName: label,
    status,
    tags: [],
    createdAt: now(),
    updatedAt: now(),
  })
  return id
}

/** A flow run about one person, as a Segment trigger makes. */
function flowRun(contactId: string, label: string): CustomShellAutomationRun {
  const timestamp = now()
  return {
    id: uuid(),
    automationId: uuid(),
    userId,
    workspaceId,
    status: "completed",
    currentNodeId: "send",
    configSnapshot: { v: 1, kind: "automation", nodes: {}, edges: [] },
    wakeAt: timestamp,
    attempts: 0,
    claimToken: null,
    claimedAt: null,
    error: null,
    approvalNodeId: null,
    approvalSummary: null,
    approvalDeadlineAt: null,
    approvalDecision: null,
    approvalDecidedAt: null,
    approvalDecidedBy: null,
    subjectUserId: null,
    subjectLabel: label,
    subjectContactId: contactId,
    testRun: false,
    testRecipientEmail: null,
    triggerKind: "joinedSegment",
    triggerKey: null,
    triggerFacts: null,
    startedAt: timestamp,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** Puts one person into the sequence and hands back their sequence run. */
async function enrol(sequenceId: string, label: string, options: { status?: string; testRun?: boolean } = {}) {
  const contactId = await addContact(label, options.status)
  const run = flowRun(contactId, label)
  if (options.testRun) {
    run.testRun = true
    run.testRecipientEmail = "admin@example.test"
  }
  await startSequenceForRun({ run, nodeId: "send", settings: { sequenceId }, now: now(), testRun: Boolean(options.testRun) }, database)
  const [started] = await database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.subjectContactId, contactId))
  return { flowRunId: run.id, run: started!, contactId }
}

/** One of the run's emails as the Send email step writes it, plus what happened after. */
async function sent(
  run: CustomShellAutomationRun,
  email: "one" | "two" | "three",
  stamps: Partial<Record<"deliveredAt" | "openedAt" | "clickedAt" | "bouncedAt" | "complainedAt" | "unsubscribedAt", Date>> = {},
  status: "sent" | "failed" = "sent"
) {
  await database.insert(customShellAutomationDeliveries).values({
    id: uuid(),
    runId: run.id,
    nodeId: `email-${email}`,
    contactId: run.subjectContactId,
    toEmail: `${run.subjectLabel}@example.test`,
    subject: email,
    status,
    createdAt: now(),
    ...stamps,
  })
}

describe("sequenceStats", () => {
  it("counts people, finished and each email's outcomes, leaving test runs out", async () => {
    const sequence = await makeSequence()
    const ann = await enrol(sequence.id, "ann")
    const bo = await enrol(sequence.id, "bo")
    const tester = await enrol(sequence.id, "tester", { testRun: true })
    const at = now()
    await sent(ann.run, "one", { deliveredAt: at, openedAt: at, clickedAt: at })
    await sent(ann.run, "two", { deliveredAt: at, unsubscribedAt: at })
    await sent(bo.run, "one", { bouncedAt: at })
    await sent(tester.run, "one", { openedAt: at })
    await database
      .update(customShellAutomationRuns)
      .set({ status: "completed" })
      .where(eq(customShellAutomationRuns.id, ann.run.id))
    // Bo has had Email 1 and waits out the gap before Email 2; Cy has had nothing yet.
    await database
      .update(customShellAutomationRuns)
      .set({ currentNodeId: "wait-two" })
      .where(eq(customShellAutomationRuns.id, bo.run.id))
    await enrol(sequence.id, "cy")

    const stats = await sequenceStats(workspaceId, sequence.id, database)

    expect(stats.people).toBe(3)
    expect(stats.finished).toBe(1)
    expect(stats.byEmail["email-one"]).toEqual({ sent: 2, opened: 1, clicked: 1, bounced: 1, complained: 0, unsubscribed: 0, waiting: 1 })
    expect(stats.byEmail["email-two"]).toEqual({ sent: 1, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 1, waiting: 1 })
    expect(stats.byEmail["email-three"]).toBeUndefined()
    expect(stats.totals).toEqual({ sent: 3, opened: 1, clicked: 1, bounced: 1, complained: 0, unsubscribed: 1, waiting: 2 })
  })

  it("refuses another site's sequence", async () => {
    const sequence = await makeSequence()
    const other = (await insertWorkspace(database)).id
    await expect(sequenceStats(other, sequence.id, database)).rejects.toThrow("NOT_FOUND")
  })
})

describe("a flow's Runs tab", () => {
  it("finds the sequence each flow run started, through its key", async () => {
    const sequence = await makeSequence()
    const ann = await enrol(sequence.id, "ann")
    await sent(ann.run, "one", { clickedAt: now() })
    const bo = await enrol(sequence.id, "bo")

    const progress = await sequenceProgressForFlowRuns([ann.flowRunId, bo.flowRunId, uuid()], database)

    expect(progress.get(ann.flowRunId)).toEqual({ people: 1, emailsSent: 1, emailsTotal: 3, status: "clicked" })
    expect(progress.get(bo.flowRunId)).toEqual({ people: 1, emailsSent: 0, emailsTotal: 3, status: "waiting" })
    expect(progress.size).toBe(2)
  })

  it("gives each person the first word that fits, in Tyler's order", async () => {
    const sequence = await makeSequence()
    const at = now()
    const cases: [string, Parameters<typeof sent>[2], string | undefined, string][] = [
      ["complainer", { openedAt: at, complainedAt: at }, undefined, "complained"],
      ["bouncer", { clickedAt: at, bouncedAt: at }, undefined, "bounced"],
      ["leaver", { clickedAt: at }, "unsubscribed", "unsubscribed"],
      ["clicker", { openedAt: at, clickedAt: at }, undefined, "clicked"],
      ["opener", { deliveredAt: at, openedAt: at }, undefined, "opened"],
      ["arrived", { deliveredAt: at }, undefined, "delivered"],
      ["gone", {}, undefined, "sent"],
    ]
    const flowRunIds: Record<string, string> = {}
    for (const [label, stamps, status] of cases) {
      const person = await enrol(sequence.id, label, { status })
      await sent(person.run, "one", stamps)
      flowRunIds[label] = person.flowRunId
    }

    const progress = await sequenceProgressForFlowRuns(Object.values(flowRunIds), database)

    for (const [label, , , expected] of cases) expect(progress.get(flowRunIds[label]!)?.status).toBe(expected)
  })
})
