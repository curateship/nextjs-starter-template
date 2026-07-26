// Event template inheritance (mirrors category-template-inheritance.ts):
// templates own block structure + settings, event rows store only values.
// Like categories, event rows keep row-level settings (_settings.is_private,
// show_featured_image) inside content_blocks, so every helper here preserves
// non-block entries from the VALUE side, not the template.

import { sanitizeExternalHttpUrl } from '@/lib/utils/url-validator'
import { normalizeCapacity, normalizeTicketPriceId } from './event-registration-core'
import {
  blocksToTemplateValueJson,
  getTemplateNonBlockEntries,
  hasTemplateValue,
  mergeTemplateBlocks,
  pruneTemplateValueBlocks,
  sanitizeTemplateBlocks,
  type TemplateValueTransformArgs,
} from '../template-inheritance-core'

export const EVENT_BLANK_TEMPLATE_NAME = 'Blank'
export const EVENT_CONTENT_BLOCK_TYPE = 'event-content'

// Per-event value keys. The rich text body/format, event date/time and the
// registration settings are edited per event; the title/featured image are event
// row fields.
const EVENT_VALUE_KEYS: Record<string, string[]> = {
  [EVENT_CONTENT_BLOCK_TYPE]: [
    'body',
    'format',
    'eventDate',
    'eventTime',
    'venueName',
    'venueAddress',
    'externalCtaUrl',
    'registrationMode',
    'capacity',
    'ticketPriceId',
    'ticketPriceLabel',
  ],
}

// Template-owned config keys per block type (everything the template editor sets).
const EVENT_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [EVENT_CONTENT_BLOCK_TYPE]: ['eventContentStyle', 'styleConfig', 'visibility'],
}

const eventTemplateInheritanceConfig = {
  valueKeys: EVENT_VALUE_KEYS,
  templateContentKeys: EVENT_TEMPLATE_CONTENT_KEYS,
  getInitialValueEntries: getEventNonBlockEntries,
  transformValue: transformEventValue,
}

// Row-level settings stored alongside blocks in events.content_blocks:
// _-prefixed objects (_settings.is_private) and bare scalars (show_featured_image).
// These must survive every prune/merge or private events silently go public.
export function getEventNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  return getTemplateNonBlockEntries(contentBlocks, (key, value) => key.startsWith('_') || typeof value !== 'object' || value === null)
}

function transformEventValue({ key, value }: TemplateValueTransformArgs) {
  if (key === 'externalCtaUrl') {
    const externalCtaUrl = sanitizeExternalHttpUrl(String(value))
    return externalCtaUrl ? { include: true as const, value: externalCtaUrl } : { include: false as const }
  }

  if (key === 'venueName' || key === 'venueAddress') {
    const trimmedValue = String(value).trim()
    return trimmedValue ? { include: true as const, value: trimmedValue } : { include: false as const }
  }

  // Registration settings are read back server-side to enforce capacity and to
  // charge a ticket, so they are normalized on the way in and anything unusable
  // is dropped rather than stored.
  if (key === 'registrationMode') {
    return value === 'free' || value === 'paid'
      ? { include: true as const, value }
      : { include: false as const }
  }

  if (key === 'capacity') {
    const capacity = normalizeCapacity(value)
    return capacity === null ? { include: false as const } : { include: true as const, value: capacity }
  }

  if (key === 'ticketPriceId') {
    const ticketPriceId = normalizeTicketPriceId(value)
    return ticketPriceId ? { include: true as const, value: ticketPriceId } : { include: false as const }
  }

  if (key === 'ticketPriceLabel') {
    const label = String(value).trim().slice(0, 40)
    return label ? { include: true as const, value: label } : { include: false as const }
  }

  return undefined
}

// Strip per-event value keys from template blocks so templates only store structure
export function sanitizeEventTemplateBlocks(contentBlocks: Record<string, any> = {}) {
  return sanitizeTemplateBlocks(contentBlocks, eventTemplateInheritanceConfig)
}

// Convert builder blocks to the value-only JSON stored on the event row
export function eventBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any> }>) {
  return blocksToTemplateValueJson(blocks, eventTemplateInheritanceConfig)
}

// Drop value entries for blocks no longer in the template, keeping row settings
export function pruneEventValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  return pruneTemplateValueBlocks(valueBlocks, templateBlocks, eventTemplateInheritanceConfig)
}

// Merge template structure with event values for rendering/editing
export function mergeEventTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  return mergeTemplateBlocks(templateBlocks, valueBlocks, eventTemplateInheritanceConfig)
}

// Template-editor preview: per-event values are empty in templates, so the
// preview substitutes sample content (mirrors withCategoryTemplatePreviewValues).
const EVENT_TEMPLATE_PREVIEW_RICH_TEXT = `
<p>This is sample event content. Use this block to decide where the event description should appear in the template.</p>
<p>Real text is edited on each event.</p>
`.trim()

export const EVENT_TEMPLATE_PREVIEW_EVENT = {
  title: 'Preview Event',
  featuredImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
}

export function withEventTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[]
) {
  return blocks.map((block) => {
    if (block.type !== EVENT_CONTENT_BLOCK_TYPE) return block

    const content = {
      ...(block.content || {}),
      ...(!hasTemplateValue(block.content?.eventDate) ? { eventDate: '2026-08-15' } : {}),
      ...(!hasTemplateValue(block.content?.eventTime) ? { eventTime: '18:00' } : {}),
      ...(!hasTemplateValue(block.content?.venueName) ? { venueName: 'The Grand Hall' } : {}),
      ...(!hasTemplateValue(block.content?.venueAddress) ? { venueAddress: '123 Main Street, Toronto, ON' } : {}),
      ...(!hasTemplateValue(block.content?.externalCtaUrl) ? { externalCtaUrl: 'https://example.com/events/preview-rsvp' } : {}),
      ...(!hasTemplateValue(block.content?.body) ? { body: EVENT_TEMPLATE_PREVIEW_RICH_TEXT } : {}),
    }

    return {
      ...block,
      content,
    }
  })
}
