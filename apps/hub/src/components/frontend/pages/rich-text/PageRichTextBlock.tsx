"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useMemo } from "react"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"

interface RichTextBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    content: string
    hideHeader?: boolean
    visibility?: Record<string, boolean>
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function RichTextBlock({ content, className = "", siteWidth = 'custom', customWidth }: RichTextBlockProps) {
  const sanitizedContent = useMemo(() => {
    return sanitizeRichHtml(content.content)
  }, [content.content])

  return (
    <BlockContainer
      header={{
        title: (content.visibility?.header !== false && !content.hideHeader) ? content.title : undefined,
        subtitle: (content.visibility?.header !== false && !content.hideHeader) ? content.subtitle : undefined,
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
