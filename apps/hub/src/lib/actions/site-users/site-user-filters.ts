export type SiteUserMatchMode = 'all' | 'any'
export type SiteUserFilterType = 'status' | 'role' | 'lastEngaged' | 'dateAdded'
export type SiteUserDateOperator = 'is' | 'isnt'
export type SiteUserRelativeDays = 7 | 30 | 60 | 90

export interface RelativeDateFilterValue {
  mode: 'relative'
  days: SiteUserRelativeDays
}

export interface RangeDateFilterValue {
  mode: 'range'
  from: string | null
  to: string | null
}

export type SiteUserDateFilterValue = RelativeDateFilterValue | RangeDateFilterValue

export type SiteUserFilterRule =
  | {
      id: string
      type: 'status'
      value: string[]
    }
  | {
      id: string
      type: 'role'
      value: string[]
    }
  | {
      id: string
      type: 'lastEngaged' | 'dateAdded'
      operator: SiteUserDateOperator
      value: SiteUserDateFilterValue
    }

export interface SiteUserFilterGroup {
  match: SiteUserMatchMode
  rules: SiteUserFilterRule[]
}

export const SITE_USER_FILTER_TYPE_OPTIONS: Array<{ value: SiteUserFilterType; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'role', label: 'Role' },
  { value: 'dateAdded', label: 'Date added' },
  { value: 'lastEngaged', label: 'Last engaged' },
]

export const SITE_USER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const

export const SITE_USER_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
] as const

export const SITE_USER_RELATIVE_DAY_OPTIONS: Array<{ value: SiteUserRelativeDays; label: string }> = [
  { value: 7, label: 'In the last 7 days' },
  { value: 30, label: 'In the last 30 days' },
  { value: 60, label: 'In the last 60 days' },
  { value: 90, label: 'In the last 90 days' },
]

export const emptySiteUserFilterGroup = (): SiteUserFilterGroup => ({
  match: 'all',
  rules: [],
})

export function createSiteUserFilterRule(id: string, type: SiteUserFilterType): SiteUserFilterRule {
  switch (type) {
    case 'status':
      return { id, type, value: [] }
    case 'role':
      return { id, type, value: [] }
    case 'lastEngaged':
    case 'dateAdded':
      return {
        id,
        type,
        operator: 'is',
        value: { mode: 'relative', days: 7 },
      }
  }
}

export function cloneSiteUserFilterGroup(group: SiteUserFilterGroup): SiteUserFilterGroup {
  return {
    match: group.match,
    rules: group.rules.map((rule) => {
      if (rule.type === 'status' || rule.type === 'role') {
        return { ...rule, value: [...rule.value] }
      }
      return { ...rule, value: { ...rule.value } }
    }),
  }
}

export function pruneSiteUserFilterGroup(group: SiteUserFilterGroup): SiteUserFilterGroup {
  return {
    match: group.match,
    rules: group.rules.filter((rule) => {
      if (rule.type === 'status' || rule.type === 'role') {
        return rule.value.length > 0
      }
      if (rule.value.mode === 'relative') {
        return true
      }
      return Boolean(rule.value.from || rule.value.to)
    }),
  }
}

export function getSiteUserFilterTypeLabel(type: SiteUserFilterType): string {
  return SITE_USER_FILTER_TYPE_OPTIONS.find((option) => option.value === type)?.label || type
}

function formatRelativeDays(days: number) {
  return `In the last ${days} days`
}

function formatDateRangeLabel(from: string | null, to: string | null) {
  const formatValue = (value: string) => {
    const date = new Date(value)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (from && to) return `${formatValue(from)} to ${formatValue(to)}`
  if (from) return `After ${formatValue(from)}`
  if (to) return `Before ${formatValue(to)}`
  return 'Custom range'
}

export function formatSiteUserFilterRule(rule: SiteUserFilterRule): string {
  if (rule.type === 'status') {
    const values = rule.value
      .map((value) => SITE_USER_STATUS_OPTIONS.find((option) => option.value === value)?.label || value)
      .join(', ')
    return values ? `Status: ${values}` : 'Status'
  }

  if (rule.type === 'role') {
    const values = rule.value
      .map((value) => SITE_USER_ROLE_OPTIONS.find((option) => option.value === value)?.label || value)
      .join(', ')
    return values ? `Role: ${values}` : 'Role'
  }

  const fieldLabel = getSiteUserFilterTypeLabel(rule.type)
  const operatorLabel = rule.operator === 'is' ? 'is' : "isn't"
  if (rule.value.mode === 'relative') {
    return `${fieldLabel} ${operatorLabel} ${formatRelativeDays(rule.value.days).toLowerCase()}`
  }
  return `${fieldLabel} ${operatorLabel} ${formatDateRangeLabel(rule.value.from, rule.value.to)}`
}
