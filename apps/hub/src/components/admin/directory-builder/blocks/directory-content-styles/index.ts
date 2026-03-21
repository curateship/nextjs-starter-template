import { ComponentType } from "react"
import { DefaultDirectoryContentConfig } from "./DefaultDirectoryContentConfig"

export interface DirectoryContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<DirectoryContentStyleAdminProps>
}

export interface DirectoryContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const DIRECTORY_CONTENT_STYLES: Record<string, DirectoryContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultDirectoryContentConfig,
  },
}
