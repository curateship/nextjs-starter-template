"use client"

import { BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { Input } from "@/components/ui/input"
import { HexColorInput } from "@/components/ui/hex-color-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR } from "@/lib/actions/newsletters/render"

interface NewsletterRichTextBlockProps {
  blockId: string
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
}

export function NewsletterRichTextBlock({
  blockId,
  content,
  onContentChange,
  onBack,
  siteId,
}: NewsletterRichTextBlockProps) {
  const imageBorderSize = Math.max(0, Math.min(48, parseInt(String(content.imageBorderSize ?? 0), 10) || 0))
  const imageBorderColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(content.imageBorderColor || '')
    ? content.imageBorderColor
    : DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <Card>
              <CardContent>
                <InlineRichTextEditor
                  blockId={blockId}
                  content={content}
                  onContentChange={(htmlContent) => onContentChange('htmlContent', htmlContent)}
                  siteId={siteId}
                  isActive
                  editorPadding={0}
                />
              </CardContent>
            </Card>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Background & Spacing</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                <div>
                  <Label htmlFor="richtext-bg-color">Background Color</Label>
                  <HexColorInput
                    id="richtext-bg-color"
                    className="mt-1"
                    inputClassName="flex-1"
                    value={content.backgroundColor || '#ffffff'}
                    onColorChange={(color) => onContentChange('backgroundColor', color)}
                    swatchAriaLabel="Pick a background color"
                  />
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
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Image Output</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                <div>
                  <Label htmlFor="newsletter-image-border-size">Border Size (px)</Label>
                  <Input
                    id="newsletter-image-border-size"
                    type="number"
                    min={0}
                    max={48}
                    value={imageBorderSize}
                    onChange={(event) => onContentChange('imageBorderSize', Math.max(0, Math.min(48, parseInt(event.target.value || '0', 10) || 0)))}
                  />
                </div>

                <div>
                  <Label htmlFor="newsletter-image-border-color">Border Color</Label>
                  <HexColorInput
                    id="newsletter-image-border-color"
                    className="mt-1"
                    inputClassName="flex-1"
                    value={imageBorderColor}
                    onColorChange={(color) => onContentChange('imageBorderColor', color)}
                    swatchAriaLabel="Pick a border color"
                  />
                </div>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
