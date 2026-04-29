import { ComponentType, ReactNode } from "react"
import { DefaultProductContentRenderer } from "./DefaultProductContentRenderer"

export interface ProductContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    featuredImage?: string | null
    showFeaturedImage?: boolean
    downloadButtonText?: string
    downloadButtonStyle?: string
    downloadButtonUrl?: string
    body?: string
  }
  children?: ReactNode
}

export const PRODUCT_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<ProductContentStyleRendererProps>> = {
  default: DefaultProductContentRenderer,
}
