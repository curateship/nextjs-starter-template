export const SEGMENT_TYPES = ['static', 'dynamic'] as const

export type SegmentType = typeof SEGMENT_TYPES[number]
export type SegmentDynamicRuleOperator = 'is' | 'isnt'
export type SegmentTagRuleOperator = 'includes' | 'excludes'
export type SegmentOpenCountRuleOperator = 'has_opened' | 'hasnt_opened'
export const SEGMENT_CONTACT_STATUSES = ['active', 'cold', 'unsubscribed', 'bounced', 'complained'] as const
export type SegmentContactStatus = typeof SEGMENT_CONTACT_STATUSES[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LastEngagedWithinDaysRule {
  type: 'last_engaged_within_days'
  operator: SegmentDynamicRuleOperator
  days: number
}

export interface TagMatchRule {
  type: 'tag_match'
  operator: SegmentTagRuleOperator
  tags: string[]
}

export interface EmailOpenCountRule {
  type: 'email_open_count'
  operator: SegmentOpenCountRuleOperator
  times: number
}

export interface StatusMatchRule {
  type: 'status_match'
  operator: SegmentDynamicRuleOperator
  status: SegmentContactStatus
}

export interface SegmentExclusionRule {
  type: 'segment_exclusion'
  segment_ids: string[]
}

export type SegmentDynamicCondition =
  | LastEngagedWithinDaysRule
  | TagMatchRule
  | EmailOpenCountRule
  | StatusMatchRule
  | SegmentExclusionRule

export interface SegmentDynamicRule {
  conditions: SegmentDynamicCondition[]
}

type FormatSegmentDynamicRuleOptions = {
  maxTags?: number
}

export function isSegmentType(value: unknown): value is SegmentType {
  return value === 'static' || value === 'dynamic'
}

function normalizeLastEngagedWithinDaysRule(value: unknown): LastEngagedWithinDaysRule | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  const operator = (value as { operator?: unknown }).operator
  const rawDays = (value as { days?: unknown }).days
  const days = typeof rawDays === 'string' ? Number(rawDays) : rawDays

  if (type !== 'last_engaged_within_days') return null
  if (operator !== 'is' && operator !== 'isnt') return null
  if (!Number.isInteger(days) || Number(days) < 1) return null

  return {
    type: 'last_engaged_within_days',
    operator,
    days: Number(days),
  }
}

function normalizeTagMatchRule(value: unknown): TagMatchRule | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  const operator = (value as { operator?: unknown }).operator
  const rawTags = Array.isArray((value as { tags?: unknown }).tags) ? (value as { tags: unknown[] }).tags : []
  const tags = [...new Set(rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean))]

  if (type !== 'tag_match') return null
  if (operator !== 'includes' && operator !== 'excludes') return null
  if (!tags.length) return null

  return {
    type: 'tag_match',
    operator,
    tags,
  }
}

function normalizeEmailOpenCountRule(value: unknown): EmailOpenCountRule | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  const operator = (value as { operator?: unknown }).operator
  const rawTimes = (value as { times?: unknown }).times
  const times = typeof rawTimes === 'string' ? Number(rawTimes) : rawTimes

  if (type !== 'email_open_count') return null
  if (operator !== 'has_opened' && operator !== 'hasnt_opened') return null
  if (!Number.isInteger(times) || Number(times) < 1) return null

  return {
    type: 'email_open_count',
    operator,
    times: Number(times),
  }
}

function normalizeStatusMatchRule(value: unknown): StatusMatchRule | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  const operator = (value as { operator?: unknown }).operator
  const status = (value as { status?: unknown }).status

  if (type !== 'status_match') return null
  if (operator !== 'is' && operator !== 'isnt') return null
  if (typeof status !== 'string' || !SEGMENT_CONTACT_STATUSES.includes(status as SegmentContactStatus)) return null

  return {
    type: 'status_match',
    operator,
    status: status as SegmentContactStatus,
  }
}

