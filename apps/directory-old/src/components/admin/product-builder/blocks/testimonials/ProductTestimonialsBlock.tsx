"use client"

import { TestimonialsBlockEditor } from "@/components/admin/layout/builder/blocks/TestimonialsBlockEditor"
import { TESTIMONIAL_STYLES } from "."

interface ProductTestimonialsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function ProductTestimonialsBlock({ content, onContentChange, siteId, onBack }: ProductTestimonialsBlockProps) {
  return (
    <TestimonialsBlockEditor
      content={content}
      onContentChange={onContentChange}
      siteId={siteId}
      styles={TESTIMONIAL_STYLES}
      variant="product"
      onBack={onBack}
    />
  )
}
