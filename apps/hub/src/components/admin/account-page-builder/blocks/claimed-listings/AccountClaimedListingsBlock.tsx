"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"

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
            <div className="space-y-8">
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
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <VisibilitySettings
              visibility={content.visibility}
              onChange={(value) => onContentChange("visibility", value)}
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
          ),
        },
      ]}
    />
  )
}
