import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/directory/mail", () => ({
  sendDirectoryEmail: vi.fn(async () => ({ delivered: true })),
  notifyAdmins: vi.fn(async () => undefined),
}))

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
  type AutomationSettingValue,
} from "@/lib/automations/graph"
import { automationPaletteItems } from "@/lib/automations/node-registry"
import {
  CLAIM_APPROVED_KIND,
  DIRECTORY_EMAIL_KIND,
  FEATURED_ENDING_KIND,
  SUBMISSION_APPROVED_KIND,
  SUBMISSION_ARRIVED_KIND,
  type DirectoryTriggerKind,
} from "@/lib/directory/automation-nodes"
import { now, uuid } from "@/server/auth/security"
import { runAutomationTick } from "@/server/automations/engine"
import {
  fillDirectoryEmail,
  fireDirectoryEvent,
  scanFeaturedEndingTriggers,
} from "@/server/directory/automation-events"
import { reviewClaim } from "@/server/directory/claims"
import { saveFeaturedPlan } from "@/server/directory/featured"
import { createListing, updateListing } from "@/server/directory/listings"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryClaims,
  directoryFeaturedEntitlements,
} from "@/server/directory/schema"
import {
  createSubmission,
  reviewSubmission,
  verifySubmission,
} from "@/server/directory/submissions"
import type { CustomShellDb } from "@/server/db"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
  customShellContacts,
  customShellWorkspaces,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

/**
 * The four directory triggers and the email step, and what each promises:
 * on the canvas with a one-line description; fired after the write and never
 * blocking it; only this site's flows; once per submission, claim or spot; and
 * every detail reaches an email.
 */

let client: PGlite
let database: CustomShellDb
let alpha: string
let beta: string
let admin: string

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY ??= "test-key-for-unsubscribe-links"
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  alpha = (await insertWorkspace(database, { name: "Alpha Eats" })).id
  beta = (await insertWorkspace(database, { name: "Beta Eats" })).id
  admin = (await insertUser(database, { role: "admin" })).id
  vi.mocked(sendDirectoryEmail).mockClear()
})

afterEach(async () => {
  await client.close()
})

function graphOf(
  kind: DirectoryTriggerKind,
  settings: Record<string, AutomationSettingValue> = {},
  email?: { subject: string; body: string }
): AutomationGraph {
  return {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [
      { id: "start", kind, x: 0, y: 0, settings },
      email
        ? { id: "email", kind: DIRECTORY_EMAIL_KIND, x: 200, y: 0, settings: email }
        : { id: "email", kind: "placeholder", x: 200, y: 0, settings: { note: "" } },
    ],
    edges: [{ id: "edge", from: "start", sourcePort: "then", to: "email" }],
  }
}

async function insertFlow(
  workspaceId: string,
  kind: DirectoryTriggerKind,
  settings: Record<string, AutomationSettingValue> = {},
  email?: { subject: string; body: string }
) {
  const graph = graphOf(kind, settings, email)
  const compiled = compileAutomationGraph(graph)
  expect(compiled.errors).toEqual([])
  const timestamp = now()
  const [flow] = await database
    .insert(customShellAutomations)
    .values({
      id: uuid(),
      workspaceId,
      userId: admin,
      name: `${kind}-${uuid()}`,
      graph,
      compiledConfig: compiled.config,
      enabled: true,
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

async function publishedListing(siteId: string, title: string) {
  const listing = await createListing(siteId, { title }, database)
  await updateListing(siteId, listing.id, { status: "published" }, database)
  return listing
}

async function pendingClaim(siteId: string, listingId: string) {
  const owner = await insertUser(database, {
    name: "Joe Owner",
    email: "joe@diner.test",
  })
  const at = now()
  const [claim] = await database
    .insert(directoryClaims)
    .values({
      id: uuid(),
      workspaceId: siteId,
      listingId,
      userId: owner.id,
      contactEmail: "joe@diner.test",
      claimantName: "Joe Owner",
      status: "pending_review",
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return { claim, owner }
}

describe("the canvas", () => {
  it("offers all four starting points, each with a one-line description", () => {
    const items = automationPaletteItems()
    for (const key of [
      "trigger-directory-submission-arrived",
      "trigger-directory-submission-approved",
      "trigger-directory-claim-approved",
      "trigger-directory-featured-ending",
    ]) {
      const item = items.find((candidate) => candidate.key === key)
      expect(item?.group).toBe("Triggers")
      expect(item?.description).toMatch(/^Starts /)
      expect(item?.description).not.toContain("\n")
    }
  })
})

describe("a claim approved", () => {
  it("starts this site's flow once, with the listing, the person and the site", async () => {
    const flow = await insertFlow(alpha, CLAIM_APPROVED_KIND)
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim, owner } = await pendingClaim(alpha, listing.id)

    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)

    const [run] = await runsOf(flow.id)
    expect(run.triggerKey).toBe(`${CLAIM_APPROVED_KIND}:${claim.id}`)
    expect(run.subjectUserId).toBe(owner.id)
    expect(run.triggerFacts).toMatchObject({
      name: "Joe Owner",
      email: "joe@diner.test",
      listingTitle: "Joe's Diner",
      siteName: "Alpha Eats",
    })
    expect(String(run.triggerFacts?.listingLink)).toMatch(/\/directory\/joes-diner$/)

    // The same claim again starts nothing.
    expect(
      await fireDirectoryEvent(
        {
          siteId: alpha,
          kind: CLAIM_APPROVED_KIND,
          key: claim.id,
          person: { email: "joe@diner.test", name: "Joe Owner" },
          listingId: listing.id,
        },
        database
      )
    ).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(1)
  })

  it("never starts a flow on another site", async () => {
    const betaFlow = await insertFlow(beta, CLAIM_APPROVED_KIND)
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)

    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)

    expect(await runsOf(betaFlow.id)).toHaveLength(0)
  })

  it("starts nothing on a rejection, and adds nobody to People without a flow", async () => {
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)
    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)

    const contacts = await database
      .select()
      .from(customShellContacts)
      .where(eq(customShellContacts.workspaceId, alpha))
    expect(contacts).toHaveLength(0)
  })
})

