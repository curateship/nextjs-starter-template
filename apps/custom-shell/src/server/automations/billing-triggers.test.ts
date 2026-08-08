import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { canConnectAutomationNodes } from "@/lib/automations/node-registry"
import { automationEntryNodeId, automationTriggerKind } from "@/lib/automations/run"
import {
  billingMomentNode,
  isBillingMoment,
} from "@/lib/automations/nodes/billing-moment"
import { runAutomationTick } from "@/server/automations/engine"
import {
  automationTriggerName,
  duplicateUserAutomation,
  inspectAutomation,
  listUserAutomations,
  setAutomationEnabled,
} from "@/server/automations/flows"
import { setAutomationPause } from "@/server/automations/pause"
import { getAutomationRun, listRunsForAutomation } from "@/server/automations/runs"
import {
  fireAutomationTrigger,
  scanCardExpiryTriggers,
  scanTrialEndingTriggers,
  type ExpiringCardReader,
} from "@/server/automations/triggers"
import { applyStripeEvent } from "@/server/billing/stripe"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { now, uuid } from "@/server/auth/security"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db as unknown as CustomShellDb
})

afterEach(async () => {
  await client.close()
})

const placeholder = { kind: "placeholder", settings: { note: "" } }

/** The trigger node's settings for each moment. `daysBefore` rides along on
 *  every one of them, exactly as the node stores it. */
const paymentFailed = { moment: "paymentFailed", daysBefore: 3 }
const cardExpiring = { moment: "cardExpiring", daysBefore: 3 }
const trialEnding = (daysBefore: number) => ({
  moment: "trialEnding",
  daysBefore,
})

/** A flow drawn as a straight line of the kinds passed in. */
function graphOf(
  nodes: Array<{ kind: string; settings: Record<string, never> | object }>
): AutomationGraph {
  const drawn = nodes.map((node, index) => ({
    id: `n${index}`,
    kind: node.kind,
    x: index * 200,
    y: 0,
    settings: node.settings as AutomationGraph["nodes"][number]["settings"],
  }))
  return {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: drawn,
    edges: drawn.slice(1).map((node, index) => ({
      id: `e${index}`,
      from: `n${index}`,
      sourcePort: "then",
      to: node.id,
    })),
  }
}

/**
 * A saved flow. `compile` false stores no compiled copy, which is what a draft
 * with errors in it looks like on disk.
 */
async function insertAutomation({
  owner,
  graph,
  enabled = false,
  compile = true,
  name = `flow-${uuid()}`,
}: {
  owner: CustomShellUser
  graph: AutomationGraph
  enabled?: boolean
  compile?: boolean
  name?: string
}) {
  const compiled = compileAutomationGraph(graph)
  const timestamp = now()
  const [row] = await database
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      userId: owner.id,
      name,
      graph,
      compiledConfig: compile ? compiled.config : null,
      enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

async function runsOf(automationId: string) {
  return database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
}

async function insertSubscription(
  user: CustomShellUser,
  values: Partial<typeof customShellSubscriptions.$inferInsert> = {}
) {
  const [plan] = await database
    .select()
    .from(customShellPlans)
    .where(eq(customShellPlans.slug, "pro"))
    .limit(1)

  const timestamp = now()
  const [row] = await database
    .insert(customShellSubscriptions)
    .values({
      id: uuid(),
      userId: user.id,
      planId: plan.id,
      stripeCustomerId: `cus_${uuid().slice(0, 8)}`,
      stripeSubscriptionId: `sub_${uuid().slice(0, 8)}`,
      status: "active",
      interval: "monthly",
      source: "stripe",
      currentPeriodEnd: new Date(timestamp.getTime() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    })
    .returning()
  return row
}

// ---------------------------------------------------------------------------

describe("where a flow starts", () => {
  it("starts at the trigger when there is one", () => {
    const compiled = compileAutomationGraph(
      graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }, placeholder])
    )
    expect(compiled.errors).toEqual([])
    expect(automationEntryNodeId(compiled.config!)).toBe("n0")
    expect(automationTriggerKind(compiled.config!)).toBe(billingMomentNode.kind)
  })

  it("leaves flows with no trigger starting exactly where they always did", () => {
    const compiled = compileAutomationGraph(graphOf([placeholder, placeholder]))
    expect(compiled.errors).toEqual([])
    expect(automationEntryNodeId(compiled.config!)).toBe("n0")
    expect(automationTriggerKind(compiled.config!)).toBeNull()
  })

  it("refuses a flow drawn with two triggers", () => {
    const graph = graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }])
    graph.nodes.push({
      id: "n1",
      kind: billingMomentNode.kind,
      x: 400,
      y: 0,
      settings: cardExpiring,
    })

    const compiled = compileAutomationGraph(graph)
    expect(compiled.config).toBeNull()
    expect(compiled.errors.map((error) => error.code)).toContain(
      "multiple_triggers"
    )
  })

  it("will not let anything connect into a trigger", () => {
    const source = { id: "a", kind: "placeholder", x: 0, y: 0, settings: {} }
    const trigger = {
      id: "b",
      kind: billingMomentNode.kind,
      x: 200,
      y: 0,
      settings: {},
    }
    expect(canConnectAutomationNodes(source, "then", trigger)).toBe(false)
  })
})

