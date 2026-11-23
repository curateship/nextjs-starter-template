import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { newSequenceEmail, type SequenceSteps } from "@/lib/broadcasts/sequence-graph"
import { sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import { automationExecutors } from "@/server/automations/executors"
import { executeWaitNode } from "@/server/automations/wait"
import {
  createWorkspaceAutomation,
  listWorkspaceAutomations,
  saveWorkspaceAutomation,
} from "@/server/automations/flows"
import { automationSectionCounts } from "@/server/automations/runs"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import {
  createSequence,
  deleteSequences,
  duplicateSequence,
  listSequences,
  saveSequence,
  sendSequenceTestEmail,
  startSequenceForRun,
} from "@/server/email/sequences"
import {
  customShellAutomations,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellContacts,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { setEmailProviderFactoryForTests } from "@/server/email/provider"

const emailSettings = vi.hoisted(() => ({
  getSendableEmailConfig: vi.fn<() => Promise<{ apiKey: string; from: string; fromEmail: string } | null>>(),
}))
vi.mock("@/server/email/settings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSendableEmailConfig: emailSettings.getSendableEmailConfig,
}))

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

async function addContact(label: string) {
  const contactId = uuid()
  await database.insert(customShellContacts).values({
    id: contactId,
    workspaceId,
    email: `${label}@example.test`,
    firstName: label,
    status: "subscribed",
    tags: [],
    createdAt: now(),
    updatedAt: now(),
  })
  return contactId
}

function readySteps(): SequenceSteps {
  return {
    emails: [
      { ...newSequenceEmail(true), id: "one", subject: "Welcome" },
      { ...newSequenceEmail(false), id: "two", subject: "Three days in", wait: { amount: 3, unit: "days" } },
    ],
  }
}

async function makeReadySequence() {
  const made = await createSequence(workspaceId, userId, "Welcome series", database)
  return saveSequence(workspaceId, { id: made.id, name: made.name, steps: readySteps() }, database)
}

