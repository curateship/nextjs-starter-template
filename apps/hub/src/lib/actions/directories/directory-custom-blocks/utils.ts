import { generateSlug } from '@/lib/utils/slug'
import type {
  DirectoryCustomBlockField,
  DirectoryCustomBlockFieldOption,
  DirectoryCustomBlockFieldType,
  DirectoryCustomBlockRepeaterField,
  DirectoryCustomBlockSimpleFieldType,
} from './types'

const DIRECTORY_CUSTOM_BLOCK_SELECTION_PREFIX = 'directory-custom:'

function randomId() {
  return Math.random().toString(36).slice(2, 8)
}

export function getDirectoryCustomBlockSelectionType(templateId: string) {
  return `${DIRECTORY_CUSTOM_BLOCK_SELECTION_PREFIX}${templateId}`
}

export function parseDirectoryCustomBlockSelectionType(type: string) {
  return type.startsWith(DIRECTORY_CUSTOM_BLOCK_SELECTION_PREFIX)
    ? type.slice(DIRECTORY_CUSTOM_BLOCK_SELECTION_PREFIX.length)
    : null
}

function createDirectoryCustomFieldId(prefix = 'field') {
  return `${prefix}-${Date.now()}-${randomId()}`
}

export function createDirectoryCustomFieldOption(): DirectoryCustomBlockFieldOption {
  const id = createDirectoryCustomFieldId('option')
  return {
    id,
    label: 'Option',
    value: id,
  }
}

export function createDirectoryCustomRepeaterField(type: DirectoryCustomBlockSimpleFieldType): DirectoryCustomBlockRepeaterField {
  const id = createDirectoryCustomFieldId('subfield')

  return {
    id,
    key: id,
    label: '',
    type,
    placeholder: '',
    ...(type === 'select' ? { options: [createDirectoryCustomFieldOption()] } : {}),
  }
}

export function createDirectoryCustomField(type: DirectoryCustomBlockFieldType): DirectoryCustomBlockField {
  const id = createDirectoryCustomFieldId()

  return {
    id,
    key: id,
    label: '',
    type,
    placeholder: '',
    column: 'left',
    ...(type === 'select' ? { options: [createDirectoryCustomFieldOption()] } : {}),
    ...(type === 'repeater' ? { fields: [createDirectoryCustomRepeaterField('text')] } : {}),
  }
}

export function ensureUniqueTemplateSlug(baseName: string, existingSlugs: Set<string>, currentSlug?: string) {
  const base = generateSlug(baseName) || 'custom-block'
  let slug = base
  let suffix = 2

  while (existingSlugs.has(slug) && slug !== currentSlug) {
    slug = `${base}-${suffix}`
    suffix += 1
  }

  return slug
}

function normalizeOptions(options?: DirectoryCustomBlockFieldOption[]) {
  if (!Array.isArray(options)) return undefined

  return options
    .filter(option => option && typeof option === 'object')
    .map(option => {
      const label = typeof option.label === 'string' ? option.label.trim() : ''
      const value = typeof option.value === 'string' ? option.value.trim() : ''
      return {
        id: option.id || createDirectoryCustomFieldId('option'),
        label: label || value || 'Option',
        value: value || generateSlug(label) || option.id || createDirectoryCustomFieldId('option'),
      }
    })
    .filter(option => option.value)
}

function normalizeRepeaterFields(fields?: DirectoryCustomBlockRepeaterField[]) {
  if (!Array.isArray(fields)) return []

  return fields
    .filter(field => field && typeof field === 'object')
    .map(field => {
      const id = field.id || createDirectoryCustomFieldId('subfield')
      return {
        id,
        key: field.key || id,
        label: typeof field.label === 'string' ? field.label.trim() : '',
        type: field.type,
        placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
        ...(field.type === 'select' ? { options: normalizeOptions(field.options) || [createDirectoryCustomFieldOption()] } : {}),
      }
    })
}

export function normalizeDirectoryCustomBlockFields(fields: DirectoryCustomBlockField[]) {
  if (!Array.isArray(fields)) return []

  return fields
    .filter(field => field && typeof field === 'object')
    .map(field => {
      const id = field.id || createDirectoryCustomFieldId()
      const normalized: DirectoryCustomBlockField = {
        id,
        key: field.key || id,
        label: typeof field.label === 'string' ? field.label.trim() : '',
        type: field.type,
        placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
        column: field.column === 'right' ? 'right' : 'left',
      }

      if (field.type === 'select') {
        normalized.options = normalizeOptions(field.options) || [createDirectoryCustomFieldOption()]
      }

      if (field.type === 'repeater') {
        normalized.fields = normalizeRepeaterFields(field.fields)
      }

      return normalized
    })
}

export function pruneDirectoryCustomBlockValues(fields: DirectoryCustomBlockField[], values: Record<string, any> | null | undefined) {
  const source = values && typeof values === 'object' ? values : {}
  const next: Record<string, any> = {}

  fields.forEach(field => {
    if (field.type === 'repeater') {
      const rows = Array.isArray(source[field.key]) ? source[field.key] : []
      next[field.key] = rows.map((row: Record<string, any>) => pruneRepeaterRowValues(field.fields || [], row))
      return
    }

    if (field.key in source) {
      next[field.key] = source[field.key]
    }
  })

  return next
}

function pruneRepeaterRowValues(fields: DirectoryCustomBlockRepeaterField[], row: any) {
  const source = row && typeof row === 'object' ? row : {}
  const next: Record<string, any> = {}

  fields.forEach(field => {
    if (field.key in source) {
      next[field.key] = source[field.key]
    }
  })

  return next
}

export function countDirectoryCustomFields(fields: DirectoryCustomBlockField[]) {
  return fields.reduce((count, field) => {
    if (field.type === 'repeater') {
      return count + 1 + (field.fields?.length || 0)
    }
    return count + 1
  }, 0)
}

export function buildDirectoryCustomPreviewValues(fields: DirectoryCustomBlockField[]) {
  const values: Record<string, any> = {}

  fields.forEach(field => {
    values[field.key] = buildPreviewValue(field)
  })

  return values
}

function buildPreviewValue(field: DirectoryCustomBlockField) {
  const label = field.label || 'Field'

  switch (field.type) {
    case 'text':
      return `${label} value`
    case 'textarea':
      return `${label} description goes here.`
    case 'rich-text':
      return `<p><strong>${label}</strong> preview content.</p>`
    case 'image':
      return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80'
    case 'link':
      return 'https://example.com'
    case 'number':
      return 42
    case 'toggle':
      return true
    case 'select':
      return field.options?.[0]?.label || field.options?.[0]?.value || ''
    case 'repeater':
      return [buildPreviewRepeaterRow(field.fields || []), buildPreviewRepeaterRow(field.fields || [])]
    default:
      return ''
  }
}

function buildPreviewRepeaterRow(fields: DirectoryCustomBlockRepeaterField[]) {
  const row: Record<string, any> = {}

  fields.forEach(field => {
    switch (field.type) {
      case 'text':
        row[field.key] = `${field.label || 'Item'}`
        break
      case 'textarea':
        row[field.key] = `${field.label || 'Item'} description`
        break
      case 'rich-text':
        row[field.key] = `<p>${field.label || 'Item'} preview</p>`
        break
      case 'image':
        row[field.key] = 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80'
        break
      case 'link':
        row[field.key] = 'https://example.com'
        break
      case 'number':
        row[field.key] = 1
        break
      case 'toggle':
        row[field.key] = true
        break
      case 'select':
        row[field.key] = field.options?.[0]?.label || field.options?.[0]?.value || ''
        break
    }
  })

  return row
}
