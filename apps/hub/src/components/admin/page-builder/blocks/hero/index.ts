import { ComponentType } from "react"
import { DefaultHeroConfig } from "./DefaultHeroConfig"

export interface HeroStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<HeroStyleAdminProps>
}

export interface HeroStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const HERO_STYLES: Record<string, HeroStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Hero image with social proof',
    AdminPanel: DefaultHeroConfig,
  },
}
