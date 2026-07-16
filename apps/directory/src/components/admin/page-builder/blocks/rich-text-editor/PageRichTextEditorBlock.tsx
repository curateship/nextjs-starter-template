"use client"

import { useCallback, useMemo } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { normalizePageRichTextContent } from "@/components/admin/page-builder/config/page-block-utils"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { BlockTabs } from "@/components/ui/tabs"

interface PageRichTextEditorBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function PageRichTextEditorBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: PageRichTextEditorBlockProps) {
  const normalizedContent = useMemo(() => normalizePageRichTextContent(content), [content])
  const editorContent = useMemo(() => ({
    ...normalizedContent,
    htmlContent: normalizedContent.body,
  }), [normalizedContent])

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange("body", htmlContent)
    if (content.format !== "html") {
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
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <InlineRichTextEditor
                    blockId={blockId}
                    content={editorContent}
                    onContentChange={handleBodyChange}
                    siteId={siteId}
                    isActive
                    editorPadding={0}
                    variant="page"
                  />
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <VisibilitySettings
                title="Elements Visibility"
                visibility={normalizedContent.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                includeHideBlock={false}
                useCard
                fields={[{ key: "body", label: "Content" }]}
              />
              <VisibilitySettings
                title="Block Visibility"
                visibility={normalizedContent.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                useCard
                fields={[]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
