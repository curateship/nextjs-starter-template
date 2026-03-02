import { ComponentType, ReactNode } from "react"
import { DefaultPostContentRenderer } from "./DefaultPostContentRenderer"

export interface PostContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    excerpt?: string | null
    featuredImage?: string | null
    showFeaturedImage?: boolean
    createdAt?: string
    showAuthor?: boolean
    showDate?: boolean
    body?: string
  }
  children?: ReactNode
}

export const POST_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<PostContentStyleRendererProps>> = {
  default: DefaultPostContentRenderer,
}
