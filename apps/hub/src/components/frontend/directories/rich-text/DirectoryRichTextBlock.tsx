import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { sanitizeRichMediaHtml } from "@/lib/utils/html-sanitizer"

interface DirectoryRichTextBlockProps {
  content?: {
    body?: string
    visibility?: Record<string, boolean>
  }
  children?: ReactNode
}

export function DirectoryRichTextBlock({ content, children }: DirectoryRichTextBlockProps) {
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

    richTextBody = <div dangerouslySetInnerHTML={{ __html: safeBody }} />
  }

  return (
    <Card>
      <CardContent className="prose prose-neutral dark:prose-invert max-w-none [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl">
        {richTextBody}
      </CardContent>
    </Card>
  )
}
