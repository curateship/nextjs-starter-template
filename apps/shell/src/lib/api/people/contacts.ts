import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CONTACT_SORT_COLUMNS } from "@/lib/contacts/contact-sort"
import {
  contactFilterSchema,
  type ContactFilterInput,
} from "@/lib/contacts/contact-filter"
import {
  CONTACT_SEGMENT_STATUSES,
  rulesShowingSegment,
  type ContactSegmentStatus,
  type SegmentKind,
  type SegmentRuleOptions,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import {
  CONTACT_SHORTCUTS,
  type ContactShortcutKey,
} from "@/lib/contacts/contact-shortcuts"
import { CONTACT_IMPORT_BATCH, CONTACT_NOTES_MAX } from "@/lib/contacts/contact-csv"
import type { SegmentItem } from "@/lib/api/people/contact-segments"

import {
  countContactEmails,
  deleteWorkspaceContacts,
  deleteWorkspaceContactsMatching,
  getWorkspaceContact,
  importWorkspaceContacts,
  listWorkspaceContacts,
  listWorkspaceTags,
  setContactStatus,
  setContactStatusMatching,
  setWorkspaceContactNotes,
  setWorkspaceContactTags,
  syncContactsFromUsers,
  upsertWorkspaceContact,
} from "@/server/people/contacts"
import {
  countContactsMatchingEach,
  listSegmentsForContact,
  listWorkspaceContactSources,
  listWorkspaceSegments,
} from "@/server/people/contact-segments"
import {
  countPeople,
  getLeadPeople,
  leadsForContacts,
  listLeadPeople,
  listPeopleOrder,
  type LeadPersonRow,
} from "@/server/crm/people"
import type { CrmStage } from "@/lib/crm/crm"
import { listContactDeliveries } from "@/server/email/deliveries"
import { adminGet, adminPost } from "@/server/guards"
import { listPlans } from "@/server/billing/plans"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

/**
 * The five things a contact's status can be.
 *
 * An alias rather than a second list. It used to be its own four names written
 * out here, which is how adding 'cold' left the table, the segment rules and
 * this page each believing something different about how many statuses exist.
 * One list, in `contact-segments.ts`, beside the labels and the badge colours.
 */
export type ContactStatus = ContactSegmentStatus

export type ContactItem = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  tags: string[]
  status: ContactStatus
  source: string | null
  /**
   * The account this contact is, or null for a typed-in address that belongs to
   * nobody. The id rather than a yes-or-no, because the open contact links
   * straight to that account and a boolean cannot say which one.
   */
  userId: string | null
  /**
   * When anything was last sent to them, or null for somebody who has never
   * been emailed. The newest row in `deliveries` for them — the same date their
   * panel shows at the top of its history.
   */
  lastEmailedAt: string | null
  /**
   * How many newsletters reached them and how many of those they opened: the
   * list's "Opened 2 of 3". See `deliveryCounts` for what counts.
   */
  emailsSent: number
  emailsOpened: number
  created_at: string
}

/** The one list of sortable columns, kept browser-safe — see `lib/contact-sort`. */
export type { ContactSortColumn } from "@/lib/contacts/contact-sort"

/** A lead on the CRM People list (`src/server/crm/people.ts`). */
export type LeadPersonItem = {
  id: string
  email: string
  name: string | null
  company: string | null
  source: string | null
  stage: CrmStage
  valueCents: number
  follow_up_at: string | null
  created_at: string
  tags: string[]
  /** Their newest conversation, or null when nobody has written yet. */
  newestThreadId: string | null
  /** The contact with the same address, so the row reads "Lead + Subscriber". */
  contactId: string | null
}

/**
 * One row of the People list, in the order drawn. A contact row points into
 * `contacts` and names the lead with the same address when there is one; a
 * lead row carries the lead.
 */
export type PersonRow =
  | { kind: "contact"; id: string; leadId: string | null }
  | { kind: "lead"; id: string; lead: LeadPersonItem }

