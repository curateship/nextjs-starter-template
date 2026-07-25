import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { revalidateTag } from '@/lib/cache'
import { headers } from '@/lib/request-headers'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { eventSubmissions, events, eventTemplates, sites } from '@/lib/db/schema'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { generateUniqueContentSlug } from '@/lib/actions/content/content-action-helpers'
import { getDefaultEventTemplateIdForSite } from './event-template-ensure'
import { EVENT_CONTENT_BLOCK_TYPE, pruneEventValueBlocksForTemplate } from './event-template-inheritance'
import { findEventContentBlockKey } from '@/lib/utils/calendar'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX } from '@/lib/utils/validation'

export type EventSubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface EventSubmissionListItem {
  id: string
  site_id: string
  status: EventSubmissionStatus
  event_name: string
  description: string | null
  date_time_text: string | null
  location: string | null
  submitter_email: string
  created_event_id: string | null
  created_event_slug: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUBMISSION_STATUSES: EventSubmissionStatus[] = ['pending', 'approved', 'rejected']
// A visitor gets a handful of submissions per hour per site; enough for a genuine
// batch of listings, low enough that a script can't flood the queue.
const SUBMISSION_RATE_LIMIT = 5
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000
// Collapse an accidental double-submit (same person, same event) inside this window.
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000

function nowIso(value?: Date | null) {
  return value ? value.toISOString() : null
}

// Strip tags/angle brackets and clamp — submitters are untrusted; nothing here is
// ever rendered as HTML (the approve path re-escapes before building the body).
function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/<[^>]*>?/gm, '').replace(/[<>"]/g, '').slice(0, maxLength)
}

function sanitizeOptionalText(value: unknown, maxLength: number) {
  return sanitizeText(value, maxLength) || null
}

function sanitizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 255) : ''
  return EMAIL_REGEX.test(email) ? email : ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Turn the plain-text submission into the draft event's rich-text body: a leading
// "proposed date/time" note (the date is free text, so it can't go in the
// structured eventDate yet) followed by the submitter's description.
function buildDraftEventBody(description: string | null, dateTimeText: string | null) {
  const paragraphs: string[] = []
  if (dateTimeText) {
    paragraphs.push(`<p><em>Proposed date/time: ${escapeHtml(dateTimeText)}</em></p>`)
  }
  if (description) {
    for (const line of description.split(/\n{2,}/)) {
      const trimmed = line.trim()
      if (trimmed) paragraphs.push(`<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`)
    }
  }
  return paragraphs.join('')
}

function rowToListItem(row: any): EventSubmissionListItem {
  return {
    id: row.id,
    site_id: row.siteId,
    status: row.status,
    event_name: row.eventName,
    description: row.description ?? null,
    date_time_text: row.dateTimeText ?? null,
    location: row.location ?? null,
    submitter_email: row.submitterEmail,
    created_event_id: row.createdEventId ?? null,
    created_event_slug: row.createdEventSlug ?? null,
    reviewed_at: nowIso(row.reviewedAt),
    review_note: row.reviewNote ?? null,
    created_at: row.createdAt?.toISOString() ?? '',
  }
}

