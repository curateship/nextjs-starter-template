"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { BlockTabs } from "@/components/ui/tabs"
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
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Opening Hours</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="directory-opening-hours-title">Title</FieldLabel>
                    <Input
                      id="directory-opening-hours-title"
                      value={content.title ?? ""}
                      onChange={(event) => onContentChange("title", event.target.value)}
                      placeholder="Business Hours"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="directory-opening-hours-place-id">Google Place ID</FieldLabel>
                    <Input
                      id="directory-opening-hours-place-id"
                      value={content.placeId ?? ""}
                      onChange={(event) => onContentChange("placeId", event.target.value)}
                      placeholder="ChIJ..."
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
                <CardContent>
                  <VisibilitySettings
                    title="Elements Visibility"
                    visibility={content.visibility}
                    onChange={(visibility) => onContentChange("visibility", visibility)}
                    includeHideBlock={false}
                    fields={[
                      { key: "title", label: "Title" },
                      { key: "hours", label: "Hours" },
                      { key: "openChip", label: "Open Chip" },
                      { key: "timezone", label: "Timezone" },
                    ]}
                  />
                </CardContent>
              </Card>
              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
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
