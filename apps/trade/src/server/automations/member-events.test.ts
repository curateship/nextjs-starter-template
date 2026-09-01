import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "@/lib/automations/graph"
import {
  MEMBER_EVENTS,
  memberEventNode,
  type MemberEvent,
} from "@/lib/automations/nodes/member-event"
import {
  deleteAutomationRuns,
  runAutomationTick,
} from "@/server/automations/engine"
import { emitMemberEvent } from "@/server/automations/member-events"
import { getAutomationRun } from "@/server/automations/runs"
import { signInWithGoogle } from "@/server/auth/google"
import { consumeSignInLink } from "@/server/auth/sign-in-link"
import {
  applyStripeEvent,
  cancelSubscriptionByAdmin,
} from "@/server/billing/stripe"
import { type CustomShellDb } from "@/server/db"
import { markAccountsForDeletion } from "@/server/people/account-deletion"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellPlans,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { createAuthToken, now, uuid } from "@/server/auth/security"

let client: PGlite
let database: CustomShellDb
let site: string

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

function graphOf(event: MemberEvent): AutomationGraph {
  return {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      {
        id: "event",
        kind: memberEventNode.kind,
        x: 0,
        y: 0,
        settings: { event },
      },
      {
        id: "next",
        kind: "placeholder",
        x: 200,
        y: 0,
        settings: { note: "" },
      },
    ],
    edges: [{ id: "edge", from: "event", sourcePort: "then", to: "next" }],
  }
}

async function insertFlow(
  owner: CustomShellUser,
  event: MemberEvent,
  enabled = true,
  workspaceId = site
) {
  const graph = graphOf(event)
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  const timestamp = now()
  const [flow] = await database
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      workspaceId,
      userId: owner.id,
      name: `${event}-${uuid()}`,
      graph,
      compiledConfig: compiled.config,
      enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return flow
}

async function runsOf(automationId: string) {
  return database
    .select()
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.automationId, automationId))
}

describe("member lifecycle events", () => {
  it("starts the matching flow for each event and carries the member", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, {
      name: "Jamie Member",
      email: "jamie@example.test",
    })

    for (const event of MEMBER_EVENTS) {
      const flow = await insertFlow(owner, event)
      expect(await emitMemberEvent(event, member, database)).toBe(1)

      const [run] = await runsOf(flow.id)
      expect(run).toMatchObject({
        subjectUserId: member.id,
        subjectLabel: "Jamie Member (jamie@example.test)",
        triggerKind: memberEventNode.kind,
        triggerFacts: { event },
      })
    }
  })

  it("starts once and ignores flows that are switched off", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const live = await insertFlow(owner, "registered")
    const off = await insertFlow(owner, "registered", false)

    await emitMemberEvent("registered", member, database)
    await emitMemberEvent("registered", member, database)

    expect(await runsOf(live.id)).toHaveLength(1)
    expect(await runsOf(off.id)).toHaveLength(0)
  })

  it("stays once-only after its completed run history is deleted", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const flow = await insertFlow(owner, "registered")
    await emitMemberEvent("registered", member, database)
    await runAutomationTick(database)

    const [run] = await runsOf(flow.id)
    expect(await deleteAutomationRuns(site, [run.id], database)).toEqual({
      deleted: [run.id],
      kept: [],
    })

    await emitMemberEvent("registered", member, database)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })

  it("never starts a flow from another workspace", async () => {
    const otherSite = (await insertWorkspace(database)).id
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, { currentWorkspaceId: otherSite })
    const wrongSite = await insertFlow(owner, "registered")
    const rightSite = await insertFlow(owner, "registered", true, otherSite)

    await emitMemberEvent("registered", member, database)

    expect(await runsOf(wrongSite.id)).toHaveLength(0)
    expect(await runsOf(rightSite.id)).toHaveLength(1)
  })

  it("writes the chosen event and member into run history", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, {
      name: "History Person",
      email: "history@example.test",
    })
    const flow = await insertFlow(owner, "verified")
    await emitMemberEvent("verified", member, database)

    await runAutomationTick(database)

    const [run] = await runsOf(flow.id)
    const detail = await getAutomationRun(site, run.id, database)
    expect(detail).toMatchObject({
      status: "completed",
      subjectLabel: "History Person (history@example.test)",
      triggerName: "Email verified",
    })
    expect(detail?.steps[0].summary).toContain(
      "Email verified for History Person"
    )
  })

  it("fires verification when an emailed sign-in link confirms the address", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database, { emailVerifiedAt: null })
    const verified = await insertFlow(owner, "verified")
    const token = await createAuthToken(member.id, "login", database)

    await consumeSignInLink(
      token,
      { userAgent: null, ipAddress: null },
      database
    )

    expect(await runsOf(verified.id)).toHaveLength(1)
  })

  it("fires registration and verification for a new Google member", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const registered = await insertFlow(owner, "registered")
    const verified = await insertFlow(owner, "verified")

    const { user } = await signInWithGoogle(
      {
        subject: "google-member-event",
        email: "google-member@example.test",
        emailVerified: true,
        name: "Google Member",
      },
      { userAgent: null, ipAddress: null },
      database
    )

    expect((await runsOf(registered.id))[0].subjectUserId).toBe(user.id)
    expect((await runsOf(verified.id))[0].subjectUserId).toBe(user.id)
  })

  it("cancels unfinished runs about a closed member", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const activeFlow = await insertFlow(owner, "registered")
    const waitingFlow = await insertFlow(owner, "verified")
    await emitMemberEvent("registered", member, database)
    await emitMemberEvent("verified", member, database)

    const [waiting] = await runsOf(waitingFlow.id)
    await database
      .update(customShellAutomationRuns)
      .set({ status: "waiting_approval" })
      .where(eq(customShellAutomationRuns.id, waiting.id))

    expect(
      await markAccountsForDeletion(member.id, [member.id], database)
    ).toEqual([member.id])
    expect((await runsOf(activeFlow.id))[0].status).toBe("canceled")
    expect((await runsOf(waitingFlow.id))[0].status).toBe("canceled")
  })
})