function normalizeSegmentExclusionRule(value: unknown): SegmentExclusionRule | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  const rawSegmentIds = (value as { segment_ids?: unknown; segmentIds?: unknown }).segment_ids
    ?? (value as { segmentIds?: unknown }).segmentIds
  const rawIds = Array.isArray(rawSegmentIds)
    ? rawSegmentIds
    : [
        (value as { segment_id?: unknown; segmentId?: unknown }).segment_id
          ?? (value as { segmentId?: unknown }).segmentId,
      ]
  const segmentIds = [...new Set(rawIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => UUID_REGEX.test(id)))]

  if (type !== 'segment_exclusion') return null
  if (!segmentIds.length) return null

  return {
    type: 'segment_exclusion',
    segment_ids: segmentIds,
  }
}

function normalizeSegmentDynamicCondition(value: unknown): SegmentDynamicCondition | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  if (type === 'last_engaged_within_days') {
    return normalizeLastEngagedWithinDaysRule(value)
  }
  if (type === 'tag_match') {
    return normalizeTagMatchRule(value)
  }
  if (type === 'email_open_count') {
    return normalizeEmailOpenCountRule(value)
  }
  if (type === 'status_match') {
    return normalizeStatusMatchRule(value)
  }
  if (type === 'segment_exclusion') {
    return normalizeSegmentExclusionRule(value)
  }

  return null
}

export function normalizeSegmentDynamicRule(value: unknown): SegmentDynamicRule | null {
  const legacyRule = normalizeLastEngagedWithinDaysRule(value)
  if (legacyRule) {
    return { conditions: [legacyRule] }
  }

  if (!value || typeof value !== 'object') return null

  const rawConditions = Array.isArray((value as { conditions?: unknown }).conditions)
    ? (value as { conditions: unknown[] }).conditions
    : []
  const conditions = rawConditions
    .map(normalizeSegmentDynamicCondition)
    .filter((condition): condition is SegmentDynamicCondition => condition !== null)

  if (!conditions.length || conditions.length !== rawConditions.length) return null

  return { conditions }
}

function formatStatusLabel(status: SegmentContactStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function formatSegmentDynamicCondition(
  condition: SegmentDynamicCondition,
  options: FormatSegmentDynamicRuleOptions = {}
): string {
  if (condition.type === 'last_engaged_within_days') {
    return `Last engaged ${condition.operator === 'is' ? 'is' : "isn't"} within ${condition.days} day${condition.days === 1 ? '' : 's'}`
  }

  if (condition.type === 'email_open_count') {
    const timesLabel = `${condition.times} email${condition.times === 1 ? '' : 's'}`
    return condition.operator === 'has_opened'
      ? `Opened any of last ${timesLabel}`
      : `Opened none of last ${timesLabel}`
  }

  if (condition.type === 'status_match') {
    return `Status ${condition.operator === 'is' ? 'is' : "isn't"} ${formatStatusLabel(condition.status)}`
  }

  if (condition.type === 'segment_exclusion') {
    return `Excludes ${condition.segment_ids.length} selected segment${condition.segment_ids.length === 1 ? '' : 's'}`
  }

  const tags = options.maxTags ? condition.tags.slice(0, options.maxTags) : condition.tags
  const remainingTagCount = condition.tags.length - tags.length
  const remainingLabel = remainingTagCount > 0 ? `, +${remainingTagCount} more` : ''

  return `Tags ${condition.operator === 'includes' ? 'includes' : 'excludes'} ${tags.join(', ')}${remainingLabel}`
}

export function formatSegmentDynamicRule(
  rule: SegmentDynamicRule | null | undefined,
  options: FormatSegmentDynamicRuleOptions = {}
): string {
  if (!rule) return ''

  return rule.conditions.map((condition) => formatSegmentDynamicCondition(condition, options)).join(' AND ')
}
