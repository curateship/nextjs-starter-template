"use client"

import type { ReactNode } from "react"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { sanitizeRichMediaHtml } from "@/lib/utils/html-sanitizer"

interface RichTextBlockProps {
  content: {
    body?: string
    content?: string
    visibility?: Record<string, boolean>
  }
  children?: ReactNode
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function RichTextBlock({
  content,
  children,
  className = "",
  siteWidth = 'custom',
  customWidth,
}: RichTextBlockProps) {
  const visibility = content.visibility && typeof content.visibility === "object"
    ? content.visibility
    : {}

  if (visibility.hideBlock === true || visibility.body === false) {
    return null
  }

  const body = typeof content.body === "string"
    ? content.body
    : typeof content.content === "string"
      ? content.content
      : ""
  let richTextBody = children

  if (!richTextBody) {
    const safeBody = sanitizeRichMediaHtml(body)

    if (!safeBody.trim()) {
      return null
    }

    richTextBody = <div dangerouslySetInnerHTML={{ __html: safeBody }} />
  }

  return (
    <BlockContainer
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="prose prose-lg dark:prose-invert max-w-none [&_img]:h-auto [&_img]:max-w-full">
        {richTextBody}
      </div>
    </BlockContainer>
  )
}
