"use client"

import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

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
    <CardGroup className="grid">
      {activeTab === "content" && (
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">Header</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="toc-title">Title</Label>
              <Input
                id="toc-title"
                value={title}
                onChange={(event) => onContentChange("title", event.target.value)}
                placeholder="On this page"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "settings" && (
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">Behavior</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="toc-sticky">Sticky on desktop</Label>
              <Switch
                id="toc-sticky"
                checked={sticky}
                onCheckedChange={(checked) => onContentChange("sticky", checked)}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </CardGroup>
  )
}
