import { ComponentType } from "react"

export interface NavigationStyleDefinition {
  label: string
  description: string
  AdminPanel?: ComponentType<NavigationStyleAdminProps>
}

interface NavigationStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const NAVIGATION_STYLES: Record<string, NavigationStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Standard navigation bar',
  },
}
