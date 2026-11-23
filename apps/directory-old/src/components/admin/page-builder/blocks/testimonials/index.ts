import {
  DefaultTestimonialConfig,
  type TestimonialStyleDefinition,
} from "@/components/admin/layout/builder/blocks/DefaultTestimonialConfig"

// Shared style config lives in layout/builder/blocks; types re-exported for consumers
export type { TestimonialStyleDefinition } from "@/components/admin/layout/builder/blocks/DefaultTestimonialConfig"

export const TESTIMONIAL_STYLES: Record<string, TestimonialStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Auto-scrolling dual carousel',
    AdminPanel: DefaultTestimonialConfig,
  },
}
