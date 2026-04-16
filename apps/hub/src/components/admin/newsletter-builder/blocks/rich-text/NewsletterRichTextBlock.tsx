"use client"

import { type CSSProperties } from "react"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { BlockEditorSection, BlockTabs } from "@/components/admin/shared/BlockTabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR,
  normalizeNewsletterRichTextHtml,
} from "@/lib/actions/newsletters/render"

interface NewsletterRichTextBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
}

export function NewsletterRichTextBlock({
  content,
  onContentChange,
  onBack,
  siteId,
}: NewsletterRichTextBlockProps) {
  const normalizedHtmlContent = normalizeNewsletterRichTextHtml(content.htmlContent || '')
  const imageBorderSize = Math.max(0, Math.min(48, parseInt(String(content.imageBorderSize ?? 0), 10) || 0))
  const imageBorderColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(content.imageBorderColor || '')
    ? content.imageBorderColor
    : DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR
  const richTextContentStyle = {
    '--newsletter-image-border-size': `${imageBorderSize}px`,
    '--newsletter-image-border-color': imageBorderColor,
  } as CSSProperties

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-md">
                <RichTextEditor
                  content={{ content: normalizedHtmlContent, hideHeader: true, hideEditorHeader: true }}
                  onContentChange={(c) => onContentChange('htmlContent', normalizeNewsletterRichTextHtml(c.content))}
                  inline
                  placeholder="Write your content here..."
                  contentClassName="newsletter-email-rich-text"
                  contentStyle={richTextContentStyle}
                  mediaPickerSiteId={siteId}
                />
              </div>
            </div>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <BlockEditorSection heading="Background & Spacing">
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
            </BlockEditorSection>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <BlockEditorSection heading="Image Output">
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
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={imageBorderColor}
                      onChange={(event) => onContentChange('imageBorderColor', event.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      id="newsletter-image-border-color"
                      value={imageBorderColor}
                      onChange={(event) => onContentChange('imageBorderColor', event.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
            </BlockEditorSection>
          ),
        },
      ]}
    />
  )
}
