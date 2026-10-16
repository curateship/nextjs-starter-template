import { and, asc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import {
  automationEntryNodeId,
  automationTriggerKind,
  type AutomationTriggerFacts,
} from "@/lib/automations/run"
import {
  CLAIM_APPROVED_KIND,
  DIRECTORY_TRIGGER_LABELS,
  FEATURED_ENDING_DAYS,
  FEATURED_ENDING_KIND,
  readDirectoryEmailSettings,
  readFeaturedDaysBefore,
  SUBMISSION_APPROVED_KIND,
  SUBMISSION_ARRIVED_KIND,
  type DirectoryTriggerKind,
} from "@/lib/directory/automation-nodes"
import { formatUtcDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { now, uuid } from "@/server/auth/security"
import { readAutomationsPaused } from "@/server/automations/pause"
import { claimTriggerScan } from "@/server/automations/triggers"
import type {
  AutomationExecutor,
  AutomationExecutorContext,
} from "@/server/automations/executors"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryFeaturedEntitlements,
  directoryListings,
} from "@/server/directory/schema"
import { directorySiteUrl } from "@/server/directory/site-url"
import {
  buildUnsubscribeUrl,
  canBuildUnsubscribeLinks,
} from "@/server/email/unsubscribe"
import { upsertWorkspaceContact } from "@/server/people/contacts"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
  customShellContacts,
  customShellUsers,
  customShellWorkspaces,
  type CustomShellContact,
} from "@/server/schema"

/**
 * Directory events that start automation flows.
 *
 * - **After the write, never inside it.** Each caller fires once its own
 *   change has been saved, and `fireDirectoryEvent` never throws: a flow that
 *   cannot start is logged and the approval stands.
 * - **Only this site's flows.** A flow on site A never starts from site B's
 *   events; every look is filtered by the event's site.
 * - **Once.** Each run carries a key naming the one thing it was started for,
 *   a submission, a claim or a featured spot, and the shell's unique index on
 *   (flow, key) refuses a second run. A ticker run twice, or two servers at
 *   once, end with one run.
 * - **The person becomes a contact**, Tyler's call on 16 Oct 2026, but only
 *   when a live flow is actually starting for them. A site with no directory
 *   flows adds nobody to People.
 *
 * This is the shell's own `fireAutomationTrigger` rewritten for a person who
 * may have no account. That function needs a member id, and a submitter has
 * only an email address; changing it would be editing the shell.
 */

/** The person a directory event is about. */
type DirectoryEventPerson = {
  email: string
  name: string
  /** Their account, when they have one: a claimant or a featured buyer. */
  userId?: string | null
}

type DirectoryEvent = {
  siteId: string
  kind: DirectoryTriggerKind
  /** What makes this moment this moment: a submission, claim or spot id. */
  key: string
  person: DirectoryEventPerson
  /** The listing, when there is one yet. */
  listingId?: string | null
  /** The listing's name when there is no listing yet: a submission's business name. */
  listingTitle?: string
  /** Facts only one trigger has, such as when a featured spot ends. */
  extraFacts?: AutomationTriggerFacts
  /** Narrows the flows to the ones whose settings match, such as the days before. */
  matches?: (settings: Record<string, unknown>) => boolean
}

type WatchingFlow = {
  id: string
  userId: string | null
  config: ReturnType<typeof automationCompiledConfigSchema.parse>
  entryNodeId: string
  settings: Record<string, unknown>
}

/** A cap on how many featured spots one scan starts flows for. The blast radius. */
const FEATURED_SCAN_LIMIT = 100
const TRIGGER_KEY_MAX = 200
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The live flows on this site that begin with this trigger. A stored config
 * that cannot be read is skipped, so one broken flow never stops the others.
 */
