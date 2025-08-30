"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"
import { useEffect, useState } from "react"

interface RichTextBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    content: string
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function RichTextBlock({ content, className = "", siteWidth = 'custom', customWidth }: RichTextBlockProps) {
  const [sanitizedContent, setSanitizedContent] = useState('')
  
  useEffect(() => {
    // Only run DOMPurify on client side
    if (typeof window !== 'undefined') {
      import('dompurify').then((DOMPurify) => {
        const sanitized = DOMPurify.default.sanitize(content.content, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
          ALLOWED_ATTR: ['href', 'target', 'rel'],
          ALLOW_DATA_ATTR: false,
          SANITIZE_DOM: true,
          SANITIZE_NAMED_PROPS: true
        })
        setSanitizedContent(sanitized)
      })
    }
  }, [content.content])

  return (
    <BlockContainer
      header={{
        title: content.title,
        subtitle: content.subtitle,
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