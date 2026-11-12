import { and, asc, count, eq, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm"

import { CRM_PAGE_BLOCK_TYPES, defaultCrmPage, withCrmSectionsBlock } from "@/lib/crm/crm-page"
import type { CrmStage } from "@/lib/crm/crm"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { listInboundAddresses } from "@/server/crm/addresses"
import { waitingConditions, waitingCutoff } from "@/server/crm/inbox"
import { listWorkspaceSegments } from "@/server/people/contact-segments"
import { getEmailSettings } from "@/server/email/settings"
import { db, type CustomShellDb } from "@/server/db"
import { countSubscribersAndLeads } from "@/server/crm/people"
import {
  customShellBroadcasts,
  customShellCrmLeads,
  customShellCrmPages,
  customShellCrmThreads,
} from "@/server/schema"

/**
 * The CRM dashboard's left page, one per site (the Admin 3 panel design,
 * 7 Nov 2026): what is written on it, its cover photo, and its lock. Locked,
 * the page reads only, and a save is refused here as well as on screen.
 */

export const CRM_PAGE_LOCKED = "CRM_PAGE_LOCKED"
export const CRM_PAGE_TOO_LONG = "CRM_PAGE_TOO_LONG"

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/**
 * A page's words cleaned to what it may hold. It always keeps its Dashboards
 * block, put back at the top if it is missing, since it is the only way
 * between the sections. A page with every other block taken off and nothing
 * typed is still a choice, so it is kept rather than read as a page never
 * written on.
 */
function cleanPage(text: string) {
  const stored = storedPageBody(text, CRM_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withCrmSectionsBlock(JSON.parse(stored)))
}

export async function getCrmPage(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<StoredPage> {
  const [row] = await database
    .select()
    .from(customShellCrmPages)
    .where(eq(customShellCrmPages.workspaceId, workspaceId))
    .limit(1)
  // Read through the same cleaning a save runs, so a block that has since
  // left the page (the Emails block, 7 Nov 2026) is not handed to the editor.
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultCrmPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  workspaceId: string,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null; coverImages: string[] }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(customShellCrmPages)
    .values({ workspaceId, body: "", locked: false, coverUrl: null, ...values, updatedAt: at })
    .onConflictDoUpdate({
      target: customShellCrmPages.workspaceId,
      set: { ...values, updatedAt: at },
    })
}

/**
 * Saves what is written. Cleaned to what the page may hold first, the same
 * rule the editor ran. An emptied page is stored as "", which draws the
 * starting blocks again; that is a page with nothing on it, not a lost one.
 */
export async function saveCrmPageBody(
  workspaceId: string,
  body: string,
  database: CustomShellDb = db
) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(CRM_PAGE_TOO_LONG)
  const page = await getCrmPage(workspaceId, database)
  if (page.locked) throw new Error(CRM_PAGE_LOCKED)
  await upsertPage(workspaceId, { body: cleanPage(body) }, database)
}

export async function setCrmPageLock(
  workspaceId: string,
  locked: boolean,
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setCrmPageCover(
  workspaceId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, cover, database)
}

/** What the left page's blocks draw. */
export type CrmBlockFigures = {
  /** Each address mail arrives at, with its open conversations. */
  emails: { id: string; address: string; label: string; open: number }[]
  /** Leads whose chase date has come, soonest first, at most 20. */
  followUps: {
    leadId: string
    name: string | null
    email: string
    followUpAt: string
    note: string | null
    threadId: string | null
  }[]
  /** How many leads are at each stage. */
  stages: Record<CrmStage, number>
  /** Every open conversation: the panel's muted line, and Inbox's count in the Dashboards block. */
  openCount: number
  /** Every subscriber: Subscribers' count in the Dashboards block. */
  subscriberCount: number
  /** Every lead: Leads' count in the Dashboards block. */
  leadCount: number
  /** Every newsletter, sent or not, templates aside: Broadcasts' count. */
  broadcastCount: number
  /** After how many days the bell chases unanswered mail; 0 is off. */
  unansweredDays: number
  /**
   * Open conversations they wrote last and nobody answered for that many
   * days, the longest waiting first, at most 20 (CRM task 11).
   */
  waiting: {
    threadId: string
    name: string | null
    email: string
    subject: string
    lastMessageAt: string
  }[]
  /**
   * Every saved segment of contacts with how many are in it, A to Z: the
   * Segments block, and the People tab's pills after its fixed ones.
   */
  segments: { id: string; name: string; total: number }[]
}

const FOLLOW_UPS_SHOWN = 20

