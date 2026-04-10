export const SEGMENT_TYPES = ['static', 'dynamic'] as const

export type SegmentType = typeof SEGMENT_TYPES[number]
export type SegmentDynamicRuleOperator = 'is' | 'isnt'
export type SegmentTagRuleOperator = 'includes' | 'excludes'

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

export type SegmentDynamicCondition = LastEngagedWithinDaysRule | TagMatchRule

export interface SegmentDynamicRule {
  conditions: SegmentDynamicCondition[]
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

function normalizeSegmentDynamicCondition(value: unknown): SegmentDynamicCondition | null {
  if (!value || typeof value !== 'object') return null

  const type = (value as { type?: unknown }).type
  if (type === 'last_engaged_within_days') {
    return normalizeLastEngagedWithinDaysRule(value)
  }
  if (type === 'tag_match') {
    return normalizeTagMatchRule(value)
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

export function formatSegmentDynamicCondition(condition: SegmentDynamicCondition): string {
  if (condition.type === 'last_engaged_within_days') {
    return `Last engaged ${condition.operator === 'is' ? 'is' : "isn't"} within ${condition.days} day${condition.days === 1 ? '' : 's'}`
  }

  return `Tags ${condition.operator === 'includes' ? 'includes' : 'excludes'} ${condition.tags.join(', ')}`
}

export function formatSegmentDynamicRule(rule: SegmentDynamicRule | null | undefined): string {
  if (!rule) return ''

  return rule.conditions.map(formatSegmentDynamicCondition).join(' AND ')
}
