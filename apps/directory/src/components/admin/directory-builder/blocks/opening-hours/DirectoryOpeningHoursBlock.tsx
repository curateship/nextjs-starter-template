"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface DirectoryOpeningHoursBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
}

export function DirectoryOpeningHoursBlock({
  content,
  onContentChange,
}: DirectoryOpeningHoursBlockProps) {
  const sourceMode = content.sourceMode === "text" ? "text" : "google"
  const hoursText = content.hoursText ?? ""

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
            <FieldLabel>Hours Source</FieldLabel>
            <Select value={sourceMode} onValueChange={(value) => onContentChange("sourceMode", value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google Place ID</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {sourceMode === "text" ? (
            <Field>
              <FieldLabel htmlFor="directory-opening-hours-text">Hours Text</FieldLabel>
              <Textarea
                id="directory-opening-hours-text"
                value={hoursText}
                onChange={(event) => onContentChange("hoursText", event.target.value)}
                className="field-sizing-content resize-none overflow-hidden"
                placeholder={"Monday: Closed\nTuesday: 11 AM to 9 PM"}
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="directory-opening-hours-place-id">Google Place ID</FieldLabel>
              <Input
                id="directory-opening-hours-place-id"
                value={content.placeId ?? ""}
                onChange={(event) => onContentChange("placeId", event.target.value)}
                placeholder="ChIJ..."
              />
            </Field>
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
