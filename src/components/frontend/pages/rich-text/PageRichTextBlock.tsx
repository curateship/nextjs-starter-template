"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useMemo } from "react"
import DOMPurify from "dompurify"

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
    if (typeof window === 'undefined') return content.content
    return DOMPurify.sanitize(content.content, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true
    })
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