/** A flow run about one person, as a segment start makes, stopped at its Send sequence step. */
function flowRun(subject: { contactId: string | null; label: string | null }): CustomShellAutomationRun {
  const timestamp = now()
  const run: CustomShellAutomationRun = {
    id: uuid(),
    automationId: uuid(),
    userId,
    workspaceId,
    status: "active",
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
    subjectLabel: subject.label,
    subjectContactId: subject.contactId,
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
  return run
}

async function sequenceRuns(sequenceId: string) {
  return database.select().from(customShellAutomationRuns).where(eq(customShellAutomationRuns.automationId, sequenceId))
}

describe("sequences", () => {
  it("starts with one email and nothing about who gets it", async () => {
    const made = await createSequence(workspaceId, userId, "Welcome series", database)
    expect(made.steps).toEqual({ emails: [expect.objectContaining({ subject: "", wait: { amount: 0, unit: "days" } })] })
    expect(made.usedBy).toEqual([])
  })

  it("stays off the Automations dashboard, and flows stay off the Sequences tab", async () => {
    await makeReadySequence()
    await createWorkspaceAutomation(workspaceId, userId, "A canvas flow", database)

    expect((await listSequences(workspaceId, database)).map((row) => row.name)).toEqual(["Welcome series"])
    expect((await listWorkspaceAutomations(workspaceId, database)).map((row) => row.name)).toEqual(["A canvas flow"])
    expect((await automationSectionCounts(workspaceId, database)).automations).toBe(1)
  })

  it("cannot be saved from the canvas", async () => {
    const sequence = await makeReadySequence()
    const saved = await saveWorkspaceAutomation(
      workspaceId,
      { id: sequence.id, name: "Redrawn", graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } },
      database
    )
    expect(saved).toBeNull()
    expect((await listSequences(workspaceId, database))[0]?.steps?.emails).toHaveLength(2)
  })

  it("names the automations whose Send sequence step sends it", async () => {
    const sequence = await makeReadySequence()
    await createWorkspaceAutomation(workspaceId, userId, "New subscriber welcome", database, {
      nodes: [{ id: "send", kind: sendSequenceNode.kind, x: 0, y: 0, settings: { sequenceId: sequence.id, sequenceName: "Welcome series" } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    await createWorkspaceAutomation(workspaceId, userId, "Unrelated flow", database)
    expect((await listSequences(workspaceId, database))[0]?.usedBy.map((flow) => flow.name)).toEqual(["New subscriber welcome"])
  })

  it("may share a name with an automation, but not with another sequence", async () => {
    await createWorkspaceAutomation(workspaceId, userId, "test", database)
    const sequence = await createSequence(workspaceId, userId, "test", database)
    expect(sequence.name).toBe("test")
    await expect(createSequence(workspaceId, userId, "test", database)).rejects.toThrow("NAME_TAKEN")
  })

  it("copies as a sequence", async () => {
    const sequence = await makeReadySequence()
    const copy = await duplicateSequence(workspaceId, userId, sequence.id, database)
    expect(copy.name).toBe("Welcome series copy")
    expect(copy.steps?.emails).toHaveLength(2)
  })

  it("deletes sequences only, never a flow passed by mistake", async () => {
    const sequence = await makeReadySequence()
    const flow = await createWorkspaceAutomation(workspaceId, userId, "A canvas flow", database)
    expect(await deleteSequences(workspaceId, [sequence.id, flow.id], database)).toBe(1)
    expect(await listSequences(workspaceId, database)).toEqual([])
    expect(await listWorkspaceAutomations(workspaceId, database)).toHaveLength(1)
  })
})

describe("the Send sequence step", () => {
  it("starts the sequence for the run's person at email 1, once even if retried", async () => {
    const sequence = await makeReadySequence()
    const contactId = await addContact("newcomer")
    const run = flowRun({ contactId, label: "newcomer" })
    const settings = { sequenceId: sequence.id, sequenceName: "Welcome series" }

    const summary = await startSequenceForRun({ run, nodeId: "send", settings, now: now(), testRun: false }, database)
    await startSequenceForRun({ run, nodeId: "send", settings, now: now(), testRun: false }, database)

    expect(summary).toBe("Started “Welcome series” (2 emails) for newcomer.")
    const runs = await sequenceRuns(sequence.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual(expect.objectContaining({ subjectContactId: contactId, currentNodeId: "email-one", status: "active" }))
    expect(runs[0]!.configSnapshot?.edges).toEqual([
      expect.objectContaining({ from: "email-one", to: "wait-two" }),
      expect.objectContaining({ from: "wait-two", to: "email-two" }),
    ])
    expect((await listSequences(workspaceId, database))[0]?.inProgress).toBe(1)
  })

  it("carries on past a wait, although a sequence is never switched on", async () => {
    const sequence = await makeReadySequence()
    const run = flowRun({ contactId: await addContact("waiter"), label: "waiter" })
    await startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: sequence.id }, now: now(), testRun: false }, database)
    const [started] = await sequenceRuns(sequence.id)
    // The line the Wait wrote on the way in, as the engine records it.
    const timestamp = now()
    await database.insert(customShellAutomationRunSteps).values({
      id: uuid(),
      runId: started!.id,
      nodeId: "wait-two",
      kind: "wait",
      status: "completed",
      summary: "Waiting 3 days.",
      output: { waitingUntil: timestamp.toISOString() },
      startedAt: timestamp,
      finishedAt: timestamp,
    })

    const woke = await executeWaitNode({
      database,
      run: started!,
      nodeId: "wait-two",
      settings: { amount: 3, unit: "days", stopOnClick: false },
      now,
    })
    expect(woke).toEqual({ type: "next", summary: "Finished waiting." })
  })

  it("stops a run with no person and no Audience step, saying what to add", async () => {
    const sequence = await makeReadySequence()
    const run = flowRun({ contactId: null, label: null })
    await expect(
      startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: sequence.id }, now: now(), testRun: false }, database)
    ).rejects.toThrow("Put an Audience step before Send sequence, or start the flow with the Segment trigger.")
    expect(await sequenceRuns(sequence.id)).toEqual([])
  })

  it("stops on a sequence that was deleted, naming it", async () => {
    const sequence = await makeReadySequence()
    await deleteSequences(workspaceId, [sequence.id], database)
    const run = flowRun({ contactId: await addContact("late"), label: "late" })
    await expect(
      startSequenceForRun(
        { run, nodeId: "send", settings: { sequenceId: sequence.id, sequenceName: "Welcome series" }, now: now(), testRun: false },
        database
      )
    ).rejects.toThrow("The sequence “Welcome series” no longer exists")
  })

  it("stops on a sequence with an email not ready to send", async () => {
    const made = await createSequence(workspaceId, userId, "Half written", database)
    const run = flowRun({ contactId: await addContact("early"), label: "early" })
    await expect(
      startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: made.id }, now: now(), testRun: false }, database)
    ).rejects.toThrow("has an email that is not ready")
  })

  it("starts nothing in a dry run", async () => {
    const sequence = await makeReadySequence()
    const run = flowRun({ contactId: await addContact("dry"), label: "dry" })
    const result = await automationExecutors[sendSequenceNode.kind]!({
      database,
      run,
      nodeId: "send",
      settings: { sequenceId: sequence.id },
      now,
      dryRun: true,
    })
    expect(result.type).toBe("next")
    expect(await sequenceRuns(sequence.id)).toEqual([])
  })
})

