import { ComponentType } from "react"
import { DefaultTestimonialConfig } from "./DefaultTestimonialConfig"

export interface TestimonialStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<TestimonialStyleAdminProps>
}

export interface TestimonialStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
}

export const TESTIMONIAL_STYLES: Record<string, TestimonialStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Auto-scrolling dual carousel',
    AdminPanel: DefaultTestimonialConfig,
  },
}
