import { isSafeUrl } from '@/lib/utils/url-validator'
import { UUID_REGEX } from '@/lib/utils/validation'

export type CampaignType = 'bar' | 'popup'
export type CampaignStatus = 'draft' | 'active'
export type CampaignFrequency = 'once_per_visitor' | 'once_per_session' | 'every_visit'
export type CampaignTargeting = { mode: 'all' | 'include' | 'exclude'; paths: string[] }
export type CampaignTrigger =
  | { type: 'immediate'; value: null }
  | { type: 'delay' | 'scroll'; value: number }
  | { type: 'exit_intent'; value: null }

export type BarCampaignContent = {
  text: string
  ctaLabel: string | null
  ctaUrl: string | null
}

export type PopupCampaignContent = {
  heading: string
  text: string
  imageUrl: string | null
  goal: 'link' | 'email'
  ctaLabel: string
  ctaUrl: string | null
  submitLabel: string
  successMessage: string
}

export type CampaignContent = BarCampaignContent | PopupCampaignContent

export interface CampaignInput {
  siteId: string
  name: string
  type: CampaignType
  content: CampaignContent
  targeting: CampaignTargeting
  trigger: CampaignTrigger
  frequency: CampaignFrequency
  startsAt: string | null
  endsAt: string | null
  status: CampaignStatus
}

export interface PublicCampaign extends Omit<CampaignInput, 'status'> {
  id: string
  createdAt: string
}

export interface CampaignRecord extends PublicCampaign {
  status: CampaignStatus
  views: number
  dismissals: number
  submissions: number
  updatedAt: string
}

export type CampaignSortColumn = 'name' | 'type' | 'pages' | 'schedule' | 'views' | 'submissions' | 'status'
export type CampaignSortDirection = 'asc' | 'desc'

type ValidationResult =
  | { ok: true; data: CampaignInput }
  | { ok: false; message: string }

const TARGET_MODES = new Set(['all', 'include', 'exclude'])
const FREQUENCIES = new Set(['once_per_visitor', 'once_per_session', 'every_visit'])
const STATUSES = new Set(['draft', 'active'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeCampaignPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const pathname = new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'http://campaign.local').pathname
    const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '')
    return normalized || '/'
  } catch {
    return null
  }
}

function cleanDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function cleanLink(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && isSafeUrl(trimmed) ? trimmed : null
}

function cleanRequiredString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maxLength ? trimmed : null
}

function cleanOptionalString(value: unknown, maxLength: number) {
  if (value === null) return null
  return cleanRequiredString(value, maxLength)
}

