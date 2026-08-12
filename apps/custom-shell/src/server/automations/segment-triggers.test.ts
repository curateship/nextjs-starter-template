import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { joinedSegmentNode } from "@/lib/automations/nodes/joined-segment"
import { placeholderNode } from "@/lib/automations/nodes/placeholder"
import { runAutomationTick } from "@/server/automations/engine"
import { setAutomationEnabled } from "@/server/automations/flows"
import { setAutomationPause } from "@/server/automations/pause"
import { deleteWorkspaceSegments } from "@/server/people/contact-segments"
import {
  runJoinedSegmentTriggers,
  SEGMENT_ARRIVAL_LIMIT,
} from "@/server/automations/segment-triggers"
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
let graph: AutomationGraph

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  segmentId = uuid()
  const owner = await insertUser(database, { role: "admin" })
  const timestamp = now()

  await database.insert(customShellContactSegments).values({
    id: segmentId,
    workspaceId,
    name: "Warm leads",
    kind: "static",
    rules: { conditions: [] },
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  graph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      {
        id: "trigger",
        kind: joinedSegmentNode.kind,
        x: 0,
        y: 0,
        settings: { segmentId, segmentName: "Warm leads" },
      },
      {
        id: "next",
        kind: placeholderNode.kind,
        x: 200,
        y: 0,
        settings: { note: "" },
      },
    ],
    edges: [{ id: "edge", from: "trigger", sourcePort: "then", to: "next" }],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  automationId = uuid()
  await database.insert(customShellAutomations).values({
    id: automationId,
    workspaceId,
    userId: owner.id,
    name: "Welcome warm leads",
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

async function addContactToSegment(label: string) {
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
  await database.insert(customShellContactSegmentMembers).values({
    segmentId,
    contactId,
    createdAt: timestamp,
  })
  return contactId
}

async function runs() {
  return database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
}

describe("Joined-segment trigger", () => {
  it("baselines existing people, then starts one contact-aware run per arrival", async () => {
    await addContactToSegment("Already there")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    const arrived = await addContactToSegment("New person")
    expect(await runJoinedSegmentTriggers(database)).toBe(1)

    expect(await runs()).toEqual([
      expect.objectContaining({
        subjectContactId: arrived,
        subjectUserId: null,
        subjectLabel: "New person (New person@example.test)",
        triggerKind: joinedSegmentNode.kind,
      }),
    ])
  })

  it("never starts the same person again after they leave and rejoin", async () => {
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runJoinedSegmentTriggers(database)
    const contactId = await addContactToSegment("Returner")
    await runJoinedSegmentTriggers(database)

    await database
      .delete(customShellContactSegmentMembers)
      .where(eq(customShellContactSegmentMembers.contactId, contactId))
    await runJoinedSegmentTriggers(database)
    await database.insert(customShellContactSegmentMembers).values({
      segmentId,
      contactId,
      createdAt: now(),
    })

    expect(await runJoinedSegmentTriggers(database)).toBe(0)
    expect(await runs()).toHaveLength(1)
  })

  it("keeps once-per-person memory after the old segment is deleted", async () => {
    await setAutomationEnabled(workspaceId, automationId, true, database)
    const contactId = await addContactToSegment("Remembered")
    expect(await runJoinedSegmentTriggers(database)).toBe(1)
    await setAutomationEnabled(workspaceId, automationId, false, database)

    const replacementSegmentId = uuid()
    const timestamp = now()
    await database.insert(customShellContactSegments).values({
      id: replacementSegmentId,
      workspaceId,
      name: "New leads",
      kind: "static",
      rules: { conditions: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const switchedGraph: AutomationGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === joinedSegmentNode.kind
          ? {
              ...node,
              settings: {
                segmentId: replacementSegmentId,
                segmentName: "New leads",
              },
            }
          : node
      ),
    }
    const compiled = compileAutomationGraph(switchedGraph)
    expect(compiled.errors).toEqual([])
    await database
      .update(customShellAutomations)
      .set({ graph: switchedGraph, compiledConfig: compiled.config })
      .where(eq(customShellAutomations.id, automationId))

    expect(
      await deleteWorkspaceSegments(workspaceId, [segmentId], database)
    ).toMatchObject({ deleted: [segmentId], blocked: [] })

    await setAutomationEnabled(workspaceId, automationId, true, database)
    await database.insert(customShellContactSegmentMembers).values({
      segmentId: replacementSegmentId,
      contactId,
      createdAt: now(),
    })
    expect(await runJoinedSegmentTriggers(database)).toBe(0)
    expect(await runs()).toHaveLength(1)
  })

  it("allows only one concurrent look to start an arrival", async () => {
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runJoinedSegmentTriggers(database)
    await addContactToSegment("Concurrent")

    const started = await Promise.all([
      runJoinedSegmentTriggers(database),
      runJoinedSegmentTriggers(database),
    ])
    expect(started.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(await runs()).toHaveLength(1)
  })

  it("skips arrivals during the global pause instead of catching them up", async () => {
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runJoinedSegmentTriggers(database)
    await setAutomationPause({ enabled: true, changedBy: "Tester" }, database)
    await addContactToSegment("Paused arrival")

    expect((await runAutomationTick(database)).paused).toBe(true)
    await setAutomationPause({ enabled: false, changedBy: "Tester" }, database)
    await runAutomationTick(database)
    expect(await runs()).toHaveLength(0)
  })

  it("switches the flow off before a sudden flood starts anything", async () => {
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runJoinedSegmentTriggers(database)
    for (let index = 0; index <= SEGMENT_ARRIVAL_LIMIT; index += 1) {
      await addContactToSegment(`Flood ${index}`)
    }

    expect(await runJoinedSegmentTriggers(database)).toBe(0)
    expect(await runs()).toHaveLength(0)
    const [flow] = await database
      .select()
      .from(customShellAutomations)
      .where(eq(customShellAutomations.id, automationId))
    expect(flow).toMatchObject({
      enabled: false,
      pausedReason: expect.stringContaining("more than 100 people joined"),
    })
  })

  it("refuses to delete a segment an automation points at", async () => {
    const result = await deleteWorkspaceSegments(
      workspaceId,
      [segmentId],
      database
    )

    expect(result.deleted).toEqual([])
    expect(result.blocked).toEqual([
      expect.objectContaining({
        id: segmentId,
        usedBy: ["Automation: Welcome warm leads"],
      }),
    ])
  })
})
