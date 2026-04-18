"use client"

import { ProductRichTextEditorBlock } from "@/components/admin/product-builder/blocks/rich-text-editor/ProductRichTextEditorBlock"
import type { RichTextEditorProps } from "@/components/admin/layout/builder/RichTextEditor"

interface PageRichTextEditorBlockProps extends RichTextEditorProps {
  content: RichTextEditorProps['content'] & {
    visibility?: Record<string, boolean>
  }
  onVisibilityChange?: (value: Record<string, boolean>) => void
}

export function PageRichTextEditorBlock({ content, onContentChange, onVisibilityChange, compact }: PageRichTextEditorBlockProps) {
  return (
    <ProductRichTextEditorBlock
      content={{
        header: content.title,
        subheader: content.subtitle,
        headerAlign: content.headerAlign,
        richtextContent: content.content,
        hideHeader: content.hideHeader,
        hideEditorHeader: content.hideEditorHeader,
      }}
      onContentChange={(nextContent) =>
        onContentChange({
          title: nextContent.header,
          subtitle: nextContent.subheader,
          headerAlign: nextContent.headerAlign,
          content: nextContent.richtextContent,
        })
      }
      compact={compact}
      visibility={content.visibility}
      onVisibilityChange={onVisibilityChange}
    />
  )
}
