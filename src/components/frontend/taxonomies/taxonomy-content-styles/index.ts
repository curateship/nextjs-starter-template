import { ComponentType, ReactNode } from "react"
import { DefaultTaxonomyContentRenderer } from "./DefaultTaxonomyContentRenderer"

export interface TaxonomyContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    description?: string | null
    featuredImage?: string | null
    showFeaturedImage?: boolean
    body?: string
  }
  children?: ReactNode
}

export const TAXONOMY_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<TaxonomyContentStyleRendererProps>> = {
  default: DefaultTaxonomyContentRenderer,
}