/**
 * A flow run that went through an Audience step before Send sequence, stored
 * the way the engine stores it, so the step can find the Audience it follows.
 */
async function audienceFlowRun(audience: string, options: { testRecipientEmail?: string; contactId?: string } = {}) {
  const timestamp = now()
  const configSnapshot = {
    v: 1 as const,
    kind: "automation" as const,
    nodes: {
      audience: { kind: "audience", settings: { audience, planSlug: "", segmentId: "", segmentName: "", tag: "" } },
      send: { kind: "sendSequence", settings: {} },
    },
    edges: [{ from: "audience", sourcePort: "then", to: "send" }],
  }
  const flowId = uuid()
  await database.insert(customShellAutomations).values({
    id: flowId,
    workspaceId,
    userId,
    name: `Flow ${flowId}`,
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    compiledConfig: configSnapshot,
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const [run] = await database
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId: flowId,
      userId,
      workspaceId,
      status: "active",
      currentNodeId: "send",
      configSnapshot,
      wakeAt: timestamp,
      attempts: 0,
      subjectContactId: options.contactId ?? null,
      subjectLabel: options.contactId ? "tester" : null,
      testRun: Boolean(options.testRecipientEmail),
      testRecipientEmail: options.testRecipientEmail ?? null,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  await database.insert(customShellAutomationRunSteps).values({
    id: uuid(),
    runId: run!.id,
    nodeId: "audience",
    kind: "audience",
    status: "completed",
    attempts: 1,
    summary: "Matched people.",
    startedAt: timestamp,
    finishedAt: timestamp,
  })
  return run!
}

describe("Send sequence after an Audience step", () => {
  it("starts the sequence for everybody in the audience, each on their own run, once even if retried", async () => {
    const sequence = await makeReadySequence()
    const ids = [await addContact("ann"), await addContact("bo"), await addContact("cy")]
    const run = await audienceFlowRun("everyone")
    const settings = { sequenceId: sequence.id }

    const summary = await startSequenceForRun({ run, nodeId: "send", settings, now: now(), testRun: false }, database)
    await startSequenceForRun({ run, nodeId: "send", settings, now: now(), testRun: false }, database)

    expect(summary).toBe("Started “Welcome series” (2 emails) for 3 people.")
    const runs = await sequenceRuns(sequence.id)
    expect(runs.map((row) => row.subjectContactId).sort()).toEqual([...ids].sort())
    expect(runs.every((row) => row.currentNodeId === "email-one" && row.status === "active")).toBe(true)
    expect(runs.find((row) => row.subjectContactId === ids[0])?.subjectLabel).toBe("ann (ann@example.test)")
  })

  it("leaves anybody already partway through the sequence where they are on a second Run now", async () => {
    const sequence = await makeReadySequence()
    await addContact("ann")
    const settings = { sequenceId: sequence.id }
    await startSequenceForRun({ run: await audienceFlowRun("everyone"), nodeId: "send", settings, now: now(), testRun: false }, database)
    await addContact("late")

    const summary = await startSequenceForRun(
      { run: await audienceFlowRun("everyone"), nodeId: "send", settings, now: now(), testRun: false },
      database
    )

    expect(summary).toBe("Started “Welcome series” (2 emails) for 1 person. Skipped 1 person already in it.")
    expect(await sequenceRuns(sequence.id)).toHaveLength(2)
  })

  it("says so, without failing, when nobody new is left to start", async () => {
    const sequence = await makeReadySequence()
    const run = await audienceFlowRun("everyone")
    const summary = await startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: sequence.id }, now: now(), testRun: false }, database)
    expect(summary).toBe("Nobody new to start on “Welcome series”.")
  })

  it("skips accounts that never confirmed their email", async () => {
    const sequence = await makeReadySequence()
    await insertUser(database, { email: "unconfirmed@example.test", emailVerifiedAt: null })
    const run = await audienceFlowRun("accounts")
    const summary = await startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: sequence.id }, now: now(), testRun: false }, database)
    expect(summary).toContain("Skipped 1 person who never confirmed their email.")
    expect((await sequenceRuns(sequence.id)).some((row) => row.subjectLabel?.includes("unconfirmed"))).toBe(false)
  })

  it("starts only the tester on a test run, never the whole audience", async () => {
    const sequence = await makeReadySequence()
    await addContact("ann")
    await addContact("bo")
    const tester = await addContact("tester")
    const run = await audienceFlowRun("everyone", { testRecipientEmail: "admin@example.test", contactId: tester })

    await startSequenceForRun({ run, nodeId: "send", settings: { sequenceId: sequence.id }, now: now(), testRun: true }, database)

    const runs = await sequenceRuns(sequence.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual(expect.objectContaining({ subjectContactId: tester, testRun: true }))
  })
})

