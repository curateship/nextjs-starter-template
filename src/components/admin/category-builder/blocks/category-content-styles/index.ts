import { ComponentType } from "react"
import { DefaultCategoryContentConfig } from "./DefaultCategoryContentConfig"

export interface CategoryContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<CategoryContentStyleAdminProps>
}

export interface CategoryContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const CATEGORY_CONTENT_STYLES: Record<string, CategoryContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultCategoryContentConfig,
  },
}
