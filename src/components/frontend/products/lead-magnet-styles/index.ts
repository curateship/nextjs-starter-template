import { ComponentType } from "react"
import { DefaultLeadMagnetRenderer } from "./DefaultLeadMagnetRenderer"
import { CardLeadMagnetRenderer } from "./CardLeadMagnetRenderer"

export interface LeadMagnetRendererProps {
  config: Record<string, any>
  content: {
    heading?: string
    subheading?: string
    buttonText?: string
  }
  email: string
  setEmail: (v: string) => void
  isLoading: boolean
  error: string
  handleSubmit: (e: React.FormEvent) => void
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export const LEAD_MAGNET_RENDERERS: Record<string, ComponentType<LeadMagnetRendererProps>> = {
  default: DefaultLeadMagnetRenderer,
  card: CardLeadMagnetRenderer,
}