async function flowsWatching(
  siteId: string,
  kind: DirectoryTriggerKind,
  matches: (settings: Record<string, unknown>) => boolean,
  database: CustomShellDb
): Promise<WatchingFlow[]> {
  const rows = await database
    .select({
      id: customShellAutomations.id,
      userId: customShellAutomations.userId,
      compiledConfig: customShellAutomations.compiledConfig,
    })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.workspaceId, siteId),
        eq(customShellAutomations.enabled, true),
        isNotNull(customShellAutomations.compiledConfig)
      )
    )

  const watching: WatchingFlow[] = []
  for (const row of rows) {
    const parsed = automationCompiledConfigSchema.safeParse(row.compiledConfig)
    if (!parsed.success) continue
    if (automationTriggerKind(parsed.data) !== kind) continue
    const entryNodeId = automationEntryNodeId(parsed.data)
    const entry = entryNodeId ? parsed.data.nodes[entryNodeId] : undefined
    if (!entryNodeId || !entry || !matches(entry.settings)) continue
    watching.push({
      id: row.id,
      userId: row.userId,
      config: parsed.data,
      entryNodeId,
      settings: entry.settings,
    })
  }
  return watching
}

/**
 * The person's contact on this site, made if they have none. An existing
 * contact is used as it is: their name and their opt-out are left alone.
 */
async function contactFor(
  siteId: string,
  person: DirectoryEventPerson,
  database: CustomShellDb
): Promise<CustomShellContact> {
  const email = person.email.trim().toLowerCase()
  const [existing] = await database
    .select()
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, siteId),
        sql`lower(${customShellContacts.email}) = ${email}`
      )
    )
    .limit(1)
  if (existing) return existing

  const parts = person.name.trim().split(/\s+/).filter(Boolean)
  return upsertWorkspaceContact(
    siteId,
    {
      email,
      firstName: parts[0] ?? null,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
      source: "Directory",
    },
    database
  )
}

/** The facts every directory run carries, which the email step fills in. */
async function eventFacts(
  event: DirectoryEvent,
  database: CustomShellDb
): Promise<AutomationTriggerFacts | null> {
  const [site] = await database
    .select({
      name: customShellWorkspaces.name,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, event.siteId))
    .limit(1)
  if (!site) return null

  const siteLink = directorySiteUrl(site)
  let listingTitle = event.listingTitle ?? ""
  let listingLink = ""
  if (event.listingId) {
    const [listing] = await database
      .select({
        title: directoryListings.title,
        slug: directoryListings.slug,
        status: directoryListings.status,
      })
      .from(directoryListings)
      .where(
        and(
          eq(directoryListings.id, event.listingId),
          eq(directoryListings.workspaceId, event.siteId)
        )
      )
      .limit(1)
    if (listing) {
      listingTitle = listing.title
      // A draft's address answers "not found", so it is not handed out.
      listingLink =
        listing.status === "published"
          ? `${siteLink}/directory/${listing.slug}`
          : ""
    }
  }

  return {
    name: event.person.name.trim(),
    email: event.person.email.trim().toLowerCase(),
    listingTitle,
    listingLink,
    siteName: site.name,
    siteLink,
    ...event.extraFacts,
  }
}

/**
 * Starts every live flow on the event's site that begins with its trigger.
 * Returns how many started. Throws on a database fault; callers outside this
 * file use `fireDirectoryEvent`, which does not.
 */
