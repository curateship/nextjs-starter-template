"use client"

import { useCallback, useMemo } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { normalizeProductEmailModalContent } from "@/lib/actions/products/email-modal"

interface ProductEmailModalBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function ProductEmailModalBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: ProductEmailModalBlockProps) {
  const normalizedContent = useMemo(() => normalizeProductEmailModalContent(content), [content])
  const deliveryEditorContent = useMemo(() => ({
    ...normalizedContent,
    htmlContent: normalizedContent.deliveryEmailBody,
  }), [normalizedContent])

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
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Modal Copy</DashboardModalCardTitle>
                <CardDescription>Text visitors see inside the email modal.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="product-email-modal-title">Title</Label>
                  <Input
                    id="product-email-modal-title"
                    value={normalizedContent.title}
                    onChange={(event) => onContentChange("title", event.target.value)}
                    placeholder="Subscribe to our newsletter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-email-modal-description">Description</Label>
                  <Textarea
                    id="product-email-modal-description"
                    value={normalizedContent.description}
                    onChange={(event) => onContentChange("description", event.target.value)}
                    placeholder="Get the latest updates and news delivered to your inbox."
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="product-email-modal-label">Email Label</Label>
                    <Input
                      id="product-email-modal-label"
                      value={normalizedContent.emailLabel}
                      onChange={(event) => onContentChange("emailLabel", event.target.value)}
                      placeholder="Email address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-email-modal-placeholder">Placeholder</Label>
                    <Input
                      id="product-email-modal-placeholder"
                      value={normalizedContent.placeholder}
                      onChange={(event) => onContentChange("placeholder", event.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="product-email-modal-submit">Subscribe Button</Label>
                    <Input
                      id="product-email-modal-submit"
                      value={normalizedContent.submitButtonText}
                      onChange={(event) => onContentChange("submitButtonText", event.target.value)}
                      placeholder="Subscribe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-email-modal-dismiss">Dismiss Button</Label>
                    <Input
                      id="product-email-modal-dismiss"
                      value={normalizedContent.dismissButtonText}
                      onChange={(event) => onContentChange("dismissButtonText", event.target.value)}
                      placeholder="Maybe Later"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-email-modal-success">Success Message</Label>
                  <Input
                    id="product-email-modal-success"
                    value={normalizedContent.successMessage}
                    onChange={(event) => onContentChange("successMessage", event.target.value)}
                    placeholder="Thanks for subscribing."
                  />
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "delivery-email",
          label: "Delivery Email",
          content: (
            <Card>
              <CardContent>
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
              </CardContent>
            </Card>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Trigger</DashboardModalCardTitle>
                  <CardDescription>Choose whether this invisible block opens the modal on scroll.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="product-email-modal-open-scroll" className="cursor-pointer">
                      Open on scroll
                    </Label>
                    <Switch
                      id="product-email-modal-open-scroll"
                      checked={normalizedContent.openOnScroll}
                      onCheckedChange={(checked) => onContentChange("openOnScroll", checked === true)}
                    />
                  </div>
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Elements Visibility"
                visibility={normalizedContent.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "description", label: "Description" },
                  { key: "emailLabel", label: "Email Label" },
                  { key: "dismissButton", label: "Dismiss Button" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
