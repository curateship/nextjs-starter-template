import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_DRIP_CONFIG, type DripConfig } from "@/lib/broadcasts/drip"
import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { placeholderNode } from "@/lib/automations/nodes/placeholder"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { setAutomationEnabled } from "@/server/automations/flows"
import {
  runSegmentDripTriggers,
  segmentDripNextBatchAt,
  segmentDripProgress,
} from "@/server/automations/segment-drip"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { saveDripDefaults } from "@/server/email/settings"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
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
let contactCount = 0

/** A Monday, far enough out that no real clock ever reaches it. */
const MONDAY_NOON = new Date("2099-01-05T12:00:00.000Z")
const MINUTE = 60_000

const PACE: DripConfig = {
  ...DEFAULT_DRIP_CONFIG,
  batchSizeMin: 2,
  batchSizeMax: 2,
  waitMinMinutes: 30,
  waitMaxMinutes: 30,
  timezone: "UTC",
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  segmentId = uuid()
  contactCount = 0
  const owner = await insertUser(database, { role: "admin" })
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
        id: "next",
        kind: placeholderNode.kind,
        x: 200,
        y: 0,
        settings: { note: "" },
      },
    ],
    edges: [{ id: "edge", from: "start", sourcePort: "then", to: "next" }],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  automationId = uuid()
  await database.insert(customShellAutomations).values({
    id: automationId,
    workspaceId,
    userId: owner.id,
    name: "Pomoder sequence",
    graph,
    compiledConfig: compiled.config,
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await saveDripDefaults(workspaceId, PACE, database)
})

afterEach(async () => {
  await client.close()
})

/** A contact in the segment. Each one is a minute newer than the last. */
async function addToSegment(
  label: string,
  status: "subscribed" | "unsubscribed" | "cold" = "subscribed"
) {
  const contactId = uuid()
  contactCount += 1
  const createdAt = new Date(
    Date.UTC(2026, 0, 1) + contactCount * MINUTE
  )
  await database.insert(customShellContacts).values({
    id: contactId,
    workspaceId,
    email: `${label}@example.test`,
    firstName: label,
    status,
    tags: [],
    createdAt,
    updatedAt: createdAt,
  })
  await database.insert(customShellContactSegmentMembers).values({
    segmentId,
    contactId,
    createdAt,
  })
  return contactId
}

async function letInContactIds() {
  const rows = await database
    .select({ contactId: customShellAutomationRuns.subjectContactId })
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
  return rows.map((row) => row.contactId)
}

async function flow() {
  const [row] = await database
    .select()
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, automationId))
  return row
}

const at = (minutes: number) =>
  new Date(MONDAY_NOON.getTime() + minutes * MINUTE)
const tick = (minutes: number) =>
  runSegmentDripTriggers(database, { timestamp: at(minutes) })

