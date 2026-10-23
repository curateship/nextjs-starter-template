import { ComponentType } from "react"
import { DefaultEventContentConfig } from "./DefaultEventContentConfig"

export interface EventContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<EventContentStyleAdminProps>
}

export interface EventContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const EVENT_CONTENT_STYLES: Record<string, EventContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultEventContentConfig,
  },
}
