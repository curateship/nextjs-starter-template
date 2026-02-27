import { ComponentType } from "react"
import { DefaultLeadMagnetConfig } from "./DefaultLeadMagnetConfig"

export interface LeadMagnetStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<LeadMagnetStyleAdminProps>
}

export interface LeadMagnetStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const LEAD_MAGNET_STYLES: Record<string, LeadMagnetStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Gradient card with email capture form',
    AdminPanel: DefaultLeadMagnetConfig,
  },
}
