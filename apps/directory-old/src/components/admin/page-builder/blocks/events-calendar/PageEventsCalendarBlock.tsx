"use client"

import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface PageEventsCalendarBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function PageEventsCalendarBlock({
  content,
  onContentChange,
  onBack,
}: PageEventsCalendarBlockProps) {
  const visibility = content.visibility && typeof content.visibility === "object" ? content.visibility : {}
  const defaultView = content.defaultView === "list" ? "list" : "month"

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
                <CardContent>
                  <BlockEditorSection heading="Header">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="events-calendar-title">Title</Label>
                        <Input
                          id="events-calendar-title"
                          value={content.title ?? ""}
                          onChange={(event) => onContentChange("title", event.target.value)}
                          placeholder="Upcoming Events"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="events-calendar-subtitle">Subtitle</Label>
                        <Input
                          id="events-calendar-subtitle"
                          value={content.subtitle ?? ""}
                          onChange={(event) => onContentChange("subtitle", event.target.value)}
                          placeholder="Optional subtitle"
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
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Default View">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="events-calendar-default-view">View shown first</Label>
                        <Select
                          value={defaultView}
                          onValueChange={(value) => onContentChange("defaultView", value)}
                        >
                          <SelectTrigger id="events-calendar-default-view" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="month">Month grid</SelectItem>
                            <SelectItem value="list">List</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <VisibilitySettings
                visibility={visibility}
                onChange={(value) => onContentChange("visibility", value)}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "subtitle", label: "Subtitle" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