describe("Stripe member events", () => {
  function subscriptionEvent(
    userId: string,
    eventId: string,
    overrides: Record<string, unknown> = {},
    type = "customer.subscription.created"
  ) {
    return {
      id: eventId,
      type,
      data: {
        object: {
          id: "sub_member_event",
          customer: "cus_member_event",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { userId },
          items: {
            data: [
              {
                price: { id: "price_member_event" },
                current_period_end: Math.floor(
                  new Date("2026-09-01").getTime() / 1_000
                ),
              },
            ],
          },
          ...overrides,
        },
      },
    } as never
  }

  it("turns a new plan and stopped renewal into their matching runs", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const subscribed = await insertFlow(owner, "subscribed")
    const canceled = await insertFlow(owner, "canceled")
    await database
      .update(customShellPlans)
      .set({ stripePriceIdMonthly: "price_member_event" })
      .where(eq(customShellPlans.slug, "pro"))

    await applyStripeEvent(
      subscriptionEvent(member.id, "evt_started"),
      database
    )
    await applyStripeEvent(
      subscriptionEvent(
        member.id,
        "evt_ending",
        { cancel_at_period_end: true },
        "customer.subscription.updated"
      ),
      database
    )

    // The later final cancellation is the same member action, not a second run.
    await applyStripeEvent(
      subscriptionEvent(
        member.id,
        "evt_ended",
        { status: "canceled", cancel_at_period_end: false },
        "customer.subscription.deleted"
      ),
      database
    )

    expect(await runsOf(subscribed.id)).toHaveLength(1)
    expect(await runsOf(canceled.id)).toHaveLength(1)
  })

  it("starts the cancellation flow when an admin stops renewal", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const canceled = await insertFlow(owner, "canceled")
    await database
      .update(customShellPlans)
      .set({ stripePriceIdMonthly: "price_member_event" })
      .where(eq(customShellPlans.slug, "pro"))
    await applyStripeEvent(
      subscriptionEvent(member.id, "evt_started"),
      database
    )

    await cancelSubscriptionByAdmin(member.id, "period_end", database, {
      cancelNow: async () => {
        throw new Error("not used")
      },
      stopRenewal: async () =>
        ({
          id: "sub_member_event",
          status: "active",
          cancel_at_period_end: true,
          items: {
            data: [
              {
                current_period_end: Math.floor(
                  new Date("2026-09-01").getTime() / 1_000
                ),
              },
            ],
          },
        }) as never,
    })

    expect(await runsOf(canceled.id)).toHaveLength(1)
  })

  it("does not back-fill a stopped renewal when the plan later ends", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const canceled = await insertFlow(owner, "canceled", false)
    await database
      .update(customShellPlans)
      .set({ stripePriceIdMonthly: "price_member_event" })
      .where(eq(customShellPlans.slug, "pro"))
    await applyStripeEvent(
      subscriptionEvent(member.id, "evt_started"),
      database
    )
    await applyStripeEvent(
      subscriptionEvent(
        member.id,
        "evt_ending",
        { cancel_at_period_end: true },
        "customer.subscription.updated"
      ),
      database
    )

    await database
      .update(customShellAutomations)
      .set({ enabled: true })
      .where(eq(customShellAutomations.id, canceled.id))
    await applyStripeEvent(
      subscriptionEvent(
        member.id,
        "evt_ended",
        { status: "canceled", cancel_at_period_end: false },
        "customer.subscription.deleted"
      ),
      database
    )

    expect(await runsOf(canceled.id)).toHaveLength(0)
  })
})