describe("a failed flow", () => {
  it("never undoes or blocks the approval", async () => {
    await insertFlow(alpha, CLAIM_APPROVED_KIND)
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)

    // The flows table vanishing mid-request is as broken as it gets.
    await client.exec('ALTER TABLE "automations" RENAME TO "automations_gone"')
    const result = await reviewClaim(
      alpha,
      claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )
    await client.exec('ALTER TABLE "automations_gone" RENAME TO "automations"')

    expect(result.claim.status).toBe("approved")
    const [saved] = await database
      .select({ status: directoryClaims.status })
      .from(directoryClaims)
      .where(eq(directoryClaims.id, claim.id))
    expect(saved.status).toBe("approved")
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })
})

describe("a submission", () => {
  it("starts 'arrived' when confirmed and 'approved' when approved, adding the sender to People", async () => {
    const arrived = await insertFlow(alpha, SUBMISSION_ARRIVED_KIND)
    const approved = await insertFlow(alpha, SUBMISSION_APPROVED_KIND)
    const { submission, token } = await createSubmission(
      alpha,
      { businessName: "Corner Bakery", contactEmail: "Baker@Example.test" },
      database
    )

    // Not before the address is confirmed: an unconfirmed address may not be theirs.
    expect(await runsOf(arrived.id)).toHaveLength(0)

    await verifySubmission(token, database)
    const [arrivedRun] = await runsOf(arrived.id)
    expect(arrivedRun.triggerFacts).toMatchObject({
      email: "baker@example.test",
      listingTitle: "Corner Bakery",
      listingLink: "",
      siteName: "Alpha Eats",
    })

    const [contact] = await database
      .select()
      .from(customShellContacts)
      .where(eq(customShellContacts.workspaceId, alpha))
    expect(contact).toMatchObject({
      email: "baker@example.test",
      source: "Directory",
      status: "subscribed",
    })
    expect(arrivedRun.subjectContactId).toBe(contact.id)

    const { listingId } = await reviewSubmission(
      alpha,
      submission.id,
      { decision: "approve", reviewerId: admin },
      database
    )
    const [approvedRun] = await runsOf(approved.id)
    expect(approvedRun.subjectContactId).toBe(contact.id)
    expect(String(approvedRun.triggerFacts?.listingLink)).toMatch(
      /\/directory\/corner-bakery$/
    )
    expect(listingId).toBeTruthy()
  })
})

