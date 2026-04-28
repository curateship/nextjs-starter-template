"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useMemo } from "react"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"

interface RichTextBlockProps {
  content: {
    header?: string
    subheader?: string
    headerAlign?: 'left' | 'center'
    richtextContent: string
    visibility?: Record<string, boolean>
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function ProductRichTextBlock({ content, className = "", siteWidth = 'custom', customWidth }: RichTextBlockProps) {
  const sanitizedContent = useMemo(() => {
    return sanitizeRichHtml(content.richtextContent)
  }, [content.richtextContent])

  return (
    <BlockContainer
      header={{
        title: content.visibility?.header !== false ? content.header : '',
        subtitle: content.visibility?.subheader !== false ? content.subheader : '',
        align: content.headerAlign || 'left'
      }}
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </BlockContainer>
  )
}
