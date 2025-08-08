// Block registry type definitions
export interface BlockDefinition {
  type: string
  name: string
  icon: string
  schema: BlockSchema
  defaultContent: Record<string, any>
}

export interface BlockSchema {
  properties: Record<string, BlockProperty>
  required?: string[]
}

export interface BlockProperty {
  type: 'string' | 'boolean' | 'number' | 'url' | 'textarea' | 'array'
  label: string
  placeholder?: string
  description?: string
  validation?: BlockValidation
}

export interface BlockValidation {
  minLength?: number
  maxLength?: number
  pattern?: string
  allowEmpty?: boolean
}

export interface BlockInstance {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export interface SiteCustomization {
  id: string
  siteId: string
  pagePath: string
  blockType: string
  blockIdentifier: string
  customizations: Record<string, any>
  version: number
  isActive: boolean
}

// claude.md followed