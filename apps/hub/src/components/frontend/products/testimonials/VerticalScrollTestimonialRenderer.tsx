'use client'

import { TestimonialsColumn, type TestimonialColumnItem } from '@/components/ui/testimonials-columns-1'

interface TestimonialItem {
  id: string
  name: string
  role: string
  avatar: string
  content: string
}

interface VerticalScrollTestimonialRendererProps {
  items: TestimonialItem[]
  config: {
    firstColumnDuration?: number | string
    secondColumnDuration?: number | string
    thirdColumnDuration?: number | string
  }
}

function resolveDuration(value: number | string | undefined, fallback: number) {
  const duration = Number(value)
  return Number.isFinite(duration) && duration > 0 ? duration : fallback
}

function fillColumns(items: TestimonialItem[]): TestimonialColumnItem[] {
  if (items.length === 0) return []

  const filled: TestimonialItem[] = []
  while (filled.length < 9) {
    filled.push(...items)
  }

  return filled.slice(0, 9).map((item, index) => ({
    text: item.content,
    image: item.avatar,
    name: item.name,
    role: item.role,
  }))
}

export function VerticalScrollTestimonialRenderer({ items, config }: VerticalScrollTestimonialRendererProps) {
  const testimonials = fillColumns(items)

  if (testimonials.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No testimonials to display.
      </div>
    )
  }

  const firstColumn = testimonials.slice(0, 3)
  const secondColumn = testimonials.slice(3, 6)
  const thirdColumn = testimonials.slice(6, 9)

  return (
    <div className="grid w-full max-h-[740px] grid-cols-1 gap-6 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] md:grid-cols-2 lg:grid-cols-3">
      <TestimonialsColumn testimonials={firstColumn} className="min-w-0" duration={resolveDuration(config.firstColumnDuration, 15)} />
      <TestimonialsColumn testimonials={secondColumn} className="hidden min-w-0 md:block" duration={resolveDuration(config.secondColumnDuration, 19)} />
      <TestimonialsColumn testimonials={thirdColumn} className="hidden min-w-0 lg:block" duration={resolveDuration(config.thirdColumnDuration, 17)} />
    </div>
  )
}
