"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface AccountClaimedListingsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function AccountClaimedListingsBlock({
  content,
  onContentChange,
  onBack,
}: AccountClaimedListingsBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Header">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="claimed-listings-title">Title</Label>
                        <Input
                          id="claimed-listings-title"
                          value={content.title ?? ""}
                          onChange={(event) => onContentChange("title", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="claimed-listings-description">Description</Label>
                        <Input
                          id="claimed-listings-description"
                          value={content.description ?? ""}
                          onChange={(event) => onContentChange("description", event.target.value)}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Labels">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="claimed-listings-label">Listing Label</Label>
                        <Input
                          id="claimed-listings-label"
                          value={content.listingLabel ?? ""}
                          onChange={(event) => onContentChange("listingLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="claimed-listings-save">Save Button</Label>
                        <Input
                          id="claimed-listings-save"
                          value={content.saveButtonText ?? ""}
                          onChange={(event) => onContentChange("saveButtonText", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="claimed-listings-empty">Empty Text</Label>
                        <Input
                          id="claimed-listings-empty"
                          value={content.emptyText ?? ""}
                          onChange={(event) => onContentChange("emptyText", event.target.value)}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
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
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "description", label: "Description" },
                  { key: "listingSelector", label: "Listing Selector" },
                  { key: "image", label: "Featured Image" },
                  { key: "metaDescription", label: "Meta Description" },
                  { key: "links", label: "Links" },
                  { key: "map", label: "Map" },
                  { key: "hours", label: "Opening Hours" },
                ]}
              />
              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
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
