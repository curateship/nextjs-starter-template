"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection } from "@/components/ui/tabs"

export type TableOfContentsBlockTab = "content" | "settings"

interface TableOfContentsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  activeTab?: TableOfContentsBlockTab
}

export function TableOfContentsBlock({
  content,
  onContentChange,
  activeTab = "content",
}: TableOfContentsBlockProps) {
  const title = content.title ?? "On this page"
  const sticky = content.sticky ?? true

  return (
    <div className="space-y-4">
      {activeTab === "content" && (
        <BlockEditorSection heading="Header">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="toc-title">Title</Label>
            <Input
              id="toc-title"
              value={title}
              onChange={(event) => onContentChange("title", event.target.value)}
              placeholder="On this page"
            />
          </div>
        </BlockEditorSection>
      )}

      {activeTab === "settings" && (
        <BlockEditorSection heading="Behavior">
          <div className="flex items-center justify-between">
            <Label htmlFor="toc-sticky">Sticky on desktop</Label>
            <Switch
              id="toc-sticky"
              checked={sticky}
              onCheckedChange={(checked) => onContentChange("sticky", checked)}
            />
          </div>
        </BlockEditorSection>
      )}
    </div>
  )
}
