"use client"

import { useCallback, useMemo } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"

interface DirectoryRichTextEditorBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function DirectoryRichTextEditorBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
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
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <BlockEditorSection>
              <InlineRichTextEditor
                blockId={blockId}
                content={editorContent}
                onContentChange={handleBodyChange}
                siteId={siteId}
                isActive
                editorPadding={0}
                variant="directory"
              />
            </BlockEditorSection>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <VisibilitySettings
              visibility={content.visibility}
              onChange={(visibility) => onContentChange("visibility", visibility)}
              fields={[{ key: "body", label: "Content" }]}
            />
          ),
        },
      ]}
    />
  )
}
