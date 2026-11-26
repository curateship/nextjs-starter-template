import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

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
  segmentDripProgress,
} from "@/server/automations/segment-drip"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import {
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

describe("Segment start with people already in it", () => {
  it("lets everyone already there in at once, oldest first, with no pace of its own", async () => {
    const first = await addToSegment("first")
    const second = await addToSegment("second")
    const third = await addToSegment("third")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    expect(await tick(0)).toBe(3)
    expect(await letInContactIds()).toEqual(
      expect.arrayContaining([first, second, third])
    )
    expect(await tick(1)).toBe(0)
  })

  it("lets in 100 a pass, and no more while 100 of its runs wait to be walked", async () => {
    for (let index = 0; index < 101; index += 1) {
      await addToSegment(`person-${index}`)
    }
    await setAutomationEnabled(workspaceId, automationId, true, database)

    expect(await tick(0)).toBe(100)
    expect(await tick(1)).toBe(0)

    // The engine walks them, so there is room again.
    await database
      .update(customShellAutomationRuns)
      .set({ status: "completed" })
      .where(eq(customShellAutomationRuns.automationId, automationId))
    expect(await tick(2)).toBe(1)
  })

  it("lets nobody in when a flow saved live sends before any Drip step", async () => {
    await addToSegment("sam")
    // Written as it was stored before the Drip rule: the compiler refuses
    // this flow now, so the stored copy is the only way it can be live.
    await database
      .update(customShellAutomations)
      .set({
        enabled: true,
        compiledConfig: {
          v: 1,
          kind: "automation",
          nodes: {
            start: { kind: segmentDripNode.kind, settings: { segmentId, segmentName: "Pomoder list" } },
            send: { kind: "sendEmail", settings: {} },
          },
          edges: [{ from: "start", sourcePort: "then", to: "send" }],
        },
      })
      .where(eq(customShellAutomations.id, automationId))

    expect(await tick(0)).toBe(0)
    expect(await letInContactIds()).toEqual([])
    // Left on, so people already partway through are not stopped.
    expect((await flow()).enabled).toBe(true)
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

  it("lets in people who join later on the next pass", async () => {
    await addToSegment("first")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    expect(await tick(0)).toBe(1)

    const later = await addToSegment("later")
    expect(await tick(1)).toBe(1)
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

  it("says how far through the segment it is", async () => {
    await addToSegment("first")
    await addToSegment("second")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await tick(0)
    await addToSegment("third")

    expect(
      await segmentDripProgress(workspaceId, automationId, database, at(5))
    ).toEqual({ letIn: 2, waiting: 1 })
  })
})
