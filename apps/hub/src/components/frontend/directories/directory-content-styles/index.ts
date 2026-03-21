import { ComponentType, ReactNode } from "react"
import { DefaultDirectoryContentRenderer } from "./DefaultDirectoryContentRenderer"

export interface DirectoryContentStyleRendererProps {
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

export const DIRECTORY_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<DirectoryContentStyleRendererProps>> = {
  default: DefaultDirectoryContentRenderer,
}