async function startDirectoryFlows(
  event: DirectoryEvent,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  return database.transaction(async (tx) => {
    // Skipped rather than queued, like every shell trigger: lifting a pause
    // must not release a burst of week-old welcomes.
    if (await readAutomationsPaused(tx)) return 0

    const flows = await flowsWatching(
      event.siteId,
      event.kind,
      event.matches ?? (() => true),
      tx
    )
    if (flows.length === 0) return 0

    const facts = await eventFacts(event, tx)
    if (!facts) return 0
    const contact = await contactFor(event.siteId, event.person, tx)
    const label = (
      facts.name ? `${facts.name} (${contact.email})` : contact.email
    ).slice(0, 200)

    let started = 0
    for (const flow of flows) {
      const [run] = await tx
        .insert(customShellAutomationRuns)
        .values({
          id: uuid(),
          automationId: flow.id,
          userId: flow.userId,
          workspaceId: event.siteId,
          status: "active",
          currentNodeId: flow.entryNodeId,
          configSnapshot: flow.config,
          wakeAt: timestamp,
          attempts: 0,
          subjectUserId: contact.userId ?? event.person.userId ?? null,
          subjectContactId: contact.id,
          subjectLabel: label,
          triggerKind: event.kind,
          triggerKey: `${event.kind}:${event.key}`.slice(0, TRIGGER_KEY_MAX),
          triggerFacts: facts,
          startedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: customShellAutomationRuns.id })
      if (run) started += 1
    }
    return started
  })
}

/**
 * The callers' door: starts the flows and never throws. A flow that cannot
 * start must not undo or block the approval that just happened.
 */
export async function fireDirectoryEvent(
  event: DirectoryEvent,
  database: CustomShellDb = db
): Promise<number> {
  try {
    return await startDirectoryFlows(event, database)
  } catch (error) {
    console.error(
      `[cms directory] ${DIRECTORY_TRIGGER_LABELS[event.kind]} could not start its flows`,
      error
    )
    return 0
  }
}

/** A submission reached the review queue: its sender confirmed their address. */
export function fireSubmissionArrived(
  submission: {
    id: string
    workspaceId: string
    businessName: string
    contactEmail: string
  },
  database: CustomShellDb = db
) {
  return fireDirectoryEvent(
    {
      siteId: submission.workspaceId,
      kind: SUBMISSION_ARRIVED_KIND,
      key: submission.id,
      person: { email: submission.contactEmail, name: "" },
      listingTitle: submission.businessName,
    },
    database
  )
}

/** A submission was approved and became a published listing. */
export function fireSubmissionApproved(
  submission: {
    id: string
    workspaceId: string
    businessName: string
    contactEmail: string
  },
  listingId: string,
  database: CustomShellDb = db
) {
  return fireDirectoryEvent(
    {
      siteId: submission.workspaceId,
      kind: SUBMISSION_APPROVED_KIND,
      key: submission.id,
      person: { email: submission.contactEmail, name: "" },
      listingId,
      listingTitle: submission.businessName,
    },
    database
  )
}

/** Somebody's claim on a listing was approved. */
export function fireClaimApproved(
  claim: {
    id: string
    workspaceId: string
    listingId: string
    userId: string
    contactEmail: string
    claimantName: string
  },
  database: CustomShellDb = db
) {
  return fireDirectoryEvent(
    {
      siteId: claim.workspaceId,
      kind: CLAIM_APPROVED_KIND,
      key: claim.id,
      person: {
        email: claim.contactEmail,
        name: claim.claimantName,
        userId: claim.userId,
      },
      listingId: claim.listingId,
    },
    database
  )
}

/** The whole days between now and then, rounded up: "3 days left". */
function daysUntil(target: Date, from: Date): number {
  return Math.ceil((target.getTime() - from.getTime()) / DAY_MS)
}

/**
 * Featured spots that have crossed into a flow's window.
 *
 * Keyed to the spot alone, so each spot starts each flow once whatever this
 * finds on later looks. Only spots on a listing: an event's spot ends with the
 * event, and a spot with no listing has nobody's listing to write about.
 */
