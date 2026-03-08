"use client"

import { RichTextEditor, type RichTextEditorProps } from "@/components/admin/shared/RichTextEditor"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface PageRichTextEditorBlockProps extends RichTextEditorProps {
  content: RichTextEditorProps['content'] & {
    visibility?: Record<string, boolean>
  }
  onVisibilityChange?: (value: Record<string, boolean>) => void
}

export function PageRichTextEditorBlock({ content, onContentChange, onVisibilityChange, compact, inline }: PageRichTextEditorBlockProps) {
  return (
    <RichTextEditor content={content} onContentChange={onContentChange} compact={compact} inline={inline}>
      {onVisibilityChange && (
        <VisibilitySettings
          visibility={content.visibility}
          onChange={onVisibilityChange}
          fields={[
            { key: 'header', label: 'Section Header' },
          ]}
        />
      )}
    </RichTextEditor>
  )
}