export type ContactsPage = {
  /** The contacts on this page, in no order of their own: `rows` is the order. */
  contacts: ContactItem[]
  /** Every row on this page, contacts and leads, in the order drawn. */
  rows: PersonRow[]
  /** The All and Leads pills: everybody once, and every lead. */
  peopleCounts: { all: number; leads: number }
  total: number
  tags: string[]
  /**
   * Everything the list's filters can name, in the same shape the segment
   * window's rule builder is handed — one builder, one set of choices.
   */
  sources: string[]
  plans: { slug: string; name: string }[]
  /**
   * Every segment with its rules and how many people are in it now: the left
   * panel's Segments card. Any of them can be named in a filter rule; only a
   * hand-picked one can have people added to it or taken out.
   */
  segments: SegmentItem[]
  /** How many people each row of the People card holds, counted by its rules. */
  shortcuts: Record<ContactShortcutKey, number>
  /** The address named a segment that is not there any more. */
  segmentMissing: boolean
  /**
   * How many rows this page holds. Settled on the server so the loader can ask
   * for the first page at the size the table will actually show, rather than
   * fetching one size and then immediately fetching another.
   */
  pageSize: number
}

/** One email this contact was sent, and what became of it. */
export type ContactDelivery = {
  id: string
  subject: string
  /**
   * The newsletter it came from, or null when that newsletter has since been
   * deleted. The send still happened, so it is still listed — just with nothing
   * to open.
   */
  broadcastId: string | null
  status: "sent" | "failed"
  /** Set when the mail bounced back after it was handed over. */
  bouncedAt: string | null
  /** The first open and the first click the mail provider reported. */
  openedAt: string | null
  clickedAt: string | null
  /** Why it failed, when it did. */
  error: string | null
  created_at: string
}

/**
 * Everything about one contact the list itself does not already hold.
 *
 * The list has their name, address, tags and status; this is the part that
 * needs its own queries — the segments they are in right now and what has been
 * sent to them. Fetched when the window opens rather than with every page of
 * the list, which would be one of these per row.
 */
export type ContactDetail = {
  contact: ContactItem
  /** The Notes box, empty when nothing was written. */
  notes: string
  segments: { id: string; name: string; kind: SegmentKind }[]
  history: ContactDelivery[]
  /** There is another page of history below this one. */
  hasMore: boolean
}

/** The contacts page's own payload, read as the rule builder's choices. */
export function contactFilterOptions(page: ContactsPage): SegmentRuleOptions {
  return {
    tags: page.tags,
    sources: page.sources,
    plans: page.plans,
    segments: page.segments,
  }
}

const contactErrorMessages: Record<string, string> = {
  EMAIL_REQUIRED: "An email address is the one thing we need.",
  SAVE_FAILED: "We could not save that. Please try again.",
  CONTACT_NOT_FOUND: "That contact is no longer on the list.",
}

export const getContactErrorMessage = createErrorMessage(
  contactErrorMessages,
  "We could not save that change. Please try again."
)

export const getContactLoadErrorMessage = createErrorMessage(
  contactErrorMessages,
  "We could not load your contacts. Please try again."
)

// The list is the filter plus how to order and page it, so it extends the one
// filter schema rather than restating it — see `contactFilterSchema`.
const listSchema = contactFilterSchema.extend({
  // Checked against the fixed list rather than passed through: this names a
  // column, and anything the database is asked to order by has to come from
  // us, never from whatever the browser sent.
  sort: z.enum(CONTACT_SORT_COLUMNS).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  /** 1-based. The offset is worked out from it, so there is one way to page. */
  page: z.number().int().min(1).max(10_000).optional(),
  /** A segment to show when there are no rules of its own: see `ContactsPage.rules`. */
  segmentId: z.string().min(1).max(36).optional(),
  /**
   * The CRM People tab's Leads pill. Without it, a list with no rules and no
   * segment is the All pill: contacts and the leads who are not contacts.
   */
  people: z.enum(["leads"]).optional(),
})

const idsSchema = z.object({
  contactIds: z.array(z.string().min(1).max(36)).max(500),
})

const upsertSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().max(255).nullable().optional(),
  lastName: z.string().trim().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(25).optional(),
  status: z.enum(CONTACT_SEGMENT_STATUSES).optional(),
})


const loadContactsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<ContactsPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    // Opening the list is what brings it up to date with who has signed up.
    // Before the reads, so somebody who joined a minute ago is on the page and
    // in the counts beside it.
    //
    // The rows-per-page setting and the plans read nothing the sync writes, so
    // they run alongside it. Everything else below counts or lists contacts and
    // waits. One `Promise.all`, so a failed sync leaves nothing running that
    // nobody is listening to.
    const [, pageSize, plans] = await Promise.all([
      syncContactsFromUsers(workspaceId),
      data.limit ?? readDashboardRowsPerPage(),
      listPlans(),
    ])
    // Started here and collected below with nothing else awaited in between,
    // so a failure is always caught by the request that started it.
    const segmentsRead = listWorkspaceSegments(workspaceId).then((rows) =>
      rows.map(toSegmentItem)
    )
    // `?segment=<id>` with no rules of its own shows that segment's saved
    // rules, so the list waits for the segments only then.
    const named =
      data.segmentId && !data.rules
        ? (await segmentsRead).find((segment) => segment.id === data.segmentId)
        : undefined
    const rules: SegmentRules | undefined =
      data.rules ?? (named ? rulesShowingSegment(named) : undefined)
    const offset = ((data.page ?? 1) - 1) * pageSize
    // Leads join the list only where segment rules are not in play: the
    // rules are about contacts, and a lead has none of what they read.
    const mixed = !data.people && !rules && !data.segmentId
    const listRead = data.people === "leads"
      ? listLeadPeople(workspaceId, { ...data, limit: pageSize, offset }).then(
          ({ leads, total }) => ({
            contacts: [] as Awaited<ReturnType<typeof listWorkspaceContacts>>["contacts"],
            total,
            rows: leads.map((lead): PersonRow => ({
              kind: "lead",
              id: lead.id,
              lead: toLeadPersonItem(lead),
            })),
          })
        )
      : mixed
        ? listPeopleOrder(workspaceId, { ...data, limit: pageSize, offset }).then(
            async ({ rows: order, total }) => {
              const contactIds = order.filter((row) => row.kind === "contact").map((row) => row.id)
              const leadIds = order.filter((row) => row.kind === "lead").map((row) => row.id)
              const [{ contacts }, leads] = await Promise.all([
                contactIds.length
                  ? listWorkspaceContacts(workspaceId, { onlyIds: contactIds, limit: contactIds.length })
                  : Promise.resolve({ contacts: [] as Awaited<ReturnType<typeof listWorkspaceContacts>>["contacts"] }),
                getLeadPeople(workspaceId, leadIds),
              ])
              const leadById = new Map(leads.map((lead) => [lead.id, lead]))
              const known = new Set(contacts.map((contact) => contact.id))
              return {
                contacts,
                total,
                rows: order.flatMap((row): PersonRow[] => {
                  if (row.kind === "contact") {
                    return known.has(row.id) ? [{ kind: "contact", id: row.id, leadId: null }] : []
                  }
                  const lead = leadById.get(row.id)
                  return lead ? [{ kind: "lead", id: lead.id, lead: toLeadPersonItem(lead) }] : []
                }),
              }
            }
          )
        : listWorkspaceContacts(workspaceId, { ...data, rules, limit: pageSize, offset }).then(
            ({ contacts, total }) => ({
              contacts,
              total,
              rows: contacts.map((contact): PersonRow => ({
                kind: "contact",
                id: contact.id,
                leadId: null,
              })),
            })
          )

    const [listed, tags, sources, shortcutTotals, segments, peopleCounts] =
      await Promise.all([
        listRead,
        listWorkspaceTags(workspaceId),
        listWorkspaceContactSources(workspaceId),
        countContactsMatchingEach(
          workspaceId,
          CONTACT_SHORTCUTS.map((shortcut) => shortcut.rules)
        ),
        segmentsRead,
        countPeople(workspaceId),
      ])
    const { contacts, total } = listed
    // A contact who is a lead too says so on their row.
    const leadOf = await leadsForContacts(workspaceId, contacts)
    const rows = listed.rows.map((row) =>
      row.kind === "contact" ? { ...row, leadId: leadOf.get(row.id) ?? null } : row
    )
    return {
      total,
      rows,
      peopleCounts,
      pageSize,
      tags,
      sources,
      segments,
      segmentMissing: Boolean(
        data.segmentId && !segments.some((segment) => segment.id === data.segmentId)
      ),
      shortcuts: Object.fromEntries(
        CONTACT_SHORTCUTS.map((shortcut, index) => [
          shortcut.key,
          shortcutTotals[index] ?? 0,
        ])
      ) as Record<ContactShortcutKey, number>,
      plans: plans.map((plan) => ({ slug: plan.slug, name: plan.name })),
      contacts: contacts.map(toContactItem),
    }
  })

