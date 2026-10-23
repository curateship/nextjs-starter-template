import { events, eventTemplates } from '@/lib/db/schema'
import { sanitizeEventTemplateBlocks } from './event-template-inheritance'
import { ensureEventBlankTemplateForSite } from './event-template-ensure'
import { createTemplateActions } from '@/lib/actions/templates/create-template-actions'
import type { TemplateRecord } from '@/lib/actions/templates/template-action-helpers'

export type EventTemplate = TemplateRecord

const actions = createTemplateActions({
  table: eventTemplates,
  contentTable: events,
  contentTemplateIdColumn: events.templateId,
  cacheTag: 'events',
  entity: 'Event',
  sanitizeBlocks: sanitizeEventTemplateBlocks,
  ensureBlankTemplateForSite: ensureEventBlankTemplateForSite,
  inUseError: 'Template is used by one or more events',
  updateOptions: { trimNameOnUpdate: false, validateNameOnUpdate: false },
})

export const getEventTemplatesBySiteImpl = actions.getTemplatesBySiteImpl
export const getEventTemplateIdsActionImpl = actions.getTemplateIdsActionImpl
export const getEventTemplateByIdImpl = actions.getTemplateByIdImpl
export const createEventTemplateImpl = actions.createTemplateImpl
export const updateEventTemplateImpl = actions.updateTemplateImpl
export const setDefaultEventTemplateImpl = actions.setDefaultTemplateImpl
export const deleteEventTemplatesImpl = actions.deleteTemplatesImpl
