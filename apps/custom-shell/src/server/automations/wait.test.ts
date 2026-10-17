import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_DRIP_CONFIG,
  isWithinDripWindow,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { placeholderNode } from "@/lib/automations/nodes/placeholder"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { waitNode } from "@/lib/automations/nodes/wait"
import {
  runAutomationTick,
  startAutomationTestRun,
} from "@/server/automations/engine"
import { setAutomationEnabled } from "@/server/automations/flows"
import { runSegmentDripTriggers } from "@/server/automations/segment-drip"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { saveDripDefaults } from "@/server/email/settings"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellContactSegmentMembers,
  customShellContactSegments,
  customShellContacts,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let segmentId: string
let automationId: string
let ownerId: string

const DAY = 24 * 60 * 60 * 1000
const PACE: DripConfig = { ...DEFAULT_DRIP_CONFIG, timezone: "UTC" }

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  ownerId = (await insertUser(database, { role: "admin" })).id
  segmentId = uuid()
  const timestamp = now()
  await database.insert(customShellContactSegments).values({
    id: segmentId,
    workspaceId,
    name: "Pomoder list",
    kind: "static",
    rules: { conditions: [] },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await saveDripDefaults(workspaceId, PACE, database)
})

afterEach(async () => {
  await client.close()
})

