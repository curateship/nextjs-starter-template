import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_DRIP_CONFIG, type DripConfig } from "@/lib/broadcasts/drip"
import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH, type AutomationGraph } from "@/lib/automations/graph"
import { dripNode, dripStepSettings } from "@/lib/automations/nodes/drip"
import { placeholderNode } from "@/lib/automations/nodes/placeholder"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { dripNextBatchAt } from "@/server/automations/drip"
import { runAutomationTick } from "@/server/automations/engine"
import { setAutomationEnabled } from "@/server/automations/flows"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellContactSegmentMembers,
  customShellContactSegments,
  customShellContacts,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let segmentId: string
let automationId: string

const MINUTE = 60_000
/** Two at a time, exactly thirty minutes apart, any hour. */
const PACE: DripConfig = {
  ...DEFAULT_DRIP_CONFIG,
  enabled: true,
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
  const ownerId = (await insertUser(database, { role: "admin" })).id
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
  const graph: AutomationGraph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      { id: "start", kind: segmentDripNode.kind, x: 0, y: 0, settings: { segmentId, segmentName: "Pomoder list" } },
      { id: "drip", kind: dripNode.kind, x: 200, y: 0, settings: dripStepSettings(PACE) },
      { id: "email", kind: placeholderNode.kind, x: 400, y: 0, settings: { note: "" } },
    ],
    edges: [
      { id: "e1", from: "start", sourcePort: "then", to: "drip" },
      { id: "e2", from: "drip", sourcePort: "then", to: "email" },
    ],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  automationId = uuid()
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
})

afterEach(async () => {
  await client.close()
})

async function addContact(label: string, inSegment = true) {
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
  if (inSegment) {
    await database.insert(customShellContactSegmentMembers).values({ segmentId, contactId, createdAt: timestamp })
  }
  return contactId
}

async function runs() {
  return database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
    .orderBy(asc(customShellAutomationRuns.startedAt))
}

async function lastStep(runId: string) {
  const steps = await database
    .select()
    .from(customShellAutomationRunSteps)
    .where(eq(customShellAutomationRunSteps.runId, runId))
    .orderBy(asc(customShellAutomationRunSteps.finishedAt))
  return steps.at(-1)
}

describe("Drip step", () => {
  it("lets the first batch through now and holds the rest for the next one", async () => {
    await addContact("a")
    await addContact("b")
    await addContact("c")
    await setAutomationEnabled(workspaceId, automationId, true, database)

    const before = Date.now()
    await runAutomationTick(database)
    // Everyone is in and has a place; the first two are due again at once.
    await runAutomationTick(database)

    const all = await runs()
    expect(all).toHaveLength(3)
    const done = all.filter((run) => run.status === "completed")
    const held = all.filter((run) => run.status === "active")
    expect(done).toHaveLength(2)
    expect(held).toHaveLength(1)
    expect(held[0].currentNodeId).toBe("drip")
    expect(held[0].wakeAt.getTime()).toBeGreaterThanOrEqual(before + 30 * MINUTE - 1000)
    expect(held[0].wakeAt.getTime()).toBeLessThan(Date.now() + 30 * MINUTE + 1000)
    expect((await lastStep(held[0].id))?.summary).toMatch(/^Waiting for its batch, at /)
  })

  it("starts a new batch once the gap after a part-filled one is over, so no more than Most go at once", async () => {
    await addContact("a")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runAutomationTick(database)
    await runAutomationTick(database)
    const [first] = await runs()
    expect(first.status).toBe("completed")

    // Thirty-one minutes later, as far as the step's lines say: a's batch of
    // 2 has one place left, and the gap after it is over.
    await database
      .update(customShellAutomationRunSteps)
      .set({ output: { releaseAt: new Date(Date.now() - 31 * MINUTE).toISOString() } })
      .where(
        and(
          eq(customShellAutomationRunSteps.runId, first.id),
          sql`${customShellAutomationRunSteps.output} ? 'releaseAt'`
        )
      )
    await addContact("b")
    await addContact("c")
    await addContact("d")
    await runAutomationTick(database)
    await runAutomationTick(database)

    const later = (await runs()).filter((run) => run.id !== first.id)
    expect(later.filter((run) => run.status === "completed")).toHaveLength(2)
    expect(later.filter((run) => run.status === "active")).toHaveLength(1)
  })

  it("stops everyone still waiting once the flow is switched off", async () => {
    await addContact("a")
    await addContact("b")
    await addContact("c")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runAutomationTick(database)
    await runAutomationTick(database)

    await setAutomationEnabled(workspaceId, automationId, false, database)
    const [held] = (await runs()).filter((run) => run.status === "active")
    await database
      .update(customShellAutomationRuns)
      .set({ wakeAt: new Date(Date.now() - 1000) })
      .where(eq(customShellAutomationRuns.id, held.id))
    await runAutomationTick(database)

    const [after] = (await runs()).filter((run) => run.id === held.id)
    expect(after.status).toBe("completed")
    expect((await lastStep(held.id))?.summary).toMatch(/switched off while this run waited for its batch/)
  })

  it("switches the flow off once too many of the people sent to bounce", async () => {
    await addContact("sam")
    await setAutomationEnabled(workspaceId, automationId, true, database)
    await runAutomationTick(database)
    const [run] = await runs()

    // Twenty people sent to, one of them bounced: 5 in 100, the limit.
    for (let index = 0; index < 20; index += 1) {
      const contactId = await addContact(`sent-${index}`, false)
      if (index === 0) {
        await database.update(customShellContacts).set({ status: "bounced" }).where(eq(customShellContacts.id, contactId))
      }
      await database.insert(customShellAutomationDeliveries).values({
        id: uuid(),
        runId: run.id,
        nodeId: "email",
        contactId,
        toEmail: `sent-${index}@example.test`,
        subject: "Email 1",
        status: "sent",
        createdAt: now(),
      })
    }
    await runAutomationTick(database)

    const [flow] = await database.select().from(customShellAutomations).where(eq(customShellAutomations.id, automationId))
    expect(flow.enabled).toBe(false)
    expect(flow.pausedReason).toBe(
      "Stopped on its own: 1 of the 20 people sent to so far bounced, which is over the Drip step's 5 in 100 limit. Clean up who this flow sends to before switching it back on."
    )
    expect((await runs())[0].status).toBe("completed")
  })
})

describe("dripNextBatchAt", () => {
  const pace = { ...PACE, waitMinMinutes: 30, waitMaxMinutes: 60 }
  const noon = new Date("2099-01-05T12:00:00.000Z")

  it("goes straight away for a step nobody has reached", () => {
    expect(dripNextBatchAt(pace, "flow:drip", null, noon)).toEqual(noon)
  })

  it("picks the same gap every time it is asked about the same batch", () => {
    const first = dripNextBatchAt(pace, "flow:drip", noon, noon)
    const again = dripNextBatchAt(pace, "flow:drip", noon, new Date(noon.getTime() + 10 * MINUTE))
    expect(again).toEqual(first)
    const gap = (first.getTime() - noon.getTime()) / MINUTE
    expect(gap).toBeGreaterThanOrEqual(30)
    expect(gap).toBeLessThanOrEqual(60)
  })
})
