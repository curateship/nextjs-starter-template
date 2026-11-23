import { findEventContentBlockKey } from '@/lib/utils/calendar'
import { sanitizeRichHtml } from '@/lib/utils/html-sanitizer'

// Block-type identifier is a stable schema string; kept local so this pure
// mapper does not pull the event builder's module graph into unit tests.
// The executor prunes the result against the template before persisting.
const EVENT_CONTENT_BLOCK_TYPE = 'event-content'

export interface EventExtraction {
  title: string
  /** Wall-clock calendar date, `YYYY-MM-DD`. Required — see normalizeEventDate. */
  date: string
  /** Wall-clock start time, `HH:MM`, or empty when the page did not say. */
  time: string
  venueName: string
  venueAddress: string
  descriptionHtml: string
}

/** An event template must have a Core block to hold the date, time, and venue. */
export function hasEventContentBlock(templateBlocks: Record<string, any>): boolean {
  return findEventContentBlockKey(templateBlocks) !== null
}

/**
 * Map an AI-extracted event onto an event template's value blocks: date, time,
 * venue, and the description all live on the single Core (`event-content`)
 * block. Returns raw value blocks keyed by the template's block id; callers
 * prune against the template.
 */
export function buildAutomationEventContent(templateBlocks: Record<string, any>, event: EventExtraction) {
  const contentKey = findEventContentBlockKey(templateBlocks)
  if (!contentKey) throw new Error('Event template needs a Core block')

  const body = sanitizeRichHtml(event.descriptionHtml).trim()
  return {
    [contentKey]: {
      id: contentKey,
      type: EVENT_CONTENT_BLOCK_TYPE,
      content: {
        eventDate: event.date,
        ...(event.time ? { eventTime: event.time } : {}),
        ...(event.venueName ? { venueName: event.venueName } : {}),
        ...(event.venueAddress ? { venueAddress: event.venueAddress } : {}),
        ...(body ? { body, format: 'html' } : {}),
      },
    },
  }
}

/**
 * Accept only a real calendar date written as `YYYY-MM-DD`, and return '' for
 * anything else. Events store a wall-clock date with no timezone, so guessing
 * at "next Friday" or at what "03/04" means would silently invent a date; the
 * node skips those and says so on its run step instead.
 */
export function normalizeEventDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return ''
  const [text, year, month, day] = match
  const date = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  // Rejects a rolled-over date such as 2026-02-30, which Date happily accepts.
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day)
    ? text
    : ''
}

/** Accept only a 24-hour `HH:MM` start time; an unusable one just means no time. */
export function normalizeEventTime(value: unknown): string {
  if (typeof value !== 'string') return ''
  const time = value.trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : ''
}

/** The dedupe key: same normalized title on the same date is the same event. */
export function eventDedupeKey(title: string, date: string) {
  return `${title.trim().toLowerCase().replace(/\s+/g, ' ')}|${date}`
}