export async function submitEventSubmissionActionImpl(input: {
  siteId: string
  eventName: string
  description?: string
  dateTimeText?: string
  location?: string
  submitterEmail: string
  honeypot?: string
}): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!UUID_REGEX.test(input.siteId)) {
    return { success: false, error: 'This event form is not available.' }
  }

  // Honeypot: bots (and only bots) fill the hidden field. Pretend it worked so we
  // give the bot no signal, and never write or notify.
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { success: true, message: 'Thanks! Your event has been submitted for review.' }
  }

  const eventName = sanitizeText(input.eventName, 255)
  const description = sanitizeOptionalText(input.description, 5000)
  const dateTimeText = sanitizeOptionalText(input.dateTimeText, 255)
  const location = sanitizeOptionalText(input.location, 255)
  const submitterEmail = sanitizeEmail(input.submitterEmail)

  if (!eventName) return { success: false, error: 'Enter the event name.' }
  if (!submitterEmail) return { success: false, error: 'Enter a valid email address.' }

  try {
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.id, input.siteId))
      .limit(1)
    if (!site) return { success: false, error: 'This event form is not available.' }

    const clientIp = getClientIp(await headers()) || 'unknown'
    const limited = await isPersistentRateLimited(
      `event-submission:${input.siteId}:${clientIp}`,
      SUBMISSION_RATE_LIMIT,
      SUBMISSION_RATE_WINDOW_MS,
    )
    if (limited) {
      return { success: false, error: 'Too many submissions. Please try again later.' }
    }

    // Collapse an accidental double-submit (same email + event name, still pending).
    const [duplicate] = await db
      .select({ id: eventSubmissions.id })
      .from(eventSubmissions)
      .where(and(
        eq(eventSubmissions.siteId, input.siteId),
        eq(eventSubmissions.status, 'pending'),
        eq(eventSubmissions.submitterEmail, submitterEmail),
        sql`lower(${eventSubmissions.eventName}) = ${eventName.toLowerCase()}`,
        gte(eventSubmissions.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS)),
      ))
      .limit(1)

    if (duplicate) {
      return { success: true, message: 'Thanks! Your event has been submitted for review.' }
    }

    const [submission] = await db
      .insert(eventSubmissions)
      .values({
        siteId: input.siteId,
        eventName,
        description,
        dateTimeText,
        location,
        submitterEmail,
      })
      .returning({ id: eventSubmissions.id })

    await createHubNotificationForSuperAdmins({
      type: 'event_submission',
      siteId: input.siteId,
      sourceId: submission.id,
      title: 'New event submission',
      message: `${submitterEmail} submitted "${eventName}" for review.`,
      targetHref: '/admin/events/submissions',
      metadata: { submission_id: submission.id },
    })

    return { success: true, message: 'Thanks! Your event has been submitted for review.' }
  } catch (error) {
    console.error('Failed to submit event submission:', error)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function getEventSubmissionListActionImpl(siteId: string, status?: EventSubmissionStatus): Promise<{
  data: EventSubmissionListItem[]
  counts: Record<EventSubmissionStatus, number>
  error: string | null
}> {
  const emptyCounts = { pending: 0, approved: 0, rejected: 0 }

  if (!UUID_REGEX.test(siteId)) return { data: [], counts: emptyCounts, error: 'Invalid site ID' }
  if (status && !SUBMISSION_STATUSES.includes(status)) {
    return { data: [], counts: emptyCounts, error: 'Invalid submission status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], counts: emptyCounts, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { data: [], counts: emptyCounts, error: 'Access denied' }

  const [countRows, rows] = await Promise.all([
    db
      .select({ status: eventSubmissions.status, count: sql<number>`count(*)::int` })
      .from(eventSubmissions)
      .where(eq(eventSubmissions.siteId, siteId))
      .groupBy(eventSubmissions.status),
    db
      .select({
        id: eventSubmissions.id,
        siteId: eventSubmissions.siteId,
        status: eventSubmissions.status,
        eventName: eventSubmissions.eventName,
        description: eventSubmissions.description,
        dateTimeText: eventSubmissions.dateTimeText,
        location: eventSubmissions.location,
        submitterEmail: eventSubmissions.submitterEmail,
        createdEventId: eventSubmissions.createdEventId,
        reviewedAt: eventSubmissions.reviewedAt,
        reviewNote: eventSubmissions.reviewNote,
        createdAt: eventSubmissions.createdAt,
        createdEventSlug: events.slug,
      })
      .from(eventSubmissions)
      .leftJoin(events, eq(events.id, eventSubmissions.createdEventId))
      .where(status
        ? and(eq(eventSubmissions.siteId, siteId), eq(eventSubmissions.status, status))
        : eq(eventSubmissions.siteId, siteId)
      )
      .orderBy(desc(eventSubmissions.createdAt))
      .limit(100),
  ])

  const counts = { ...emptyCounts }
  for (const row of countRows) {
    counts[row.status as EventSubmissionStatus] = row.count
  }

  return { data: rows.map(rowToListItem), counts, error: null }
}

// Build the DRAFT event's value-only content blocks from a submission. The
// event-content block is keyed by the template's block id, so we look that up and
// only fill it if the template still has an event-content block (prune drops
// anything the template no longer owns).
async function buildDraftContentBlocks(
  siteId: string,
  templateId: string,
  submission: { description: string | null; dateTimeText: string | null; location: string | null },
) {
  const [template] = await db
    .select({ contentBlocks: eventTemplates.contentBlocks })
    .from(eventTemplates)
    .where(and(eq(eventTemplates.id, templateId), eq(eventTemplates.siteId, siteId)))
    .limit(1)

  const templateBlocks = (template?.contentBlocks || {}) as Record<string, any>
  const contentKey = findEventContentBlockKey(templateBlocks)
  if (!contentKey) return {}

  const body = buildDraftEventBody(submission.description, submission.dateTimeText)
  const content: Record<string, string> = {}
  if (body) content.body = body
  if (submission.location) content.venueName = submission.location
  if (!Object.keys(content).length) return {}

  return pruneEventValueBlocksForTemplate(
    { [contentKey]: { id: contentKey, type: EVENT_CONTENT_BLOCK_TYPE, content } },
    templateBlocks,
  )
}

export async function reviewEventSubmissionActionImpl(input: {
  submissionId: string
  status: 'approved' | 'rejected'
  note?: string
}): Promise<{ success: boolean; error: string | null; eventSlug?: string }> {
  if (!UUID_REGEX.test(input.submissionId)) return { success: false, error: 'Invalid submission ID' }
  if (input.status !== 'approved' && input.status !== 'rejected') {
    return { success: false, error: 'Invalid review status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { success: false, error: 'Access denied' }

  const [submission] = await db
    .select()
    .from(eventSubmissions)
    .where(eq(eventSubmissions.id, input.submissionId))
    .limit(1)

  if (!submission) return { success: false, error: 'Submission not found' }
  if (submission.status !== 'pending') return { success: false, error: 'This submission has already been reviewed.' }

  const now = new Date()
  const reviewNote = sanitizeOptionalText(input.note, 1000)

  if (input.status === 'rejected') {
    await db
      .update(eventSubmissions)
      .set({ status: 'rejected', reviewedByUserId: user.id, reviewedAt: now, reviewNote, updatedAt: now })
      .where(eq(eventSubmissions.id, submission.id))
    return { success: true, error: null }
  }

  // Approve: create a DRAFT event (isPublished=false) prefilled from the submission.
  const templateId = await getDefaultEventTemplateIdForSite(submission.siteId)
  const contentBlocks = await buildDraftContentBlocks(submission.siteId, templateId, {
    description: submission.description,
    dateTimeText: submission.dateTimeText,
    location: submission.location,
  })
  const slug = await generateUniqueContentSlug(events, submission.siteId, submission.eventName)

  const [maxOrderEvent] = await db
    .select({ displayOrder: events.displayOrder })
    .from(events)
    .where(eq(events.siteId, submission.siteId))
    .orderBy(desc(events.displayOrder))
    .limit(1)

  // Create the draft and mark the submission approved atomically, so a failure
  // can't leave an orphan draft with the submission still pending (which would
  // create a second draft on re-approval).
  const newEvent = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(events)
      .values({
        siteId: submission.siteId,
        templateId,
        title: submission.eventName,
        slug,
        isPublished: false,
        displayOrder: maxOrderEvent ? maxOrderEvent.displayOrder + 1 : 0,
        contentBlocks,
      })
      .returning()

    if (!inserted) throw new Error('Draft event insert returned no row')

    await tx
      .update(eventSubmissions)
      .set({
        status: 'approved',
        createdEventId: inserted.id,
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewNote,
        updatedAt: now,
      })
      .where(eq(eventSubmissions.id, submission.id))

    return inserted
  })

  await safeSyncSiteSearchDocument('event', newEvent)
  revalidateTag('events')
  revalidateTag(`site-${submission.siteId}`)

  return { success: true, error: null, eventSlug: newEvent.slug }
}
