"use client"

import { useCallback, useMemo } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { normalizeProductLeadMagnetContent } from "@/lib/products/lead-magnet"

interface ProductLeadMagnetBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function ProductLeadMagnetBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: ProductLeadMagnetBlockProps) {
  const normalizedContent = useMemo(() => normalizeProductLeadMagnetContent(content), [content])
  const bodyEditorContent = useMemo(() => ({
    ...normalizedContent,
    htmlContent: normalizedContent.body,
  }), [normalizedContent])
  const deliveryEditorContent = useMemo(() => ({
    ...normalizedContent,
    htmlContent: normalizedContent.deliveryEmailBody,
  }), [normalizedContent])

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange("body", htmlContent)
  }, [onContentChange])

  const handleDeliveryBodyChange = useCallback((htmlContent: string) => {
    onContentChange("deliveryEmailBody", htmlContent)
  }, [onContentChange])

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
                blockId={`${blockId}-body`}
                content={bodyEditorContent}
                onContentChange={handleBodyChange}
                siteId={siteId}
                isActive
                editorPadding={0}
                variant="product"
                placeholder="Enter lead magnet descriptions"
                hidePlaceholderOnFocus
              />
            </BlockEditorSection>
          ),
        },
        {
          value: "delivery-email",
          label: "Delivery Email",
          content: (
            <div className="space-y-6">
              <BlockEditorSection>
                <Input
                  id="lead-magnet-email-subject"
                  value={normalizedContent.deliveryEmailSubject}
                  onChange={(event) => onContentChange("deliveryEmailSubject", event.target.value)}
                  placeholder="Enter email subject"
                  className="h-auto border-0 px-0 py-0 text-lg leading-relaxed text-black shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 md:text-lg dark:text-white"
                />
              </BlockEditorSection>

              <BlockEditorSection>
                <InlineRichTextEditor
                  blockId={`${blockId}-delivery-email`}
                  content={deliveryEditorContent}
                  onContentChange={handleDeliveryBodyChange}
                  siteId={siteId}
                  isActive
                  editorPadding={0}
                  variant="product"
                  placeholder="Enter email delivery text"
                />
              </BlockEditorSection>
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="space-y-6">
              <BlockEditorSection heading="Email Form">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lead-magnet-placeholder">Placeholder</Label>
                    <Input
                      id="lead-magnet-placeholder"
                      value={normalizedContent.formPlaceholder}
                      onChange={(event) => onContentChange("formPlaceholder", event.target.value)}
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-magnet-button">Button Text</Label>
                    <Input
                      id="lead-magnet-button"
                      value={normalizedContent.buttonText}
                      onChange={(event) => onContentChange("buttonText", event.target.value)}
                      placeholder="Send it to me"
                    />
                  </div>
                </div>
              </BlockEditorSection>

              <BlockEditorSection heading="After Signup">
                <div className="space-y-2">
                  <Label htmlFor="lead-magnet-redirect">Redirect URL</Label>
                  <Input
                    id="lead-magnet-redirect"
                    value={normalizedContent.redirectUrl}
                    onChange={(event) => onContentChange("redirectUrl", event.target.value)}
                    placeholder="/thank-you"
                  />
                </div>
              </BlockEditorSection>

              <VisibilitySettings
                title="Element Visibility"
                visibility={normalizedContent.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                includeHideBlock={false}
                fields={[
                  { key: "body", label: "Content" },
                  { key: "image", label: "Feature Image" },
                  { key: "form", label: "Email Form" },
                ]}
              />

              <VisibilitySettings
                title="Block Visibility"
                visibility={normalizedContent.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                fields={[]}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
