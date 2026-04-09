export const SEGMENT_TYPES = ['static', 'dynamic'] as const

export type SegmentType = typeof SEGMENT_TYPES[number]
export type SegmentDynamicRuleOperator = 'is' | 'isnt'

export interface LastEngagedWithinDaysRule {
  type: 'last_engaged_within_days'
  operator: SegmentDynamicRuleOperator
  days: number
}

export type SegmentDynamicRule = LastEngagedWithinDaysRule

export function isSegmentType(value: unknown): value is SegmentType {
  return value === 'static' || value === 'dynamic'
}

export function normalizeSegmentDynamicRule(value: unknown): SegmentDynamicRule | null {
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

export function formatSegmentDynamicRule(rule: SegmentDynamicRule | null | undefined): string {
  if (!rule) return ''

  if (rule.type === 'last_engaged_within_days') {
    return `Last engaged ${rule.operator === 'is' ? 'is' : "isn't"} within ${rule.days} day${rule.days === 1 ? '' : 's'}`
  }

  return ''
}
