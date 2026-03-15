"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"

interface NewsletterRichTextBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterRichTextBlock({ content, onContentChange, onBack }: NewsletterRichTextBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <RichTextEditor
                  content={{ content: content.htmlContent || '', hideHeader: true, hideEditorHeader: true }}
                  onContentChange={(c) => onContentChange('htmlContent', c.content)}
                  inline
                  placeholder="Write your content here..."
                />
              </CardContent>
            </Card>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Background & Spacing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="richtext-bg-color">Background Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={content.backgroundColor || '#ffffff'}
                      onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      id="richtext-bg-color"
                      value={content.backgroundColor || '#ffffff'}
                      onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="richtext-padding">Padding (px)</Label>
                  <input
                    id="richtext-padding"
                    type="text"
                    defaultValue={(content.padding ?? 20).toString()}
                    onBlur={(e) => {
                      const val = e.target.value
                      const num = val === '' ? 0 : parseInt(val)
                      if (!isNaN(num)) {
                        onContentChange('padding', num)
                      }
                    }}
                    className="border p-2 rounded-md mt-1"
                    style={{ width: '100%' }}
                  />
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: null,
        },
      ]}
    />
  )
}