export async function scanFeaturedEndingTriggers(
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const rows = await database
    .select({
      workspaceId: customShellAutomations.workspaceId,
      compiledConfig: customShellAutomations.compiledConfig,
    })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.enabled, true),
        isNotNull(customShellAutomations.compiledConfig)
      )
    )

  // The widest window any live flow on each site asked for. Nothing outside
  // it can matter to any of them.
  const widest = new Map<string, number>()
  for (const row of rows) {
    const parsed = automationCompiledConfigSchema.safeParse(row.compiledConfig)
    if (!parsed.success) continue
    if (automationTriggerKind(parsed.data) !== FEATURED_ENDING_KIND) continue
    const entry = parsed.data.nodes[automationEntryNodeId(parsed.data) ?? ""]
    if (!entry) continue
    const days = readFeaturedDaysBefore(entry.settings)
    widest.set(row.workspaceId, Math.max(widest.get(row.workspaceId) ?? 0, days))
  }
  if (widest.size === 0) return 0

  const spots = await database
    .select({
      id: directoryFeaturedEntitlements.id,
      workspaceId: directoryFeaturedEntitlements.workspaceId,
      listingId: directoryFeaturedEntitlements.listingId,
      endsAt: directoryFeaturedEntitlements.endsAt,
      buyerId: customShellUsers.id,
      buyerName: customShellUsers.name,
      buyerEmail: customShellUsers.email,
    })
    .from(directoryFeaturedEntitlements)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId)
    )
    .where(
      and(
        inArray(directoryFeaturedEntitlements.workspaceId, [...widest.keys()]),
        eq(directoryFeaturedEntitlements.status, "active"),
        isNotNull(directoryFeaturedEntitlements.listingId),
        gt(directoryFeaturedEntitlements.endsAt, timestamp),
        lte(
          directoryFeaturedEntitlements.endsAt,
          new Date(timestamp.getTime() + FEATURED_ENDING_DAYS.max * DAY_MS)
        )
      )
    )
    .orderBy(asc(directoryFeaturedEntitlements.endsAt))
    .limit(FEATURED_SCAN_LIMIT + 1)

  if (spots.length > FEATURED_SCAN_LIMIT) {
    console.warn(
      `Featured-ending scan took the ${FEATURED_SCAN_LIMIT} spots closest to ending. The rest wait until those end.`
    )
  }

  let started = 0
  for (const spot of spots.slice(0, FEATURED_SCAN_LIMIT)) {
    const left = daysUntil(spot.endsAt, timestamp)
    if (left > (widest.get(spot.workspaceId) ?? 0)) continue
    started += await fireDirectoryEvent(
      {
        siteId: spot.workspaceId,
        kind: FEATURED_ENDING_KIND,
        key: spot.id,
        person: {
          email: spot.buyerEmail,
          name: spot.buyerName,
          userId: spot.buyerId,
        },
        listingId: spot.listingId,
        extraFacts: {
          featuredEndsOn: formatUtcDate(spot.endsAt),
          daysLeft: left,
        },
        matches: (settings) => left <= readFeaturedDaysBefore(settings),
      },
      database
    )
  }
  return started
}

/**
 * The background ticker's turn. One look every ten minutes across every
 * server, through the shell's own scan claim, and nothing at all while no
 * live flow watches for a featured spot.
 */
export async function featuredEndingTick() {
  if (!(await claimTriggerScan(FEATURED_ENDING_KIND, 10))) return
  await scanFeaturedEndingTriggers()
}

/**
 * What a directory trigger does when the run reaches it: writes the first
 * line of the run's history, naming the moment and the person. The work
 * happened before the run existed.
 */
export const directoryTriggerExecutor: AutomationExecutor = async ({
  run,
}) => {
  const kind = run.triggerKind as DirectoryTriggerKind | null
  const who = run.subjectLabel?.trim()
  const facts = run.triggerFacts
  if (!kind || !(kind in DIRECTORY_TRIGGER_LABELS) || !who || !facts) {
    throw new Error(
      "This run has no directory event or person, so it cannot continue."
    )
  }
  const about = facts.listingTitle ? ` about ${facts.listingTitle}` : ""
  const days =
    typeof facts.daysLeft === "number"
      ? `, ${facts.daysLeft} ${plural(facts.daysLeft, "day", "days")} left`
      : ""
  return {
    type: "next",
    summary: `${DIRECTORY_TRIGGER_LABELS[kind]}${about}, for ${who}${days}.`,
  }
}

