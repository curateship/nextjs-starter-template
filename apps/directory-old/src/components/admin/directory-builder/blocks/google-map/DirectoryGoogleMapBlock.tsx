"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

interface DirectoryGoogleMapBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
}

export function DirectoryGoogleMapBlock({
  content,
  onContentChange,
}: DirectoryGoogleMapBlockProps) {
  return (
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
  )
}
