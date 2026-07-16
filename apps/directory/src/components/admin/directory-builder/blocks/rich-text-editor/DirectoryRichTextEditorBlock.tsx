"use client"

import { useCallback, useMemo } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"

interface DirectoryRichTextEditorBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export function DirectoryRichTextEditorBlock({
  content,
  onContentChange,
  siteId,
  blockId,
}: DirectoryRichTextEditorBlockProps) {
  const editorContent = useMemo(() => ({
    ...content,
    htmlContent: content.body || "",
  }), [content])

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange("body", htmlContent)
    if (!content.format) {
      onContentChange("format", "html")
    }
  }, [content.format, onContentChange])

  return (
    <InlineRichTextEditor
      blockId={blockId}
      content={editorContent}
      onContentChange={handleBodyChange}
      siteId={siteId}
      isActive
      editorPadding={0}
      variant="directory"
    />
  )
}
