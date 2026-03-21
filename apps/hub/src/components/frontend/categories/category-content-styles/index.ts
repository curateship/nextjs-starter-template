import { ComponentType, ReactNode } from "react"
import { DefaultCategoryContentRenderer } from "./DefaultCategoryContentRenderer"

export interface CategoryContentStyleRendererProps {
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

export const CATEGORY_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<CategoryContentStyleRendererProps>> = {
  default: DefaultCategoryContentRenderer,
}