describe("switching a flow on", () => {
  it("refuses a flow with no trigger, and says why", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([placeholder, placeholder]),
    })

    await expect(
      setAutomationEnabled(owner.id, flow.id, true, database)
    ).rejects.toThrow("NO_TRIGGER")
  })

  it("refuses a flow that does not compile", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }]),
      compile: false,
    })

    await expect(
      setAutomationEnabled(owner.id, flow.id, true, database)
    ).rejects.toThrow("NOT_RUNNABLE")
  })

  it("always lets a flow be switched off, however broken it is", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }]),
      enabled: true,
      compile: false,
    })

    const off = await setAutomationEnabled(owner.id, flow.id, false, database)
    expect(off.enabled).toBe(false)
  })

  it("does not hand a copy the original's live switch", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }, placeholder]),
      enabled: true,
      name: "Recovery",
    })

    const copy = await duplicateUserAutomation(owner.id, flow.id, database)

    // The whole point: duplicating a live recovery flow and forgetting about it
    // would send every member two of everything.
    expect(copy!.enabled).toBe(false)
  })

  it("names what a half-drawn flow will react to before it compiles", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: trialEnding(3) }]),
      compile: false,
    })

    expect(automationTriggerName(inspectAutomation(flow))).toBe("Trial ending")

    const [listed] = await listUserAutomations(owner.id, database)
    expect(listed.triggerName).toBe("Trial ending")
    expect(listed.enabled).toBe(false)
  })
})

