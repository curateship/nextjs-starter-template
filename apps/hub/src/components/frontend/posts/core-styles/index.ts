import { ComponentType, ReactNode } from "react"
import { DefaultCoreRenderer } from "./DefaultCoreRenderer"

export interface CoreStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    excerpt?: string | null
    featuredImage?: string | null
    showFeaturedImage?: boolean
    showExcerpt?: boolean
    author?: {
      name?: string | null
      image?: string | null
    } | null
    createdAt?: string
    showAuthor?: boolean
    showDate?: boolean
    body?: string
  }
  children?: ReactNode
}

export const CORE_STYLE_RENDERERS: Record<string, ComponentType<CoreStyleRendererProps>> = {
  default: DefaultCoreRenderer,
}
