"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { BlockTabs } from "@/components/ui/tabs"
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
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Map Content</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="directory-google-map-location">Address or Place ID</FieldLabel>
                    <Input
                      id="directory-google-map-location"
                      value={content.locationQuery ?? ""}
                      onChange={(event) => onContentChange("locationQuery", event.target.value)}
                      placeholder="1245 Broadway, New York, NY"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="directory-google-map-caption">Caption</FieldLabel>
                    <Textarea
                      id="directory-google-map-caption"
                      value={content.caption ?? ""}
                      onChange={(event) => onContentChange("caption", event.target.value)}
                      placeholder="Visit us here."
                    />
                  </Field>
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
                  <DashboardModalCardTitle>Map Size</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="directory-google-map-height">Height</FieldLabel>
                    <Input
                      id="directory-google-map-height"
                      type="number"
                      min={DIRECTORY_GOOGLE_MAP_MIN_HEIGHT}
                      max={DIRECTORY_GOOGLE_MAP_MAX_HEIGHT}
                      step={20}
                      value={height}
                      onChange={(event) => onContentChange("height", normalizeDirectoryGoogleMapHeight(event.target.value))}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <VisibilitySettings
                    visibility={content.visibility}
                    onChange={(visibility) => onContentChange("visibility", visibility)}
                    fields={[
                      { key: "map", label: "Map" },
                      { key: "caption", label: "Caption" },
                    ]}
                  />
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