describe("Send myself a test", () => {
  const sent: Array<{ from: string; to: string; subject: string; html: string }> = []
  beforeEach(() => {
    sent.length = 0
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "test-key-for-unsubscribe-links")
    emailSettings.getSendableEmailConfig.mockResolvedValue({
      apiKey: "re_test",
      from: "Flowfly <hello@flowfly.test>",
      fromEmail: "hello@flowfly.test",
    })
    setEmailProviderFactoryForTests(() => ({
      send: async (params: { from: string; to: string; subject: string; html: string }) => {
        sent.push(params)
        return { success: true, messageId: "m1" }
      },
    }))
  })
  afterEach(() => {
    setEmailProviderFactoryForTests(null)
    vi.unstubAllEnvs()
  })

  it("sends the chosen email, as saved, to the address given and nobody else", async () => {
    const sequence = await makeReadySequence()
    const result = await sendSequenceTestEmail(
      workspaceId,
      { sequenceId: sequence.id, emailId: "two", toEmail: "admin@example.test" },
      database
    )
    expect(result).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe("admin@example.test")
    expect(sent[0]!.subject).toBe("[TEST] Three days in")
    expect(sent[0]!.from).toBe("Flowfly <hello@flowfly.test>")
    // Nobody is started on the sequence.
    expect(await database.select().from(customShellAutomationRuns)).toHaveLength(0)
  })

  it("refuses an email that is not in the sequence", async () => {
    const sequence = await makeReadySequence()
    await expect(
      sendSequenceTestEmail(workspaceId, { sequenceId: sequence.id, emailId: "nope", toEmail: "a@example.test" }, database)
    ).rejects.toThrow("EMAIL_GONE")
    expect(sent).toHaveLength(0)
  })

  it("sends nothing when email is not set up, and says the from address is missing", async () => {
    emailSettings.getSendableEmailConfig.mockResolvedValue(null)
    const sequence = await makeReadySequence()
    await expect(
      sendSequenceTestEmail(workspaceId, { sequenceId: sequence.id, emailId: "one", toEmail: "a@example.test" }, database)
    ).rejects.toThrow("EMAIL_FROM_MISSING")
    expect(sent).toHaveLength(0)
  })
})
