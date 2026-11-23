"use client"

import { TestimonialsBlockEditor } from "@/components/admin/layout/builder/blocks/TestimonialsBlockEditor"
import { TESTIMONIAL_STYLES } from "."

interface PageTestimonialsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function PageTestimonialsBlock({ content, onContentChange, siteId, onBack }: PageTestimonialsBlockProps) {
  return (
    <TestimonialsBlockEditor
      content={content}
      onContentChange={onContentChange}
      siteId={siteId}
      styles={TESTIMONIAL_STYLES}
      variant="page"
      onBack={onBack}
    />
  )
}
