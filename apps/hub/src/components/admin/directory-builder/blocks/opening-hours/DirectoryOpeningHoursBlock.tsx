"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

interface DirectoryOpeningHoursBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
}

export function DirectoryOpeningHoursBlock({
  content,
  onContentChange,
}: DirectoryOpeningHoursBlockProps) {
  return (
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
  )
}