function toLeadPersonItem(lead: LeadPersonRow): LeadPersonItem {
  return {
    id: lead.id,
    email: lead.email,
    name: lead.name,
    company: lead.company,
    source: lead.source,
    stage: lead.stage,
    valueCents: lead.valueCents,
    follow_up_at: lead.followUpAt?.toISOString() ?? null,
    created_at: lead.createdAt.toISOString(),
    tags: lead.tags,
    newestThreadId: lead.newestThreadId,
    contactId: lead.contactId,
  }
}

function toSegmentItem({
  segment,
  rules,
  total,
}: Awaited<ReturnType<typeof listWorkspaceSegments>>[number]): SegmentItem {
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description,
    kind: segment.kind === "static" ? "static" : "rules",
    rules,
    total,
    created_at: segment.createdAt.toISOString(),
    updated_at: segment.updatedAt.toISOString(),
  }
}

function toContactItem(row: {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  tags: string[]
  status: string
  source: string | null
  userId: string | null
  lastEmailedAt: Date | null
  emailsSent: number
  emailsOpened: number
  createdAt: Date
}): ContactItem {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    tags: row.tags,
    status: row.status as ContactStatus,
    source: row.source,
    userId: row.userId,
    lastEmailedAt: row.lastEmailedAt?.toISOString() ?? null,
    emailsSent: row.emailsSent,
    emailsOpened: row.emailsOpened,
    created_at: row.createdAt.toISOString(),
  }
}

/** How many sends one page of the history holds. */
export const CONTACT_HISTORY_PAGE_SIZE = 10

const contactDetailSchema = z.object({
  contactId: z.string().min(1).max(36),
  /** 1-based, the same way the contacts list itself pages. */
  page: z.number().int().min(1).max(10_000).optional(),
})

const loadContactDetailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(contactDetailSchema)
  .handler(async ({ data, context }): Promise<ContactDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    // Read first, and refuse before doing any work if this contact is not this
    // workspace's. Without it, an id from another workspace would come back as
    // an honest-looking empty history rather than as a refusal.
    const contact = await getWorkspaceContact(workspaceId, data.contactId)
    if (!contact) throw new Error("CONTACT_NOT_FOUND")

    const page = data.page ?? 1
    const [segments, { deliveries, hasMore }, newest, emails] = await Promise.all([
      listSegmentsForContact(workspaceId, contact.id),
      listContactDeliveries(workspaceId, contact.id, {
        limit: CONTACT_HISTORY_PAGE_SIZE,
        offset: (page - 1) * CONTACT_HISTORY_PAGE_SIZE,
      }),
      // The newest send, for "Last emailed". The first page already starts
      // with it; a later page has to ask.
      page > 1
        ? listContactDeliveries(workspaceId, contact.id, { limit: 1, offset: 0 })
        : null,
      countContactEmails(workspaceId, contact.id),
    ])
    const lastSent = (newest?.deliveries ?? deliveries)[0]

    return {
      contact: toContactItem({
        ...contact,
        lastEmailedAt: lastSent?.createdAt ?? null,
        emailsSent: emails.sent,
        emailsOpened: emails.opened,
      }),
      notes: contact.notes,
      segments,
      hasMore,
      history: deliveries.map((row) => ({
        id: row.id,
        subject: row.subject,
        broadcastId: row.broadcastId,
        status: row.status === "failed" ? "failed" : "sent",
        bouncedAt: row.bouncedAt?.toISOString() ?? null,
        openedAt: row.openedAt?.toISOString() ?? null,
        clickedAt: row.clickedAt?.toISOString() ?? null,
        error: row.error,
        created_at: row.createdAt.toISOString(),
      })),
    }
  })

const saveContactFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(upsertSchema)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const saved = await upsertWorkspaceContact(workspaceId, {
      ...data,
      source: "Added by hand",
    })
    return { id: saved.id }
  })

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    idsSchema.extend({ status: z.enum(CONTACT_SEGMENT_STATUSES) })
  )
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      changed: await setContactStatus(
        workspaceId,
        data.contactIds,
        data.status
      ),
    }
  })

const saveTagsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      contactId: z.string().min(1).max(36),
      tags: upsertSchema.shape.tags.unwrap(),
    })
  )
  .handler(async ({ data, context }): Promise<void> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await setWorkspaceContactTags(workspaceId, data.contactId, data.tags)
  })

const saveNotesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      contactId: z.string().min(1).max(36),
      notes: z.string().max(CONTACT_NOTES_MAX),
    })
  )
  .handler(async ({ data, context }): Promise<void> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await setWorkspaceContactNotes(workspaceId, data.contactId, data.notes)
  })

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        email: z.email().max(255),
        firstName: upsertSchema.shape.firstName,
        lastName: upsertSchema.shape.lastName,
        tags: upsertSchema.shape.tags,
      })
    )
    .min(1)
    .max(CONTACT_IMPORT_BATCH),
})

/**
 * One batch of a CSV import: see `importWorkspaceContacts`. The browser reads
 * the file and checks each address with the same rule as here, so a batch
 * refused for one bad address is a bug, not something a person did.
 */
const importContactsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(importSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ added: number; updated: number; unchanged: number }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return importWorkspaceContacts(workspaceId, data.rows)
    }
  )

/** The status of everybody the filters match: see `deleteMatchingContactsFn`. */
const setStatusMatchingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    contactFilterSchema.extend({ status: z.enum(CONTACT_SEGMENT_STATUSES) })
  )
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      changed: await setContactStatusMatching(
        workspaceId,
        { search: data.search, rules: data.rules },
        data.status
      ),
    }
  })

const deleteContactsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idsSchema)
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      deleted: await deleteWorkspaceContacts(workspaceId, data.contactIds),
    }
  })

/**
 * Deletes everybody the filters match, rather than a list of ticked rows.
 *
 * The ticked-rows path above caps at 500 ids because that is how many a browser
 * can honestly hand over. This one sends the filters instead, so there is no
 * cap and no chance of the set drifting from the list the admin was reading.
 */
const deleteMatchingContactsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(contactFilterSchema)
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      deleted: await deleteWorkspaceContactsMatching(workspaceId, data),
    }
  })

export function loadContactsPage(
  options: z.input<typeof listSchema> = {}
) {
  return loadContactsPageFn({ data: options })
}

export function loadContactDetail(
  contactId: string,
  page?: number
) {
  return loadContactDetailFn({ data: { contactId, page } })
}

export function saveContact(input: z.input<typeof upsertSchema>) {
  return saveContactFn({ data: input })
}

export function setContactsStatus(
  contactIds: string[],
  status: ContactSegmentStatus
) {
  return setStatusFn({ data: { contactIds, status } })
}

export function saveContactTags(contactId: string, tags: string[]) {
  return saveTagsFn({ data: { contactId, tags } })
}

export function saveContactNotes(contactId: string, notes: string) {
  return saveNotesFn({ data: { contactId, notes } })
}

export function importContacts(rows: z.input<typeof importSchema>["rows"]) {
  return importContactsFn({ data: { rows } })
}

export function setMatchingContactsStatus(
  filter: ContactFilterInput,
  status: ContactSegmentStatus
) {
  return setStatusMatchingFn({ data: { ...filter, status } })
}

export function deleteContacts(contactIds: string[]) {
  return deleteContactsFn({ data: { contactIds } })
}

export function deleteMatchingContacts(filter: ContactFilterInput) {
  return deleteMatchingContactsFn({ data: filter })
}
