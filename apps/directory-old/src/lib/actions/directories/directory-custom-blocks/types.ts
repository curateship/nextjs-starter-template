const DIRECTORY_CUSTOM_BLOCK_LAYOUTS = ['stack', 'stack-card', 'two-column'] as const

export type DirectoryCustomBlockLayout = typeof DIRECTORY_CUSTOM_BLOCK_LAYOUTS[number]

const DIRECTORY_CUSTOM_BLOCK_FIELD_TYPES = [
  'text',
  'textarea',
  'rich-text',
  'image',
  'link',
  'number',
  'tags',
  'toggle',
  'select',
  'repeater',
] as const

export type DirectoryCustomBlockFieldType = typeof DIRECTORY_CUSTOM_BLOCK_FIELD_TYPES[number]

export type DirectoryCustomBlockSimpleFieldType = Exclude<DirectoryCustomBlockFieldType, 'repeater'>

export interface DirectoryCustomBlockFieldOption {
  id: string
  label: string
  value: string
}

export interface DirectoryCustomBlockRepeaterField {
  id: string
  key: string
  label: string
  type: DirectoryCustomBlockSimpleFieldType
  placeholder?: string
  options?: DirectoryCustomBlockFieldOption[]
}

export interface DirectoryCustomBlockField {
  id: string
  key: string
  label: string
  type: DirectoryCustomBlockFieldType
  placeholder?: string
  column?: 'left' | 'right'
  options?: DirectoryCustomBlockFieldOption[]
  fields?: DirectoryCustomBlockRepeaterField[]
}

export interface DirectoryCustomBlockTemplate {
  id: string
  site_id: string
  name: string
  slug: string
  layout: DirectoryCustomBlockLayout
  fields: DirectoryCustomBlockField[]
  used_in_count?: number
  created_at: string
  updated_at: string
}
