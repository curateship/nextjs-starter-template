import { ComponentType } from "react"
import { OneColumnListing } from "./OneColumnListing"
import { TwoColumnListing } from "./TwoColumnListing"

export interface DirectoryContentStyleDefinition {
  label: string
  description: string
  ContentPanel?: ComponentType<DirectoryContentStyleContentProps>
  AdminPanel?: ComponentType<DirectoryContentStyleAdminProps>
}

export interface DirectoryContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export interface DirectoryContentStyleContentProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  section?: 'content' | 'claim-listing' | 'custom-buttons'
  directoryData?: {
    title?: string
    featured_image?: string | null
  }
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
}

export const DIRECTORY_CONTENT_STYLES: Record<string, DirectoryContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: OneColumnListing,
  },
  'listing-default': {
    label: 'Listing Default',
    description: 'Two-column listing layout with media and contact actions',
    ContentPanel: TwoColumnListing,
  },
}