export function validateCampaignInput(input: CampaignInput): ValidationResult {
  if (!UUID_REGEX.test(input.siteId)) return { ok: false, message: 'Invalid site' }

  const name = cleanRequiredString(input.name, 255)
  if (!name) return { ok: false, message: 'Campaign name is required and must be 255 characters or fewer' }
  if (input.type !== 'bar' && input.type !== 'popup') return { ok: false, message: 'Invalid campaign type' }
  if (!TARGET_MODES.has(input.targeting?.mode)) return { ok: false, message: 'Invalid page targeting' }
  if (!FREQUENCIES.has(input.frequency)) return { ok: false, message: 'Invalid frequency' }
  if (!STATUSES.has(input.status)) return { ok: false, message: 'Invalid status' }

  if (!Array.isArray(input.targeting.paths) || input.targeting.paths.length > 100) {
    return { ok: false, message: 'Page targeting accepts at most 100 paths' }
  }
  if (input.targeting.mode === 'all' && input.targeting.paths.length > 0) {
    return { ok: false, message: 'All-pages targeting cannot include page paths' }
  }
  const normalizedPaths = input.targeting.paths.map((path) => typeof path === 'string' ? normalizeCampaignPath(path) : null)
  if (normalizedPaths.some((path) => path === null)) return { ok: false, message: 'Invalid target page path' }
  const paths = [...new Set(normalizedPaths as string[])]
  if (input.targeting.mode !== 'all' && paths.length === 0) {
    return { ok: false, message: 'Add at least one target page' }
  }

  if (input.startsAt !== null && typeof input.startsAt !== 'string') return { ok: false, message: 'Invalid start date' }
  if (input.endsAt !== null && typeof input.endsAt !== 'string') return { ok: false, message: 'Invalid end date' }
  const startsAt = cleanDate(input.startsAt)
  const endsAt = cleanDate(input.endsAt)
  if (input.startsAt !== null && !startsAt) return { ok: false, message: 'Invalid start date' }
  if (input.endsAt !== null && !endsAt) return { ok: false, message: 'Invalid end date' }
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    return { ok: false, message: 'End date must be after start date' }
  }

  let content: CampaignContent
  let trigger: CampaignTrigger

  if (input.type === 'bar') {
    const source = isRecord(input.content) ? input.content as Partial<BarCampaignContent> : {}
    const text = cleanRequiredString(source.text, 500)
    if (!text) return { ok: false, message: 'Announcement text is required and must be 500 characters or fewer' }
    const ctaLabel = cleanOptionalString(source.ctaLabel, 80)
    const ctaUrl = source.ctaUrl === null ? null : cleanLink(source.ctaUrl)
    if (source.ctaLabel !== null && !ctaLabel) return { ok: false, message: 'CTA label must be 80 characters or fewer' }
    if (source.ctaUrl !== null && !ctaUrl) return { ok: false, message: 'CTA link is not safe' }
    if ((ctaLabel && !ctaUrl) || (ctaUrl && !ctaLabel)) return { ok: false, message: 'CTA label and link are both required' }
    if (input.trigger?.type !== 'immediate' || input.trigger.value !== null) {
      return { ok: false, message: 'Announcement bars must use the immediate trigger' }
    }
    content = { text, ctaLabel, ctaUrl }
    trigger = { type: 'immediate', value: null }
  } else {
    const source = isRecord(input.content) ? input.content as Partial<PopupCampaignContent> : {}
    const heading = cleanRequiredString(source.heading, 180)
    if (!heading) return { ok: false, message: 'Popup heading is required and must be 180 characters or fewer' }
    if (typeof source.text !== 'string' || source.text.trim().length > 1500) {
      return { ok: false, message: 'Popup text must be 1500 characters or fewer' }
    }
    const text = source.text.trim()
    if (source.goal !== 'link' && source.goal !== 'email') return { ok: false, message: 'Invalid popup goal' }
    const goal = source.goal
    const imageUrl = source.imageUrl === null ? null : cleanLink(source.imageUrl)
    if (source.imageUrl !== null && !imageUrl) return { ok: false, message: 'Popup image URL is not safe' }
    if (typeof source.ctaLabel !== 'string' || source.ctaLabel.trim().length > 80) {
      return { ok: false, message: 'CTA label must be 80 characters or fewer' }
    }
    const ctaLabel = source.ctaLabel.trim()
    const ctaUrl = source.ctaUrl === null ? null : cleanLink(source.ctaUrl)
    if (source.ctaUrl !== null && !ctaUrl) return { ok: false, message: 'CTA link is not safe' }
    if (goal === 'link' && (!ctaLabel || !ctaUrl)) return { ok: false, message: 'CTA label and link are required' }
    if (goal === 'email' && (ctaLabel || ctaUrl)) return { ok: false, message: 'Email popups cannot include link CTA fields' }
    const submitLabel = goal === 'email'
      ? cleanRequiredString(source.submitLabel, 80)
      : typeof source.submitLabel === 'string' && source.submitLabel.trim().length <= 80 ? source.submitLabel.trim() : null
    if (submitLabel === null) return { ok: false, message: 'Submit label must be 80 characters or fewer' }
    const successMessage = goal === 'email'
      ? cleanRequiredString(source.successMessage, 300)
      : typeof source.successMessage === 'string' && source.successMessage.trim().length <= 300 ? source.successMessage.trim() : null
    if (successMessage === null) return { ok: false, message: 'Success message must be 300 characters or fewer' }
    content = {
      heading,
      text,
      imageUrl,
      goal,
      ctaLabel,
      ctaUrl: goal === 'link' ? ctaUrl : null,
      submitLabel,
      successMessage,
    }

    if (input.trigger?.type === 'delay') {
      if (!Number.isFinite(input.trigger.value) || input.trigger.value < 0 || input.trigger.value > 300) {
        return { ok: false, message: 'Popup delay must be between 0 and 300 seconds' }
      }
      trigger = { type: 'delay', value: input.trigger.value }
    } else if (input.trigger?.type === 'scroll') {
      if (!Number.isFinite(input.trigger.value) || input.trigger.value < 1 || input.trigger.value > 100) {
        return { ok: false, message: 'Popup scroll trigger must be between 1 and 100 percent' }
      }
      trigger = { type: 'scroll', value: input.trigger.value }
    } else if (input.trigger?.type === 'exit_intent' && input.trigger.value === null) {
      trigger = { type: 'exit_intent', value: null }
    } else {
      return { ok: false, message: 'Invalid popup trigger' }
    }
  }

  return {
    ok: true,
    data: {
      siteId: input.siteId,
      name,
      type: input.type,
      content,
      targeting: { mode: input.targeting.mode, paths },
      trigger,
      frequency: input.frequency,
      startsAt,
      endsAt,
      status: input.status,
    },
  }
}