export async function getCrmBlockFigures(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CrmBlockFigures> {
  const settings = await getEmailSettings(workspaceId, database)
  const unansweredDays = settings?.crmUnansweredDays ?? 3
  const waitedSince = waitingCutoff(unansweredDays)

  const [addresses, openByAddress, due, stageRows, waiting, segments, people, [broadcasts]] = await Promise.all([
    listInboundAddresses(workspaceId, database),
    database
      .select({
        address: sql<string>`lower(${customShellCrmThreads.toAddress})`,
        open: count(),
      })
      .from(customShellCrmThreads)
      .where(
        and(
          eq(customShellCrmThreads.workspaceId, workspaceId),
          eq(customShellCrmThreads.status, "open"),
          isNotNull(customShellCrmThreads.toAddress)
        )
      )
      .groupBy(sql`lower(${customShellCrmThreads.toAddress})`),
    database
      .select({
        leadId: customShellCrmLeads.id,
        name: customShellCrmLeads.name,
        email: customShellCrmLeads.email,
        followUpAt: customShellCrmLeads.followUpAt,
        note: customShellCrmLeads.followUpNote,
      })
      .from(customShellCrmLeads)
      .where(
        and(
          eq(customShellCrmLeads.workspaceId, workspaceId),
          // The moment, as the row's "To follow up" and the chase job both
          // use, so the block never lists someone the row does not flag.
          lte(customShellCrmLeads.followUpAt, now()),
          // A lead already won or lost is never chased, as the follow-up job says.
          notInArray(customShellCrmLeads.stage, ["won", "lost"])
        )
      )
      .orderBy(asc(customShellCrmLeads.followUpAt))
      .limit(FOLLOW_UPS_SHOWN),
    database
      .select({ stage: customShellCrmLeads.stage, total: count() })
      .from(customShellCrmLeads)
      .where(eq(customShellCrmLeads.workspaceId, workspaceId))
      .groupBy(customShellCrmLeads.stage),
    unansweredDays > 0
      ? database
          .select({
            threadId: customShellCrmThreads.id,
            name: customShellCrmLeads.name,
            email: customShellCrmLeads.email,
            subject: customShellCrmThreads.subject,
            lastMessageAt: customShellCrmThreads.lastMessageAt,
          })
          .from(customShellCrmThreads)
          .innerJoin(customShellCrmLeads, eq(customShellCrmLeads.id, customShellCrmThreads.leadId))
          .where(
            and(
              eq(customShellCrmThreads.workspaceId, workspaceId),
              waitingConditions(waitedSince)
            )
          )
          .orderBy(asc(customShellCrmThreads.lastMessageAt))
          .limit(FOLLOW_UPS_SHOWN)
      : Promise.resolve([]),
    listWorkspaceSegments(workspaceId, database),
    countSubscribersAndLeads(workspaceId, database),
    database
      .select({ total: count() })
      .from(customShellBroadcasts)
      .where(eq(customShellBroadcasts.workspaceId, workspaceId)),
  ])

  // Each lead's newest conversation, which pressing the row opens.
  const newest = new Map<string, string>()
  if (due.length) {
    const threads = await database
      .select({ id: customShellCrmThreads.id, leadId: customShellCrmThreads.leadId })
      .from(customShellCrmThreads)
      .where(
        and(
          eq(customShellCrmThreads.workspaceId, workspaceId),
          inArray(
            customShellCrmThreads.leadId,
            due.map((row) => row.leadId)
          )
        )
      )
      .orderBy(asc(customShellCrmThreads.lastMessageAt))
    for (const thread of threads) newest.set(thread.leadId, thread.id)
  }

  const open = new Map(openByAddress.map((row) => [row.address, Number(row.open)]))
  const [openRow] = await database
    .select({ open: count() })
    .from(customShellCrmThreads)
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.status, "open")
      )
    )
  // Conversations from before the list have no address recorded. They came to
  // the first one, which was the only one then.
  const first = addresses[0]?.address.toLowerCase()
  if (first) {
    const [unknown] = await database
      .select({ open: count() })
      .from(customShellCrmThreads)
      .where(
        and(
          eq(customShellCrmThreads.workspaceId, workspaceId),
          eq(customShellCrmThreads.status, "open"),
          isNull(customShellCrmThreads.toAddress)
        )
      )
    open.set(first, (open.get(first) ?? 0) + Number(unknown?.open ?? 0))
  }
  const stages: Record<CrmStage, number> = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }
  for (const row of stageRows) stages[row.stage] = Number(row.total)

  return {
    emails: addresses.map((address) => ({
      ...address,
      open: open.get(address.address.toLowerCase()) ?? 0,
    })),
    followUps: due.flatMap((row) =>
      row.followUpAt
        ? [
            {
              leadId: row.leadId,
              name: row.name,
              email: row.email,
              followUpAt: row.followUpAt.toISOString(),
              note: row.note,
              threadId: newest.get(row.leadId) ?? null,
            },
          ]
        : []
    ),
    stages,
    openCount: Number(openRow?.open ?? 0),
    subscriberCount: people.subscribers,
    leadCount: people.leads,
    broadcastCount: Number(broadcasts?.total ?? 0),
    unansweredDays,
    waiting: waiting.map((row) => ({ ...row, lastMessageAt: row.lastMessageAt.toISOString() })),
    segments: segments.map((row) => ({
      id: row.segment.id,
      name: row.segment.name,
      total: row.total,
    })),
  }
}
