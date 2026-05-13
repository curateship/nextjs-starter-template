import { ComponentType, ReactNode } from "react"
import { DefaultHeroRenderer } from "./DefaultHeroRenderer"

export interface HeroStyleRendererProps {
  config: Record<string, any>
  visibility?: Record<string, boolean>
  /** Shared content (title, subtitle, CTAs) for styles that want to integrate them into their layout */
  sharedContent: {
    title?: string
    subtitle?: string
    primaryButton?: string
    secondaryButton?: string
    primaryButtonLink?: string
    secondaryButtonLink?: string
    primaryButtonStyle?: string
    secondaryButtonStyle?: string
  }
  /** Pre-rendered shared content (title, subtitle, CTAs) to place within the style layout */
  children?: ReactNode
}

export const HERO_STYLE_RENDERERS: Record<string, ComponentType<HeroStyleRendererProps>> = {
  default: DefaultHeroRenderer,
}
