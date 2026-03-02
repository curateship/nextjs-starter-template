import { ComponentType } from "react"
import { DefaultTaxonomyContentConfig } from "./DefaultTaxonomyContentConfig"

export interface TaxonomyContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<TaxonomyContentStyleAdminProps>
}

export interface TaxonomyContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const TAXONOMY_CONTENT_STYLES: Record<string, TaxonomyContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultTaxonomyContentConfig,
  },
}
