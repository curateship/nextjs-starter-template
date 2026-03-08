"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useEffect, useState } from "react"

interface RichTextBlockProps {
  content: {
    header?: string
    subheader?: string
    headerAlign?: 'left' | 'center'
    richtextContent: string
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function ProductRichTextBlock({ content, className = "", siteWidth = 'custom', customWidth }: RichTextBlockProps) {
  const [sanitizedContent, setSanitizedContent] = useState('')

  useEffect(() => {
    // Only run DOMPurify on client side
    if (typeof window !== 'undefined') {
      import('dompurify').then((DOMPurify) => {
        const sanitized = DOMPurify.default.sanitize(content.richtextContent, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
          ALLOWED_ATTR: ['href', 'target', 'rel'],
          ALLOW_DATA_ATTR: false,
          SANITIZE_DOM: true,
          SANITIZE_NAMED_PROPS: true
        })
        setSanitizedContent(sanitized)
      })
    }
  }, [content.richtextContent])

  return (
    <BlockContainer
      header={{
        title: content.header,
        subtitle: content.subheader,
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
