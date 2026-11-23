import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm'

import { revalidateTag } from '@/lib/cache'
import { db } from '@/lib/db'
import { events, contentCategoryRelationships } from '@/lib/db/schema'
import { extractEventContentFields } from '@/lib/utils/calendar'
import { isValidDateString } from '@/lib/utils/calendar-grid'
import {
  addDays,
  describeRecurrence,
  nextMatchingDate,
  parseRecurrenceRule,
  type RecurrenceRule,
} from '@/lib/utils/event-recurrence'
import { generateUniqueContentSlug, requireOwnedContentRow } from '@/lib/actions/content/content-action-helpers'
import {
  safeDeleteSiteSearchDocument,
  safeSyncSiteSearchDocument,
} from '@/lib/actions/site-search/site-search-index'

type EventRow = typeof events.$inferSelect

// How many upcoming (date >= today) generated occurrences a series keeps ready.
const KEEP_AHEAD = 8

// "Today" as a floating YYYY-MM-DD in UTC. Events carry no timezone, so the whole
// system treats dates as UTC-neutral wall-clock dates (same as the .ics/calendar).
function todayString(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

// Clone an anchor's value blocks and stamp a specific occurrence date/time onto
// the event-content block. The occurrence's displayed date always equals its
// scheduled slot; everything else is shared with the series.
function cloneBlocksWithDate(blocks: unknown, date: string, time: string | undefined): Record<string, any> {
  const cloned: Record<string, any> = JSON.parse(JSON.stringify(blocks ?? {}))
  for (const key of Object.keys(cloned)) {
    const block = cloned[key]
    if (block && typeof block === 'object' && block.type === 'event-content') {
      const content = (block.content && typeof block.content === 'object') ? { ...block.content } : {}
      content.eventDate = date
      if (time) content.eventTime = time
      else delete content.eventTime
      block.content = content
    }
  }
  return cloned
}

// Create one occurrence row for `date`. Returns the row, or null if it already
// existed (the unique (series_id, occurrence_date) index makes this idempotent).
async function materializeOccurrence(anchor: EventRow, date: string, time: string | undefined): Promise<EventRow | null> {
  const slug = await generateUniqueContentSlug(events, anchor.siteId, `${anchor.title} ${date}`)
  const contentBlocks = cloneBlocksWithDate(anchor.contentBlocks, date, time)

  const [row] = await db
    .insert(events)
    .values({
      siteId: anchor.siteId,
      templateId: anchor.templateId,
      title: anchor.title,
      slug,
      isPublished: anchor.isPublished,
      displayOrder: anchor.displayOrder,
      contentBlocks,
      featuredImage: anchor.featuredImage,
      metaDescription: anchor.metaDescription,
      seriesId: anchor.id,
      seriesOccurrenceDate: date,
    })
    .onConflictDoNothing()
    .returning()

  if (!row) return null

  // Occurrences share the series' categories so they appear in the same listings.
  const cats = await db
    .select({ categoryId: contentCategoryRelationships.categoryId, isPrimary: contentCategoryRelationships.isPrimary })
    .from(contentCategoryRelationships)
    .where(and(
      eq(contentCategoryRelationships.contentId, anchor.id),
      eq(contentCategoryRelationships.contentType, 'event'),
    ))
  if (cats.length) {
    await db.insert(contentCategoryRelationships).values(
      cats.map((c) => ({ contentId: row.id, contentType: 'event', categoryId: c.categoryId, isPrimary: c.isPrimary })),
    )
  }

  await safeSyncSiteSearchDocument('event', row)
  return row
}

// Top up a single series so it has KEEP_AHEAD upcoming occurrences. Forward-only:
// it never backfills a gap (so a deleted date is not resurrected) and never
// duplicates (existing dates all sit at/behind the cursor).
async function generateForAnchor(anchor: EventRow): Promise<number> {
  const rule = parseRecurrenceRule(anchor.recurrenceRule)
  if (!rule) return 0

  const { eventDate: anchorDate, eventTime: time } = extractEventContentFields(anchor.contentBlocks)
  if (!anchorDate || !isValidDateString(anchorDate)) return 0

  const today = todayString()
  const existing = await db
    .select({ date: events.seriesOccurrenceDate })
    .from(events)
    .where(eq(events.seriesId, anchor.id))
  const existingDates = existing.map((r) => r.date).filter((d): d is string => Boolean(d))
  const futureExisting = existingDates.filter((d) => d >= today)
  let need = KEEP_AHEAD - futureExisting.length
  if (need <= 0) return 0

  // Cursor floor: after the anchor's own date, after every existing occurrence,
  // and after yesterday — so every new date is strictly in the future.
  let cursor = addDays(today, -1) ?? today
  if (anchorDate > cursor) cursor = anchorDate
  for (const d of existingDates) if (d > cursor) cursor = d

  let created = 0
  let guard = KEEP_AHEAD * 4 // hard stop against a pathological rule
  while (need > 0 && guard-- > 0) {
    const next = nextMatchingDate(rule, cursor)
    if (!next) break
    cursor = next
    const row = await materializeOccurrence(anchor, next, time)
    if (row) created++
    need-- // whether we created it or it already existed, that slot is now filled
  }

  return created
}

/** Cron worker: keep every active series topped up to KEEP_AHEAD upcoming dates. */
export async function generateSeriesOccurrences(): Promise<{ anchors: number; created: number }> {
  const anchors = await db.select().from(events).where(isNotNull(events.recurrenceRule))
  let created = 0
  for (const anchor of anchors) {
    try {
      created += await generateForAnchor(anchor)
    } catch (error) {
      // One bad series must not abort the batch; it retries next tick.
      console.error('Occurrence generation failed for series', anchor.id, error)
    }
  }
  if (created > 0) revalidateTag('events')
  return { anchors: anchors.length, created }
}

// Push the anchor's shared content (title, blocks, image, meta) onto its future,
// non-detached occurrences. Each keeps its own date/time. Past occurrences and
// individually-edited (detached) ones are left untouched.
async function propagateSeriesContent(anchorId: string): Promise<void> {
  const anchor = await db.query.events.findFirst({ where: eq(events.id, anchorId) })
  if (!anchor?.recurrenceRule) return

  const { eventTime: time } = extractEventContentFields(anchor.contentBlocks)
  const today = todayString()
  const occurrences = await db
    .select()
    .from(events)
    .where(and(eq(events.seriesId, anchorId), eq(events.recurrenceDetached, false)))

  for (const occ of occurrences) {
    if (!occ.seriesOccurrenceDate || occ.seriesOccurrenceDate < today) continue
    const contentBlocks = cloneBlocksWithDate(anchor.contentBlocks, occ.seriesOccurrenceDate, time)
    const [row] = await db
      .update(events)
      .set({
        title: anchor.title,
        contentBlocks,
        featuredImage: anchor.featuredImage,
        metaDescription: anchor.metaDescription,
        updatedAt: new Date(),
      })
      .where(eq(events.id, occ.id))
      .returning()
    if (row) await safeSyncSiteSearchDocument('event', row)
  }

  revalidateTag('events')
}

// After the owner changes the repeat rule: drop the future, non-detached
// occurrences that no longer fit and regenerate from the new rule. Past and
// individually-edited occurrences survive.
async function rebuildFutureOccurrences(anchorId: string): Promise<number> {
  const today = todayString()
  const stale = await db
    .select({ id: events.id, siteId: events.siteId })
    .from(events)
    .where(and(
      eq(events.seriesId, anchorId),
      eq(events.recurrenceDetached, false),
      gte(events.seriesOccurrenceDate, today),
    ))
  if (stale.length) {
    await db.delete(events).where(inArray(events.id, stale.map((r) => r.id)))
    await Promise.all(stale.map((r) => safeDeleteSiteSearchDocument(r.siteId, 'event', r.id)))
  }

  const anchor = await db.query.events.findFirst({ where: eq(events.id, anchorId) })
  const created = anchor ? await generateForAnchor(anchor) : 0
  revalidateTag('events')
  return created
}

/**
 * Central hook called after any event edit.
 * - Editing a generated occurrence detaches it (series edits then skip it).
 * - Editing a series anchor pushes its shared content to future occurrences.
 */
export async function onEventEdited(row: Pick<EventRow, 'id' | 'seriesId' | 'recurrenceRule' | 'recurrenceDetached'>): Promise<void> {
  if (row.seriesId) {
    if (!row.recurrenceDetached) {
      await db.update(events).set({ recurrenceDetached: true }).where(eq(events.id, row.id))
      revalidateTag('events')
    }
    return
  }
  if (row.recurrenceRule) {
    await propagateSeriesContent(row.id)
  }
}

/**
 * Set (or clear) an event's repeat rule. Only the series anchor may hold a rule.
 * Passing null stops the series: no more occurrences are created, existing ones stay.
 */
export async function setEventRecurrenceImpl(
  eventId: string,
  rawRule: unknown,
): Promise<{ success: boolean; error?: string; description?: string | null }> {
  const access = await requireOwnedContentRow<EventRow>(events, eventId, 'Event')
  if (!access.ok) return { success: false, error: access.error }
  const event = access.row

  if (event.seriesId) {
    return { success: false, error: 'This event is one date in a series. Change the repeat on the main event.' }
  }

  let rule: RecurrenceRule | null = null
  if (rawRule != null) {
    rule = parseRecurrenceRule(rawRule)
    if (!rule) return { success: false, error: 'That repeat rule is not valid.' }
    const { eventDate } = extractEventContentFields(event.contentBlocks)
    if (!eventDate || !isValidDateString(eventDate)) {
      return { success: false, error: 'Add a date to this event before setting a repeat.' }
    }
  }

  const before = JSON.stringify(event.recurrenceRule ?? null)
  const after = JSON.stringify(rule ?? null)
  await db.update(events).set({ recurrenceRule: rule, updatedAt: new Date() }).where(eq(events.id, eventId))

  if (rule === null) {
    // Stopped: keep existing occurrences, generate nothing further.
  } else if (before !== after) {
    await rebuildFutureOccurrences(eventId)
  } else {
    const fresh = await db.query.events.findFirst({ where: eq(events.id, eventId) })
    if (fresh) await generateForAnchor(fresh)
  }

  revalidateTag('events')
  revalidateTag(`event-${eventId}`)
  revalidateTag(`site-${event.siteId}`)

  return { success: true, description: rule ? describeRecurrence(rule) : null }
}