describe("a payment that failed", () => {
  const invoiceEvent = (customerId: string, overrides: Record<string, unknown> = {}) =>
    ({
      id: `evt_${uuid().slice(0, 8)}`,
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_123",
          number: "CS-0001",
          customer: customerId,
          amount_due: 1900,
          currency: "usd",
          attempt_count: 1,
          next_payment_attempt: Math.floor(
            new Date("2026-08-10T00:00:00.000Z").getTime() / 1_000
          ),
          hosted_invoice_url: "https://invoice.example/1",
          ...overrides,
        },
      },
    }) as never

  async function setUp({ enabled = true }: { enabled?: boolean } = {}) {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, {
      name: "Jane Payer",
      email: "jane@example.test",
    })
    const subscription = await insertSubscription(member)
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }, placeholder]),
      enabled,
    })
    return { owner, member, subscription, flow }
  }

  it("starts the flow once, for the member the bill belongs to", async () => {
    const { member, subscription, flow } = await setUp()

    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)

    const runs = await runsOf(flow.id)
    expect(runs).toHaveLength(1)
    expect(runs[0].subjectUserId).toBe(member.id)
    expect(runs[0].subjectLabel).toBe("Jane Payer (jane@example.test)")
    expect(runs[0].triggerKind).toBe(billingMomentNode.kind)
    expect(runs[0].triggerFacts).toMatchObject({
      invoiceId: "in_123",
      amountDue: "$19",
      attemptCount: 1,
    })
  })

  it("starts nothing for the retries of the same bill", async () => {
    const { subscription, flow } = await setUp()

    // A different Stripe event every time — it is the *invoice* that repeats,
    // which is exactly what somebody with an empty card lives through.
    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)
    await applyStripeEvent(
      invoiceEvent(subscription.stripeCustomerId!, { attempt_count: 2 }),
      database
    )
    await applyStripeEvent(
      invoiceEvent(subscription.stripeCustomerId!, { attempt_count: 3 }),
      database
    )

    expect(await runsOf(flow.id)).toHaveLength(1)
  })

  it("starts a second flow for the next bill", async () => {
    const { subscription, flow } = await setUp()

    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)
    await applyStripeEvent(
      invoiceEvent(subscription.stripeCustomerId!, { id: "in_456" }),
      database
    )

    expect(await runsOf(flow.id)).toHaveLength(2)
  })

  it("is ignored by a flow that has not been switched on", async () => {
    const { subscription, flow } = await setUp({ enabled: false })

    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)

    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("is skipped, not queued, while everything is paused", async () => {
    const { subscription, flow } = await setUp()
    await setAutomationPause({ enabled: true, changedBy: "Tester" }, database)

    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)
    expect(await runsOf(flow.id)).toHaveLength(0)

    // And coming back off the pause does not chase it.
    await setAutomationPause({ enabled: false, changedBy: "Tester" }, database)
    await runAutomationTick(database)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("ignores a bill for a customer this app never created", async () => {
    const { flow } = await setUp()

    await applyStripeEvent(invoiceEvent("cus_nobody"), database)

    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("names the moment and the person in the run's history", async () => {
    const { owner, subscription, flow } = await setUp()
    await applyStripeEvent(invoiceEvent(subscription.stripeCustomerId!), database)

    await runAutomationTick(database)

    const [run] = await listRunsForAutomation(owner.id, flow.id, 0, database).then(
      (page) => page.runs
    )
    expect(run.subjectLabel).toBe("Jane Payer (jane@example.test)")
    expect(run.triggerName).toBe("Payment failed")

    const detail = await getAutomationRun(owner.id, run.id, database)
    expect(detail!.steps[0].summary).toContain("Jane Payer")
    expect(detail!.steps[0].summary).toContain("$19")
  })
})

describe("a trial about to run out", () => {
  const today = new Date("2026-08-06T09:00:00.000Z")
  const inDays = (days: number) =>
    new Date(today.getTime() + days * 86_400_000)

  async function setUp(daysBefore = 3, enabled = true) {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, {
      name: "Trial Person",
      email: "trial@example.test",
    })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: trialEnding(daysBefore) }, placeholder]),
      enabled,
    })
    return { owner, member, flow }
  }

  it("starts nothing for a trial still outside the window", async () => {
    const { member, flow } = await setUp(3)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(10),
    })

    expect(await scanTrialEndingTriggers(database, today)).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("starts once when the trial crosses the line, and never twice", async () => {
    const { member, flow } = await setUp(3)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(2),
    })

    expect(await scanTrialEndingTriggers(database, today)).toBe(1)
    await scanTrialEndingTriggers(database, inDays(0.5))
    await scanTrialEndingTriggers(database, inDays(1))

    const runs = await runsOf(flow.id)
    expect(runs).toHaveLength(1)
    expect(runs[0].subjectUserId).toBe(member.id)
    expect(runs[0].triggerFacts).toMatchObject({ daysLeft: 2 })
  })

  it("calls the run by the moment it was set to, not the node's default", async () => {
    const { owner, member, flow } = await setUp(3)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(2),
    })
    await scanTrialEndingTriggers(database, today)
    await runAutomationTick(database)

    // All three moments share one node kind now, so the name can only come from
    // the run's own copy of the settings. Read from the bare kind it would say
    // "Payment failed" here — the node's first choice — for a trial.
    const [run] = (await listRunsForAutomation(owner.id, flow.id, 0, database))
      .runs
    expect(run.triggerName).toBe("Trial ending")

    const detail = await getAutomationRun(owner.id, run.id, database)
    expect(detail!.steps[0].stepName).toBe("Trial ending")
    expect(detail!.steps[0].summary).toContain("free trial has 2 days left")
  })

  it("re-arms when an admin extends the trial", async () => {
    const { member, flow } = await setUp(3)
    const subscription = await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(2),
    })

    await scanTrialEndingTriggers(database, today)
    expect(await runsOf(flow.id)).toHaveLength(1)

    // Extended by a week. The window has moved with it, so nothing fires until
    // the new date is close again.
    await database
      .update(customShellSubscriptions)
      .set({ trialEndsAt: inDays(9) })
      .where(eq(customShellSubscriptions.id, subscription.id))

    await scanTrialEndingTriggers(database, today)
    expect(await runsOf(flow.id)).toHaveLength(1)

    await scanTrialEndingTriggers(database, inDays(7))
    expect(await runsOf(flow.id)).toHaveLength(2)
  })

  it("gives every watching flow its own run, on its own schedule", async () => {
    const { owner, member, flow } = await setUp(3)
    // A second flow on the same trigger, watching a week out instead of three
    // days. Each flow's guard is its own, so one firing must not silence the
    // other — and the wider one must fire first.
    const wider = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: trialEnding(7) }, placeholder]),
      enabled: true,
    })
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(5),
    })

    expect(await scanTrialEndingTriggers(database, today)).toBe(1)
    expect(await runsOf(wider.id)).toHaveLength(1)
    expect(await runsOf(flow.id)).toHaveLength(0)

    // Three days on, the narrower flow's window is reached. The wider one has
    // already had its turn and stays quiet.
    expect(await scanTrialEndingTriggers(database, inDays(3))).toBe(1)
    expect(await runsOf(wider.id)).toHaveLength(1)
    expect(await runsOf(flow.id)).toHaveLength(1)
  })

  it("says nothing about a trial that already ended", async () => {
    const { member, flow } = await setUp(3)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(-1),
    })

    expect(await scanTrialEndingTriggers(database, today)).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("leaves out somebody whose account is suspended", async () => {
    const { member, flow } = await setUp(3)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(2),
    })
    await database
      .update(customShellUsers)
      .set({ status: "suspended" })
      .where(eq(customShellUsers.id, member.id))

    expect(await scanTrialEndingTriggers(database, today)).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("is ignored by a flow that has not been switched on", async () => {
    const { member, flow } = await setUp(3, false)
    await insertSubscription(member, {
      status: "trialing",
      trialEndsAt: inDays(2),
    })

    expect(await scanTrialEndingTriggers(database, today)).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })
})