describe("a featured spot ending", () => {
  async function spotEndingIn(days: number) {
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim, owner } = await pendingClaim(alpha, listing.id)
    await database
      .update(directoryClaims)
      .set({ status: "approved" })
      .where(eq(directoryClaims.id, claim.id))
    const plan = await saveFeaturedPlan(
      alpha,
      { name: "One week", priceCents: 2500, currency: "usd", durationDays: 7, priority: 1 },
      database
    )
    const at = now()
    const id = uuid()
    await database.insert(directoryFeaturedEntitlements).values({
      id,
      workspaceId: alpha,
      listingId: listing.id,
      claimId: claim.id,
      buyerUserId: owner.id,
      planId: plan.id,
      stripeSessionId: `cs_${id}`,
      amountTotal: 2500,
      currency: "usd",
      status: "active",
      startsAt: new Date(at.getTime() - 86_400_000),
      endsAt: new Date(at.getTime() + days * 86_400_000 - 60_000),
      createdAt: at,
      updatedAt: at,
    })
    return id
  }

  it("starts once per spot, however often the ticker looks", async () => {
    const flow = await insertFlow(alpha, FEATURED_ENDING_KIND, { daysBefore: 7 })
    const spot = await spotEndingIn(5)

    expect(await scanFeaturedEndingTriggers(database)).toBe(1)
    expect(await scanFeaturedEndingTriggers(database)).toBe(0)

    const runs = await runsOf(flow.id)
    expect(runs).toHaveLength(1)
    expect(runs[0].triggerKey).toBe(`${FEATURED_ENDING_KIND}:${spot}`)
    expect(runs[0].triggerFacts).toMatchObject({ daysLeft: 5, listingTitle: "Joe's Diner" })
    expect(runs[0].triggerFacts?.featuredEndsOn).toBeTruthy()
  })

  it("waits for a spot outside the flow's window", async () => {
    const flow = await insertFlow(alpha, FEATURED_ENDING_KIND, { daysBefore: 3 })
    await spotEndingIn(5)
    expect(await scanFeaturedEndingTriggers(database)).toBe(0)
    expect(await runsOf(flow.id)).toHaveLength(0)
  })
})

describe("the email step", () => {
  it("fills in every detail and sends once to the person the run is about", async () => {
    const flow = await insertFlow(alpha, CLAIM_APPROVED_KIND, {}, {
      subject: "Welcome to {{siteName}}, {{name}}",
      body: "{{listingTitle}} is yours.\nSee it: {{listingLink}}\nWe wrote to {{email}}. Home: {{siteLink}}",
    })
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)
    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)

    await runAutomationTick(database)
    await runAutomationTick(database)

    const sent = vi.mocked(sendDirectoryEmail).mock.calls.filter(
      ([email]) => email.to === "joe@diner.test" && email.subject.startsWith("Welcome")
    )
    expect(sent).toHaveLength(1)
    const [email] = sent[0]
    expect(email.subject).toBe("Welcome to Alpha Eats, Joe Owner")
    expect(email.lines[0]).toBe("Joe's Diner is yours.")
    expect(email.lines[1]).toMatch(/^See it: http.*\/directory\/joes-diner$/)
    expect(email.lines[2]).toMatch(/^We wrote to joe@diner\.test\. Home: http/)
    expect(email.unsubscribeUrl).toContain("/unsubscribe?")

    const [run] = await runsOf(flow.id)
    const deliveries = await database
      .select()
      .from(customShellAutomationDeliveries)
      .where(
        and(
          eq(customShellAutomationDeliveries.runId, run.id),
          eq(customShellAutomationDeliveries.status, "sent")
        )
      )
    expect(deliveries).toHaveLength(1)
  })

  it("skips somebody who opted out, and the run carries on", async () => {
    await insertFlow(alpha, CLAIM_APPROVED_KIND, {}, { subject: "Hi", body: "Hello" })
    const at = now()
    await database.insert(customShellContacts).values({
      id: uuid(),
      workspaceId: alpha,
      email: "joe@diner.test",
      status: "unsubscribed",
      unsubscribedAt: at,
      tags: [],
      createdAt: at,
      updatedAt: at,
    })
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)
    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)

    await runAutomationTick(database)
    await runAutomationTick(database)

    expect(
      vi.mocked(sendDirectoryEmail).mock.calls.some(([email]) => email.subject === "Hi")
    ).toBe(false)
  })

  it("leaves an unknown word as written and empties a missing featured date", () => {
    expect(
      fillDirectoryEmail("{{name}} {{nope}} {{featuredEndsOn}}", { name: "Ann" })
    ).toBe("Ann {{nope}} ")
  })
})

describe("the site's name in the facts", () => {
  it("is read fresh, so a renamed site writes its new name", async () => {
    await database
      .update(customShellWorkspaces)
      .set({ name: "Alpha Renamed" })
      .where(eq(customShellWorkspaces.id, alpha))
    const flow = await insertFlow(alpha, CLAIM_APPROVED_KIND)
    const listing = await publishedListing(alpha, "Joe's Diner")
    const { claim } = await pendingClaim(alpha, listing.id)
    await reviewClaim(alpha, claim.id, { decision: "approve", reviewerId: admin }, database)
    const [run] = await runsOf(flow.id)
    expect(run.triggerFacts?.siteName).toBe("Alpha Renamed")
  })
})