export function compareCampaignRecords(
  left: CampaignRecord,
  right: CampaignRecord,
  column: CampaignSortColumn,
  direction: CampaignSortDirection,
) {
  const multiplier = direction === 'asc' ? 1 : -1
  let comparison: number

  if (column === 'name') comparison = left.name.localeCompare(right.name)
  else if (column === 'type') comparison = left.type.localeCompare(right.type)
  else if (column === 'pages') {
    comparison = left.targeting.mode.localeCompare(right.targeting.mode)
      || left.targeting.paths.length - right.targeting.paths.length
  } else if (column === 'schedule') {
    comparison = (left.startsAt ? new Date(left.startsAt).getTime() : 0)
      - (right.startsAt ? new Date(right.startsAt).getTime() : 0)
  } else if (column === 'views') comparison = left.views - right.views
  else if (column === 'submissions') comparison = left.submissions - right.submissions
  else comparison = left.status.localeCompare(right.status)

  return comparison * multiplier
}

export function splitCampaignEventBatches<T>(events: readonly T[], batchSize = 20) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Campaign event batch size must be a positive integer')
  const batches: T[][] = []
  for (let index = 0; index < events.length; index += batchSize) {
    batches.push(events.slice(index, index + batchSize))
  }
  return batches
}

export function isCampaignEligible(campaign: PublicCampaign, path: string, now = new Date()) {
  const timestamp = now.getTime()
  if (campaign.startsAt && timestamp < new Date(campaign.startsAt).getTime()) return false
  if (campaign.endsAt && timestamp >= new Date(campaign.endsAt).getTime()) return false

  const currentPath = normalizeCampaignPath(path) ?? '/'
  const matches = campaign.targeting.paths.some((targetPath) => normalizeCampaignPath(targetPath) === currentPath)
  if (campaign.targeting.mode === 'include') return matches
  if (campaign.targeting.mode === 'exclude') return !matches
  return true
}

export function selectCampaignsForPath(campaigns: PublicCampaign[], path: string, now = new Date()) {
  const eligible = campaigns
    .filter((campaign) => isCampaignEligible(campaign, path, now))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    bars: eligible.filter((campaign) => campaign.type === 'bar'),
    popup: eligible.find((campaign) => campaign.type === 'popup') ?? null,
  }
}
