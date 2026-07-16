import { ComponentType } from "react"
import { DefaultCoreConfig } from "./DefaultCoreConfig"

export interface CoreStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<CoreStyleAdminProps>
}

export interface CoreStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const CORE_STYLES: Record<string, CoreStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Centered header with body content',
    AdminPanel: DefaultCoreConfig,
  },
}