describe("a card about to run out", () => {
  const today = new Date("2026-08-06T09:00:00.000Z")

  const card = (last4: string): Awaited<ReturnType<ExpiringCardReader>> => ({
    brand: "visa",
    last4,
    expMonth: 9,
    expYear: 2026,
    expired: false,
  })

  async function setUp(enabled = true) {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, {
      name: "Card Person",
      email: "card@example.test",
    })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: cardExpiring }, placeholder]),
      enabled,
    })
    return { owner, member, flow }
  }

  it("starts once per card per billing period", async () => {
    const { member, flow } = await setUp()
    const subscription = await insertSubscription(member, {
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    })

    const read: ExpiringCardReader = async () => card("4242")
    expect(await scanCardExpiryTriggers(read, database, today)).toBe(1)
    // Looked at again tomorrow, and the day after. Same card, same period.
    expect(await scanCardExpiryTriggers(read, database, today)).toBe(0)

    const runs = await runsOf(flow.id)
    expect(runs).toHaveLength(1)
    expect(runs[0].subjectUserId).toBe(member.id)
    expect(runs[0].triggerFacts).toMatchObject({
      cardLast4: "4242",
      cardExpiresOn: "09/2026",
    })

    // Next billing period is a new moment, and the card is still short of it.
    await database
      .update(customShellSubscriptions)
      .set({ currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z") })
      .where(eq(customShellSubscriptions.id, subscription.id))

    expect(await scanCardExpiryTriggers(read, database, today)).toBe(1)
    expect(await runsOf(flow.id)).toHaveLength(2)
  })

  it("starts again when a different short card is put on", async () => {
    const { member, flow } = await setUp()
    await insertSubscription(member)

    await scanCardExpiryTriggers(async () => card("4242"), database, today)
    await scanCardExpiryTriggers(async () => card("1881"), database, today)

    expect(await runsOf(flow.id)).toHaveLength(2)
  })

  it("says nothing when the card outlives the renewal", async () => {
    const { member, flow } = await setUp()
    await insertSubscription(member)

    // Null is what `findExpiringCard` answers in every case where a warning
    // would be wrong, so this is that whole family of cases at once.
    expect(
      await scanCardExpiryTriggers(async () => null, database, today)
    ).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("carries on past a member Stripe will not answer about", async () => {
    const { member, flow } = await setUp()
    const first = await insertSubscription(member)
    const other = await insertUser(database, { email: "other@example.test" })
    await insertSubscription(other)

    const read: ExpiringCardReader = async (subscription) => {
      if (subscription.id === first.id) throw new Error("Stripe is down")
      return card("4242")
    }

    expect(await scanCardExpiryTriggers(read, database, today)).toBe(1)
    expect(await runsOf(flow.id)).toHaveLength(1)
  })

  it("never asks Stripe at all when no flow is watching", async () => {
    const { member } = await setUp(false)
    await insertSubscription(member)

    let asked = 0
    const read: ExpiringCardReader = async () => {
      asked += 1
      return card("4242")
    }

    expect(await scanCardExpiryTriggers(read, database, today)).toBe(0)
    expect(asked).toBe(0)
  })
})

describe("a trigger flow started by hand", () => {
  it("runs, and says plainly that it is about nobody in particular", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }, placeholder]),
    })

    // Straight to the engine rather than through `startAutomationRun`, which is
    // the same insert without a subject or any facts.
    const timestamp = now()
    const inspected = inspectAutomation(flow)
    await database.insert(customShellAutomationRuns).values({
      id: uuid(),
      automationId: flow.id,
      userId: owner.id,
      status: "active",
      currentNodeId: automationEntryNodeId(inspected.compiledConfig!)!,
      configSnapshot: inspected.compiledConfig!,
      wakeAt: timestamp,
      attempts: 0,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await runAutomationTick(database)

    const [run] = await runsOf(flow.id)
    expect(run.status).toBe("completed")

    const detail = await getAutomationRun(owner.id, run.id, database)
    expect(detail!.steps[0].summary).toContain("Started by hand")
  })
})

describe("two servers doing the same work", () => {
  it("start one run between them, not two", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, { email: "both@example.test" })
    const flow = await insertAutomation({
      owner,
      graph: graphOf([{ kind: billingMomentNode.kind, settings: paymentFailed }, placeholder]),
      enabled: true,
    })

    const event = {
      subjectUserId: member.id,
      subjectLabel: "Both (both@example.test)",
      key: "in_race",
      facts: { invoiceId: "in_race" },
    }

    const [first, second] = await Promise.all([
      fireAutomationTrigger(
        billingMomentNode.kind,
        isBillingMoment("paymentFailed"),
        event,
        database
      ),
      fireAutomationTrigger(
        billingMomentNode.kind,
        isBillingMoment("paymentFailed"),
        event,
        database
      ),
    ])

    expect(first + second).toBe(1)
    expect(await runsOf(flow.id)).toHaveLength(1)
  })
})