/** `{{word}}` filled from the run's facts. Unknown words are left as written. */
export function fillDirectoryEmail(
  template: string,
  facts: AutomationTriggerFacts
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, word: string) => {
    if (!(word in facts)) {
      return word === "featuredEndsOn" ? "" : whole
    }
    const value = facts[word]
    return value === null || value === undefined ? "" : String(value)
  })
}

/**
 * The "Email about the listing" step: one email to the person the run is
 * about, with the listing filled in.
 *
 * The delivery row is reserved before the send, the same as the shell's own
 * email step, so a retried step can never send twice. Somebody who opted out
 * in People is skipped, and a failed send is written in the run's history;
 * either way the run carries on.
 */
export async function executeDirectoryEmailStep({
  database,
  run,
  nodeId,
  settings: raw,
  now: clock,
}: AutomationExecutorContext) {
  const settings = readDirectoryEmailSettings(raw)
  if (!run.subjectContactId || !run.workspaceId) {
    throw new Error(
      "This flow did not start from a directory trigger, so there is nobody for this email to go to."
    )
  }

  const [contact] = await database
    .select()
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.id, run.subjectContactId),
        eq(customShellContacts.workspaceId, run.workspaceId)
      )
    )
    .limit(1)
  if (!contact) {
    return {
      type: "next" as const,
      summary: "Nobody was emailed: this person is no longer in People.",
    }
  }
  // Cold still counts as reachable, the same as the shell's own email step.
  if (contact.status !== "subscribed" && contact.status !== "cold") {
    return {
      type: "next" as const,
      summary: `${contact.email} was not emailed: they have opted out.`,
    }
  }
  if (!canBuildUnsubscribeLinks()) {
    throw new Error(
      "Unsubscribe links are not set up, so this email cannot be sent safely."
    )
  }

  const facts: AutomationTriggerFacts = {
    ...run.triggerFacts,
    email: contact.email,
    name:
      (typeof run.triggerFacts?.name === "string" && run.triggerFacts.name) ||
      contact.firstName ||
      "",
  }
  const subject = fillDirectoryEmail(settings.subject, facts)
    .replace(/[\r\n]+/g, " ")
    .trim()
  const lines = fillDirectoryEmail(settings.body, facts)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const id = uuid()
  const [reserved] = await database
    .insert(customShellAutomationDeliveries)
    .values({
      id,
      runId: run.id,
      nodeId,
      contactId: contact.id,
      userId: contact.userId,
      toEmail: contact.email,
      subject,
      status: "failed",
      error: "The send was interrupted, so delivery could not be confirmed.",
      createdAt: clock(),
    })
    .onConflictDoNothing()
    .returning({ id: customShellAutomationDeliveries.id })
  if (!reserved) {
    // Never sent twice. A send that was interrupted or refused stays that way,
    // the same as the shell's own email step.
    return {
      type: "next" as const,
      summary: `This step already tried ${contact.email}, so it did not send again.`,
    }
  }

  let error: string | null = null
  try {
    await sendDirectoryEmail(
      {
        workspaceId: run.workspaceId,
        to: contact.email,
        subject,
        lines,
        unsubscribeUrl: buildUnsubscribeUrl(contact.id),
        unsubscribeLabel: `Stop emails from ${String(facts.siteName ?? "this site")}`,
      },
      database
    )
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure)
  }
  await database
    .update(customShellAutomationDeliveries)
    .set({ status: error ? "failed" : "sent", error })
    .where(eq(customShellAutomationDeliveries.id, id))

  // Said in the history and carried on from, like the shell's own email step:
  // the rest of the flow does not wait on one address.
  if (error) {
    return {
      type: "next" as const,
      summary: `Could not send to ${contact.email}: ${error}`,
    }
  }
  return {
    type: "next" as const,
    summary: `Sent “${subject}” to ${contact.email}.`,
  }
}
