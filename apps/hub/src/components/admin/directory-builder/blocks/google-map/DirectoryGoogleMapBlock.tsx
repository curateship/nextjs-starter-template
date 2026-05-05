"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"
import {
  DIRECTORY_GOOGLE_MAP_MAX_HEIGHT,
  DIRECTORY_GOOGLE_MAP_MIN_HEIGHT,
  normalizeDirectoryGoogleMapHeight,
} from "@/lib/actions/directories/directory-google-map"

interface DirectoryGoogleMapBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function DirectoryGoogleMapBlock({
  content,
  onContentChange,
  onBack,
}: DirectoryGoogleMapBlockProps) {
  const height = normalizeDirectoryGoogleMapHeight(content.height)

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <BlockEditorSection heading="Map Content" contentClassName="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="directory-google-map-location">Address or Place ID</Label>
                <Input
                  id="directory-google-map-location"
                  value={content.locationQuery ?? ""}
                  onChange={(event) => onContentChange("locationQuery", event.target.value)}
                  placeholder="1245 Broadway, New York, NY"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="directory-google-map-caption">Caption</Label>
                <Textarea
                  id="directory-google-map-caption"
                  value={content.caption ?? ""}
                  onChange={(event) => onContentChange("caption", event.target.value)}
                  placeholder="Visit us here."
                />
              </div>
            </BlockEditorSection>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="space-y-6">
              <BlockEditorSection heading="Map Size">
                <div className="space-y-2">
                  <Label htmlFor="directory-google-map-height">Height</Label>
                  <Input
                    id="directory-google-map-height"
                    type="number"
                    min={DIRECTORY_GOOGLE_MAP_MIN_HEIGHT}
                    max={DIRECTORY_GOOGLE_MAP_MAX_HEIGHT}
                    step={20}
                    value={height}
                    onChange={(event) => onContentChange("height", normalizeDirectoryGoogleMapHeight(event.target.value))}
                  />
                </div>
              </BlockEditorSection>

              <VisibilitySettings
                visibility={content.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                fields={[
                  { key: "map", label: "Map" },
                  { key: "caption", label: "Caption" },
                ]}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
