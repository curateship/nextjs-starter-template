import type { HTMLAttributes, ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { renderTagChips } from "@/lib/utils/directory-tag-chips"
import { sanitizeRichMediaHtml } from "@/lib/utils/html-sanitizer"

interface DirectoryRichTextBlockProps {
  content?: {
    body?: string
    visibility?: Record<string, boolean>
  }
  children?: ReactNode
  cardOverlay?: ReactNode
  cardProps?: HTMLAttributes<HTMLDivElement>
}

export function DirectoryRichTextBlock({ content, children, cardOverlay, cardProps }: DirectoryRichTextBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}

  if (visibility.hideBlock === true || visibility.body === false) {
    return null
  }

  const body = typeof content?.body === "string" ? content.body : ""
  let richTextBody = children

  if (!richTextBody) {
    const safeBody = sanitizeRichMediaHtml(body)

    if (!safeBody.trim()) {
      return null
    }

    // Chips are applied after sanitizing, on already-safe markup.
    richTextBody = <div dangerouslySetInnerHTML={{ __html: renderTagChips(safeBody) }} />
  }

  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cardClassName}>
      <CardContent className="prose prose-neutral dark:prose-invert max-w-none [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl">
        {richTextBody}
      </CardContent>
      {cardOverlay}
    </Card>
  )
}
