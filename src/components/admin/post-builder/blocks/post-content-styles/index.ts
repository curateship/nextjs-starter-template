import { ComponentType } from "react"
import { DefaultPostContentConfig } from "./DefaultPostContentConfig"

export interface PostContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<PostContentStyleAdminProps>
}

export interface PostContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const POST_CONTENT_STYLES: Record<string, PostContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultPostContentConfig,
  },
}
