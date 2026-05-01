import { ComponentType } from "react"
import { DefaultTestimonialConfig } from "./DefaultTestimonialConfig"
import { VerticalScrollTestimonialConfig } from "./VerticalScrollTestimonialConfig"

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
  'vertical-scroll': {
    label: 'Vertical Scroll',
    description: 'Three vertical scrolling testimonial columns',
    AdminPanel: VerticalScrollTestimonialConfig,
  },
}
