"use client"

import { NewsletterRichTextBlock } from "../blocks/rich-text/NewsletterRichTextBlock"
import { NewsletterHeaderBlock } from "../blocks/header/NewsletterHeaderBlock"
import { NewsletterDividerBlock } from "../blocks/divider/NewsletterDividerBlock"
import { NewsletterFooterBlock } from "../blocks/footer/NewsletterFooterBlock"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface NewsletterBlockEditorProps {
  block: NewsletterBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  subject?: string
  onSubjectChange?: (value: string) => void
}

export function NewsletterBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  subject,
  onSubjectChange,
}: NewsletterBlockEditorProps) {
  if (block.type === "newsletter-rich-text") {
    return (
      <NewsletterRichTextBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        subject={subject}
        onSubjectChange={onSubjectChange}
      />
    )
  }

  if (block.type === "newsletter-header") {
    return (
      <NewsletterHeaderBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
      />
    )
  }

  if (block.type === "newsletter-divider") {
    return (
      <NewsletterDividerBlock
        content={content}
        onContentChange={onContentChange}
      />
    )
  }

  if (block.type === "newsletter-footer") {
    return (
      <NewsletterFooterBlock
        content={content}
        onContentChange={onContentChange}
      />
    )
  }

  return null
}
