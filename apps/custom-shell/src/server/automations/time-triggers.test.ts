import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { timeActivateNode } from "@/lib/automations/nodes/time-activate"
import { placeholderNode } from "@/lib/automations/nodes/placeholder"
import {
  formatRunAtForTimezoneInput,
  type AutomationSchedule,
} from "@/lib/automations/schedule"
import { type CustomShellDb } from "@/server/db"
import { runAutomationTick } from "@/server/automations/engine"
import {
  saveWorkspaceAutomation,
  setAutomationEnabled,
} from "@/server/automations/flows"
import {
  nextScheduledRunAt,
  runTimeActivateTriggers,
} from "@/server/automations/time-triggers"
import {
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { uuid } from "@/server/auth/security"

let client: PGlite
let database: CustomShellDb
let workspaceId: string

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

function scheduleGraph(schedule: AutomationSchedule) {
  const graph: AutomationGraph = {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      {
        id: "time",
        kind: timeActivateNode.kind,
        x: 0,
        y: 0,
        settings: { schedule },
      },
      {
        id: "action",
        kind: placeholderNode.kind,
        x: 200,
        y: 0,
        settings: { note: "" },
      },
    ],
    edges: [{ id: "edge", from: "time", sourcePort: "then", to: "action" }],
  }
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  return { graph, config: compiled.config! }
}

async function insertScheduledFlow(input: {
  schedule: AutomationSchedule
  nextRunAt: Date | null
  enabled?: boolean
}) {
  const owner = await insertUser(database, { role: "admin" })
  const compiled = scheduleGraph(input.schedule)
  const timestamp = new Date("2026-08-10T12:00:00.000Z")
  const [flow] = await database
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      workspaceId,
      userId: owner.id,
      name: `Scheduled ${uuid()}`,
      graph: compiled.graph,
      compiledConfig: compiled.config,
      enabled: input.enabled ?? true,
      nextRunAt: input.nextRunAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return flow
}

describe("Time trigger scheduling", () => {
  it("computes no next run while a flow is off", () => {
    const { config } = scheduleGraph({
      frequency: "daily",
      time: "09:00",
      timezone: "UTC",
    })

    expect(
      nextScheduledRunAt(config, false, new Date("2026-08-10T08:00:00Z"))
    ).toBeNull()
  })

  it("sets and clears the next run when the live switch changes", async () => {
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: null,
      enabled: false,
    })

    const on = await setAutomationEnabled(workspaceId, flow.id, true, database)
    const off = await setAutomationEnabled(
      workspaceId,
      flow.id,
      false,
      database
    )

    expect(on.nextRunAt?.getTime()).toBeGreaterThan(Date.now())
    expect(off.nextRunAt).toBeNull()
  })

  it("reschedules a live flow when its timezone is saved", async () => {
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: new Date(Date.now() + 60_000),
    })
    const changed = scheduleGraph({
      frequency: "daily",
      time: "09:00",
      timezone: "America/Los_Angeles",
    })

    const saved = await saveWorkspaceAutomation(
      workspaceId,
      { id: flow.id, name: flow.name, graph: changed.graph },
      database
    )

    expect(saved?.nextRunAt?.getTime()).toBeGreaterThan(Date.now())
    expect(
      formatRunAtForTimezoneInput(
        saved!.nextRunAt!.toISOString(),
        "America/Los_Angeles"
      )
    ).toMatch(/T09:00$/)
  })

  it("starts a due flow and advances it past the current tick", async () => {
    const due = new Date("2026-08-10T09:00:00.000Z")
    const tick = new Date("2026-08-10T09:00:10.000Z")
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: due,
    })

    expect(await runTimeActivateTriggers(database, tick)).toBe(1)

    const [saved] = await database
      .select()
      .from(customShellAutomations)
      .where(eq(customShellAutomations.id, flow.id))
    const [run] = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, flow.id))
    expect(saved.nextRunAt?.toISOString()).toBe("2026-08-11T09:00:00.000Z")
    expect(run).toMatchObject({
      triggerKind: timeActivateNode.kind,
      triggerKey: `${timeActivateNode.kind}:${due.toISOString()}`,
      triggerFacts: {
        scheduledAt: due.toISOString(),
        timezone: "UTC",
      },
    })
  })

  it("lets only one ticker claim the same occurrence", async () => {
    const tick = new Date("2026-08-10T09:00:10.000Z")
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: new Date("2026-08-10T09:00:00.000Z"),
    })

    const counts = await Promise.all([
      runTimeActivateTriggers(database, tick),
      runTimeActivateTriggers(database, tick),
    ])
    const runs = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, flow.id))

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(runs).toHaveLength(1)
  })

  it("never starts a disabled flow even if an old due time remains", async () => {
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: new Date("2026-08-10T09:00:00.000Z"),
      enabled: false,
    })

    expect(
      await runTimeActivateTriggers(
        database,
        new Date("2026-08-10T12:00:00.000Z")
      )
    ).toBe(0)
    expect(
      await database
        .select()
        .from(customShellAutomationRuns)
        .where(eq(customShellAutomationRuns.automationId, flow.id))
    ).toHaveLength(0)
  })

  it("skips a missed occurrence and advances to the next one", async () => {
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: new Date("2026-08-10T09:00:00.000Z"),
    })

    expect(
      await runTimeActivateTriggers(
        database,
        new Date("2026-08-10T12:00:00.000Z")
      )
    ).toBe(0)
    const [saved] = await database
      .select()
      .from(customShellAutomations)
      .where(eq(customShellAutomations.id, flow.id))
    const runs = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, flow.id))

    expect(saved.nextRunAt?.toISOString()).toBe("2026-08-11T09:00:00.000Z")
    expect(runs).toHaveLength(0)
  })

  it("finishes a one-time schedule after it starts", async () => {
    const due = new Date("2026-08-10T09:00:00.000Z")
    const flow = await insertScheduledFlow({
      schedule: {
        frequency: "once",
        runAt: due.toISOString(),
        timezone: "UTC",
      },
      nextRunAt: due,
    })

    expect(
      await runTimeActivateTriggers(
        database,
        new Date("2026-08-10T09:00:10.000Z")
      )
    ).toBe(1)
    const [saved] = await database
      .select()
      .from(customShellAutomations)
      .where(eq(customShellAutomations.id, flow.id))
    expect(saved).toMatchObject({ enabled: false, nextRunAt: null })
  })

  it("refuses to turn on a one-time schedule that has passed", async () => {
    const flow = await insertScheduledFlow({
      schedule: {
        frequency: "once",
        runAt: "2026-08-10T09:00:00.000Z",
        timezone: "UTC",
      },
      nextRunAt: null,
      enabled: false,
    })

    await expect(
      setAutomationEnabled(workspaceId, flow.id, true, database)
    ).rejects.toThrow("SCHEDULE_FINISHED")
  })

  it("starts and completes the due flow inside the ordinary engine tick", async () => {
    const flow = await insertScheduledFlow({
      schedule: { frequency: "daily", time: "09:00", timezone: "UTC" },
      nextRunAt: new Date(Date.now() - 5_000),
    })

    const result = await runAutomationTick(database)
    const [run] = await database
      .select()
      .from(customShellAutomationRuns)
      .where(eq(customShellAutomationRuns.automationId, flow.id))
    const steps = await database
      .select()
      .from(customShellAutomationRunSteps)
      .where(eq(customShellAutomationRunSteps.runId, run.id))

    expect(result.started).toBe(1)
    expect(run.status).toBe("completed")
    expect(steps).toHaveLength(2)
    expect(steps[0].summary).toMatch(/^Started on schedule at /)
  })
})