/** Segment start, then a 2-day Wait, then a placeholder standing in for Email 2. */
async function insertSequence(stopOnClick = true) {
  const graph: AutomationGraph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      {
        id: "start",
        kind: segmentDripNode.kind,
        x: 0,
        y: 0,
        settings: { segmentId, segmentName: "Pomoder list" },
      },
      {
        id: "wait",
        kind: waitNode.kind,
        x: 200,
        y: 0,
        settings: { amount: 2, unit: "days", stopOnClick },
      },
      {
        id: "email-2",
        kind: placeholderNode.kind,
        x: 400,
        y: 0,
        settings: { note: "" },
      },
    ],
    edges: [
      { id: "e1", from: "start", sourcePort: "then", to: "wait" },
      { id: "e2", from: "wait", sourcePort: "then", to: "email-2" },
    ],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  automationId = uuid()
  const timestamp = now()
  await database.insert(customShellAutomations).values({
    id: automationId,
    workspaceId,
    userId: ownerId,
    name: "Pomoder sequence",
    graph,
    compiledConfig: compiled.config,
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function addToSegment(label: string, userId?: string) {
  const contactId = uuid()
  const timestamp = now()
  await database.insert(customShellContacts).values({
    id: contactId,
    workspaceId,
    userId,
    email: `${label}@example.test`,
    firstName: label,
    status: "subscribed",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(customShellContactSegmentMembers).values({
    segmentId,
    contactId,
    createdAt: timestamp,
  })
  return contactId
}

async function onlyRun() {
  const runs = await database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
  expect(runs).toHaveLength(1)
  return runs[0]
}

async function stepsOf(runId: string) {
  return database
    .select()
    .from(customShellAutomationRunSteps)
    .where(eq(customShellAutomationRunSteps.runId, runId))
    .orderBy(asc(customShellAutomationRunSteps.finishedAt))
}

/** Puts a sleeping run's wake-up time in the past, as two days passing would. */
async function wakeUp(runId: string) {
  await database
    .update(customShellAutomationRuns)
    .set({ wakeAt: new Date(Date.now() - 1000) })
    .where(eq(customShellAutomationRuns.id, runId))
}

/** Lets one person in and walks them up to the Wait, where they go to sleep. */
async function sleepingRun() {
  await addToSegment("sam")
  await setAutomationEnabled(workspaceId, automationId, true, database)
  await runAutomationTick(database)
  return onlyRun()
}

describe("Wait", () => {
  it("sleeps the run at the Wait for two days, then carries on", async () => {
    await insertSequence()
    const before = Date.now()
    const run = await sleepingRun()

    expect(run.status).toBe("active")
    expect(run.currentNodeId).toBe("wait")
    expect(run.claimToken).toBeNull()
    expect(run.wakeAt.getTime()).toBeGreaterThanOrEqual(before + 2 * DAY)
    expect(run.wakeAt.getTime()).toBeLessThan(Date.now() + 2 * DAY + 1000)
    const waiting = (await stepsOf(run.id)).at(-1)
    expect(waiting?.summary).toMatch(/^Waiting 2 days, until /)

    // Not due yet, so another pass leaves it alone.
    await runAutomationTick(database)
    expect((await onlyRun()).currentNodeId).toBe("wait")

    await wakeUp(run.id)
    await runAutomationTick(database)
    const done = await onlyRun()
    expect(done.status).toBe("completed")
    expect((await stepsOf(run.id)).map((step) => step.summary)).toEqual([
      "sam (sam@example.test) was let in from the segment.",
      waiting?.summary,
      "Finished waiting.",
      "Did nothing — this is a stand-in step.",
    ])
  })

  it("wakes at the next sending hour when the wait ends outside them", async () => {
    await insertSequence()
    await addToSegment("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    // Let the person in at any hour, so the Wait is the only thing keeping to
    // the hours below.
    await runSegmentDripTriggers(database)
    const pace = { ...PACE, windows: [{ start: "09:00", end: "10:00" }] }
    await saveDripDefaults(workspaceId, pace, database)

    await runAutomationTick(database)
    const asleep = await onlyRun()
    expect(asleep.currentNodeId).toBe("wait")
    expect(isWithinDripWindow(pace, asleep.wakeAt)).toBe(true)
    expect(asleep.wakeAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 2 * DAY - 60_000
    )
  })

  it("stops the rest of the flow for somebody who clicked a link", async () => {
    await insertSequence()
    const run = await sleepingRun()
    await database.insert(customShellAutomationDeliveries).values({
      id: uuid(),
      runId: run.id,
      nodeId: "start",
      contactId: run.subjectContactId,
      toEmail: "sam@example.test",
      subject: "I built a timer that keeps you company",
      status: "sent",
      clickedAt: now(),
      createdAt: now(),
    })

    await wakeUp(run.id)
    await runAutomationTick(database)
    expect((await onlyRun()).status).toBe("completed")
    const summaries = (await stepsOf(run.id)).map((step) => step.summary)
    expect(summaries.at(-1)).toBe(
      'Clicked a link in "I built a timer that keeps you company", so the rest of this flow stopped.'
    )
    expect(summaries).not.toContain("Did nothing — this is a stand-in step.")
  })

  it("carries on after a click when the switch is off", async () => {
    await insertSequence(false)
    const run = await sleepingRun()
    await database.insert(customShellAutomationDeliveries).values({
      id: uuid(),
      runId: run.id,
      nodeId: "start",
      contactId: run.subjectContactId,
      toEmail: "sam@example.test",
      subject: "Email 1",
      status: "sent",
      clickedAt: now(),
      createdAt: now(),
    })

    await wakeUp(run.id)
    await runAutomationTick(database)
    const summaries = (await stepsOf(run.id)).map((step) => step.summary)
    expect(summaries.at(-1)).toBe("Did nothing — this is a stand-in step.")
  })

  it("stops everyone at their next wait once the flow is switched off", async () => {
    await insertSequence()
    const run = await sleepingRun()
    await setAutomationEnabled(workspaceId, automationId, false, database)

    await wakeUp(run.id)
    await runAutomationTick(database)
    expect((await onlyRun()).status).toBe("completed")
    expect((await stepsOf(run.id)).at(-1)?.summary).toBe(
      "The flow was switched off while this run waited, so the rest of it stopped."
    )
  })

  it("does not wait in a test with one member", async () => {
    await insertSequence()
    const member = await insertUser(database, { name: "Sam Member" })
    const test = await startAutomationTestRun(
      workspaceId,
      ownerId,
      automationId,
      member.id,
      database
    )
    await runAutomationTick(database)

    const [run] = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.id, test.id))
    expect(run.status).toBe("completed")
    expect((await stepsOf(run.id)).map((step) => step.summary)).toContain(
      "Would wait 2 days. Skipped in this test."
    )
  })
})
