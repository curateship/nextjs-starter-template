'use client'

import { BlockContainer } from '@/components/frontend/layout/block-container'
import dynamic from '@/lib/dynamic'

const DefaultTestimonialRenderer = dynamic(
  () => import('./DefaultTestimonialRenderer').then(m => m.DefaultTestimonialRenderer),
  { ssr: false }
)

interface TestimonialItem {
  id: string
  name: string
  role: string
  avatar: string
  content: string
}

interface TestimonialsBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    testimonialItems?: TestimonialItem[]
    testimonialStyle?: string
    styleConfig?: Record<string, Record<string, any>>
    visibility?: Record<string, boolean>
  }
  siteWidth?: string
  customWidth?: number
}

export function TestimonialsBlock({ content, siteWidth, customWidth }: TestimonialsBlockProps) {
  const {
    title = 'Meet Our Happy Clients',
    subtitle = 'Hear from the teams who have transformed their workflow.',
    headerAlign = 'center',
    testimonialItems = [],
    testimonialStyle = 'default',
    styleConfig = { default: { speed: 0.7, showSecondRow: true } },
    visibility,
  } = content

  const currentConfig = styleConfig[testimonialStyle] || { speed: 0.7, showSecondRow: true }

  return (
    <BlockContainer
      header={{
        title: visibility?.title !== false ? (title || undefined) : undefined,
        subtitle: visibility?.subtitle !== false ? (subtitle || undefined) : undefined,
        align: headerAlign,
      }}
      siteWidth={siteWidth as 'full' | 'custom'}
      customWidth={customWidth}
    >
      <DefaultTestimonialRenderer items={testimonialItems} config={currentConfig} />
    </BlockContainer>
  )
}
