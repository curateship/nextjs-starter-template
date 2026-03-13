"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useMemo } from "react"
import DOMPurify from "dompurify"

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
    if (typeof window === 'undefined') return content.richtextContent
    return DOMPurify.sanitize(content.richtextContent, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true
    })
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
