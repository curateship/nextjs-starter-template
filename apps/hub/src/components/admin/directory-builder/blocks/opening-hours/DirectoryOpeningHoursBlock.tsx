"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"

interface DirectoryOpeningHoursBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function DirectoryOpeningHoursBlock({
  content,
  onContentChange,
  onBack,
}: DirectoryOpeningHoursBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <BlockEditorSection heading="Opening Hours" contentClassName="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="directory-opening-hours-title">Title</Label>
                <Input
                  id="directory-opening-hours-title"
                  value={content.title ?? ""}
                  onChange={(event) => onContentChange("title", event.target.value)}
                  placeholder="Business Hours"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="directory-opening-hours-place-id">Google Place ID</Label>
                <Input
                  id="directory-opening-hours-place-id"
                  value={content.placeId ?? ""}
                  onChange={(event) => onContentChange("placeId", event.target.value)}
                  placeholder="ChIJ..."
                />
              </div>
            </BlockEditorSection>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <VisibilitySettings
              visibility={content.visibility}
              onChange={(visibility) => onContentChange("visibility", visibility)}
              fields={[
                { key: "title", label: "Title" },
                { key: "hours", label: "Hours" },
                { key: "openChip", label: "Open Chip" },
                { key: "timezone", label: "Timezone" },
              ]}
            />
          ),
        },
      ]}
    />
  )
}
