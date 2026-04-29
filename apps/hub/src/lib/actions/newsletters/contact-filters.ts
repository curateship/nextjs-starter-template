export type ContactMatchMode = 'all' | 'any'

export type ContactFilterType =
  | 'status'
  | 'lastEngaged'
  | 'dateAdded'
  | 'source'
  | 'dataField'

export type ContactDateOperator = 'is' | 'isnt'
export type ContactDataField = 'tag'
export type ContactDataFieldOperator =
  | 'matchesExact'
  | 'notMatchesExact'
  | 'contains'
  | 'notContains'
  | 'isEmpty'
  | 'isNotEmpty'
export type ContactRelativeDays = 7 | 30 | 60 | 90

export interface RelativeDateFilterValue {
  mode: 'relative'
  days: ContactRelativeDays
}

export interface RangeDateFilterValue {
  mode: 'range'
  from: string | null
  to: string | null
}

export type ContactDateFilterValue = RelativeDateFilterValue | RangeDateFilterValue

export type ContactFilterRule =
  | {
      id: string
      type: 'status'
      value: string[]
    }
  | {
      id: string
      type: 'source'
      value: string[]
    }
  | {
      id: string
      type: 'dataField'
      field: ContactDataField
      operator: ContactDataFieldOperator
      value: string
    }
  | {
      id: string
      type: 'lastEngaged' | 'dateAdded'
      operator: ContactDateOperator
      value: ContactDateFilterValue
    }

export interface ContactFilterGroup {
  match: ContactMatchMode
  rules: ContactFilterRule[]
}

export const CONTACT_FILTER_TYPE_OPTIONS: Array<{ value: ContactFilterType; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'lastEngaged', label: 'Last engaged' },
  { value: 'dateAdded', label: 'Date added' },
  { value: 'source', label: 'Source' },
  { value: 'dataField', label: 'Data field' },
]

export const CONTACT_DATA_FIELD_OPTIONS: Array<{ value: ContactDataField; label: string }> = [
  { value: 'tag', label: 'Tag' },
]

export const CONTACT_DATA_FIELD_OPERATOR_OPTIONS: Array<{ value: ContactDataFieldOperator; label: string }> = [
  { value: 'matchesExact', label: 'Matches the exact value' },
  { value: 'notMatchesExact', label: "Doesn't match the exact value" },
  { value: 'contains', label: 'Contains the value' },
  { value: 'notContains', label: "Doesn't contain the value" },
  { value: 'isEmpty', label: 'Is empty' },
  { value: 'isNotEmpty', label: "Isn't empty" },
]

export const CONTACT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'complained', label: 'Complained' },
] as const

export const CONTACT_SOURCE_OPTIONS = [
  { value: 'site_registration', label: 'Site Registration' },
  { value: 'Email Form', label: 'Email Form' },
  { value: 'lead_magnet', label: 'Lead Magnet' },
  { value: 'paid_purchase', label: 'Purchase' },
  { value: 'import', label: 'Import' },
  { value: 'manual', label: 'Manual' },
] as const

export const CONTACT_RELATIVE_DAY_OPTIONS: Array<{ value: ContactRelativeDays; label: string }> = [
  { value: 7, label: 'In the last 7 days' },
  { value: 30, label: 'In the last 30 days' },
  { value: 60, label: 'In the last 60 days' },
  { value: 90, label: 'In the last 90 days' },
]

export const emptyContactFilterGroup = (): ContactFilterGroup => ({
  match: 'all',
  rules: [],
})

export function createContactFilterRule(id: string, type: ContactFilterType): ContactFilterRule {
  switch (type) {
    case 'status':
      return { id, type, value: [] }
    case 'source':
      return { id, type, value: [] }
    case 'dataField':
      return { id, type, field: 'tag', operator: 'matchesExact', value: '' }
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

export function cloneContactFilterGroup(group: ContactFilterGroup): ContactFilterGroup {
  return {
    match: group.match,
    rules: group.rules.map((rule) => {
      if (rule.type === 'status' || rule.type === 'source') {
        return { ...rule, value: [...rule.value] }
      }
      if (rule.type === 'dataField') {
        return { ...rule }
      }
      if (rule.value.mode === 'relative') {
        return { ...rule, value: { ...rule.value } }
      }
      return { ...rule, value: { ...rule.value } }
    }),
  }
}

export function pruneContactFilterGroup(group: ContactFilterGroup): ContactFilterGroup {
  return {
    match: group.match,
    rules: group.rules.filter((rule) => {
      if (rule.type === 'status' || rule.type === 'source') {
        return rule.value.length > 0
      }
      if (rule.type === 'dataField') {
        if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') return true
        return rule.value.trim().length > 0
      }
      if (rule.value.mode === 'relative') {
        return true
      }
      return Boolean(rule.value.from || rule.value.to)
    }),
  }
}

export function getContactFilterTypeLabel(type: ContactFilterType): string {
  return CONTACT_FILTER_TYPE_OPTIONS.find((option) => option.value === type)?.label || type
}

export function formatRelativeDays(days: number): string {
  return `In the last ${days} days`
}

export function formatDateRangeLabel(from: string | null, to: string | null): string {
  const format = (value: string) => {
    const date = new Date(value)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (from && to) return `${format(from)} to ${format(to)}`
  if (from) return `After ${format(from)}`
  if (to) return `Before ${format(to)}`
  return 'Custom range'
}

export function formatContactFilterRule(rule: ContactFilterRule): string {
  if (rule.type === 'status') {
    const values = rule.value
      .map((value) => CONTACT_STATUS_OPTIONS.find((option) => option.value === value)?.label || value)
      .join(', ')
    return values ? `Status: ${values}` : 'Status'
  }

  if (rule.type === 'source') {
    const values = rule.value
      .map((value) => CONTACT_SOURCE_OPTIONS.find((option) => option.value === value)?.label || value)
      .join(', ')
    return values ? `Source: ${values}` : 'Source'
  }

  if (rule.type === 'dataField') {
    const fieldLabel = CONTACT_DATA_FIELD_OPTIONS.find((option) => option.value === rule.field)?.label || rule.field
    const operatorLabel = CONTACT_DATA_FIELD_OPERATOR_OPTIONS.find((option) => option.value === rule.operator)?.label || rule.operator
    if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
      return `${fieldLabel} ${operatorLabel.toLowerCase()}`
    }
    return rule.value ? `${fieldLabel} ${operatorLabel.toLowerCase()}: ${rule.value}` : `${fieldLabel} ${operatorLabel.toLowerCase()}`
  }

  const fieldLabel = getContactFilterTypeLabel(rule.type)
  const operatorLabel = rule.operator === 'is' ? 'is' : "isn't"
  if (rule.value.mode === 'relative') {
    return `${fieldLabel} ${operatorLabel} ${formatRelativeDays(rule.value.days).toLowerCase()}`
  }
  return `${fieldLabel} ${operatorLabel} ${formatDateRangeLabel(rule.value.from, rule.value.to)}`
}