describe("Segment, a few at a time", () => {
  it("lets the people already there in one batch at a time, oldest first", async () => {
    const first = await addToSegment("first")
    const second = await addToSegment("second")
    const third = await addToSegment("third")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    expect(await tick(0)).toBe(2)
    expect(await letInContactIds()).toEqual(
      expect.arrayContaining([first, second])
    )

    // The thirty-minute gap has not passed.
    expect(await tick(29)).toBe(0)
    expect(await tick(30)).toBe(1)
    expect(await letInContactIds()).toContain(third)
    expect(await tick(90)).toBe(0)
  })

  it("starts one run per person, about that person", async () => {
    const contactId = await addToSegment("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await tick(0)

    const [run] = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, automationId))
    expect(run).toMatchObject({
      status: "active",
      currentNodeId: "start",
      subjectContactId: contactId,
      subjectLabel: "sam (sam@example.test)",
      triggerKind: segmentDripNode.kind,
    })
  })

  it("never lets in an opted-out person, and lets in somebody gone quiet", async () => {
    await addToSegment("gone", "unsubscribed")
    const quiet = await addToSegment("quiet", "cold")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    expect(await tick(0)).toBe(1)
    expect(await letInContactIds()).toEqual([quiet])
  })

  it("sends nobody outside the sending hours or at the weekend", async () => {
    await saveDripDefaults(
      workspaceId,
      { ...PACE, windows: [{ start: "09:00", end: "11:00" }], skipWeekends: true },
      database
    )
    await addToSegment("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    // Monday noon is after the window closes.
    expect(await tick(0)).toBe(0)
    // Saturday 10am is inside the hours but on a weekend.
    expect(await tick(5 * 24 * 60 - 2 * 60)).toBe(0)
    // Tuesday 9am.
    expect(await tick(21 * 60)).toBe(1)
  })

  it("puts people who join later at the back of the same queue", async () => {
    await addToSegment("first")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    expect(await tick(0)).toBe(1)

    const later = await addToSegment("later")
    expect(await tick(10)).toBe(0)
    expect(await tick(30)).toBe(1)
    expect(await letInContactIds()).toContain(later)
  })

  it("lets each person in once, even after the flow goes off and on", async () => {
    await addToSegment("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    expect(await tick(0)).toBe(1)

    await setAutomationEnabled(workspaceId, automationId, false, database)
    await setAutomationEnabled(workspaceId, automationId, true, database)
    expect(await tick(60)).toBe(0)
    expect(await letInContactIds()).toHaveLength(1)
  })

  it("does nothing while the flow is off", async () => {
    await addToSegment("sam")
    expect(await tick(0)).toBe(0)
  })

  it("switches the flow off when its segment is deleted", async () => {
    await addToSegment("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await database
      .delete(customShellContactSegments)
      .where(eq(customShellContactSegments.id, segmentId))

    expect(await tick(0)).toBe(0)
    expect(await flow()).toMatchObject({
      enabled: false,
      pausedReason: "The segment this flow lets in no longer exists.",
    })
  })

  it("switches the flow off once too many of the people sent to bounce", async () => {
    await saveDripDefaults(
      workspaceId,
      { ...PACE, batchSizeMin: 25, batchSizeMax: 25 },
      database
    )
    for (let index = 0; index < 26; index += 1) {
      await addToSegment(`person-${index}`)
    }
    await setAutomationEnabled(workspaceId, automationId, true, database)
    expect(await tick(0)).toBe(25)

    const runs = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, automationId))
    await database.insert(customShellAutomationDeliveries).values(
      runs.map((run) => ({
        id: uuid(),
        runId: run.id,
        nodeId: "next",
        contactId: run.subjectContactId,
        toEmail: "someone@example.test",
        subject: "Email 1",
        status: "sent",
        createdAt: at(1),
      }))
    )
    // 1 of 25 is 4 in 100, under the 5 in 100 limit, so the last person still
    // gets in.
    const bounced = runs.slice(0, 1).map((run) => run.subjectContactId!)
    for (const contactId of bounced) {
      await database
        .update(customShellContacts)
        .set({ status: "bounced" })
        .where(eq(customShellContacts.id, contactId))
    }
    expect(await tick(30)).toBe(1)

    await database
      .update(customShellContacts)
      .set({ status: "bounced" })
      .where(eq(customShellContacts.id, runs[1].subjectContactId!))
    await addToSegment("one-more")
    expect(await tick(60)).toBe(0)
    expect((await flow()).enabled).toBe(false)
    expect((await flow()).pausedReason).toBe(
      "Stopped on its own: 2 of the 25 people sent to so far bounced, which is over your 5 in 100 limit. Clean up the segment before switching it back on."
    )
  })

  it("says how far through the segment it is", async () => {
    await addToSegment("first")
    await addToSegment("second")
    await addToSegment("third")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await tick(0)

    expect(
      await segmentDripProgress(workspaceId, automationId, database, at(5))
    ).toEqual({
      letIn: 2,
      waiting: 1,
      nextBatchAt: at(30).toISOString(),
      pace: "2 people at a time, 30 minutes apart, any time of day.",
    })
  })
})

describe("segmentDripNextBatchAt", () => {
  const pace = { ...PACE, waitMinMinutes: 30, waitMaxMinutes: 60 }

  it("goes straight away for a flow nobody has been let into", () => {
    expect(segmentDripNextBatchAt(pace, "flow", null, MONDAY_NOON)).toEqual(
      MONDAY_NOON
    )
  })

  it("picks the same gap every time it is asked about the same batch", () => {
    const first = segmentDripNextBatchAt(pace, "flow", MONDAY_NOON, MONDAY_NOON)
    const again = segmentDripNextBatchAt(pace, "flow", MONDAY_NOON, at(10))
    expect(again).toEqual(first)
    const gap = (first.getTime() - MONDAY_NOON.getTime()) / MINUTE
    expect(gap).toBeGreaterThanOrEqual(30)
    expect(gap).toBeLessThanOrEqual(60)
  })
})
