import { ComponentType, ReactNode } from "react"
import { DefaultDirectoryContentRenderer } from "./DefaultDirectoryContentRenderer"
import { ListingDefaultDirectoryContentRenderer } from "./ListingDefaultDirectoryContentRenderer"
import type { DirectoryClaimButton, DirectoryContactButton } from "@/lib/actions/directories/directory-content"

export interface DirectoryContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    description?: string | null
    featuredImage?: string | null
    showFeaturedImage?: boolean
    hoverVideoUrl?: string
    claimButton?: DirectoryClaimButton
    contactButtons?: DirectoryContactButton[]
    body?: string
  }
  children?: ReactNode
}

export const DIRECTORY_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<DirectoryContentStyleRendererProps>> = {
  default: DefaultDirectoryContentRenderer,
  'listing-default': ListingDefaultDirectoryContentRenderer,
}
