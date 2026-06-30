import { ComponentType, ReactNode } from "react"
import { DefaultEventContentRenderer } from "./DefaultEventContentRenderer"

export interface EventContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    featuredImage?: string | null
    showFeaturedImage?: boolean
    eventDate?: string
    eventTime?: string
    externalCtaUrl?: string
    body?: string
  }
  children?: ReactNode
}

export const EVENT_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<EventContentStyleRendererProps>> = {
  default: DefaultEventContentRenderer,
}
