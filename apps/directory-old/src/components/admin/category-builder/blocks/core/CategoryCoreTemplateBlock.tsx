"use client"

import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface CategoryCoreTemplateBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
}

// Template-mode editor for the Core block: image size and visibility are the
// template-owned settings — title, featured image and rich text are edited
// on each category.
export function CategoryCoreTemplateBlock({ content, onContentChange }: CategoryCoreTemplateBlockProps) {
  const imageWidth = content.imageWidth as number | undefined

  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Featured Image</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-sm gap-4">
            <div className="space-y-2">
              <Label htmlFor="category-core-image-width">Image Width %</Label>
              <Input
                id="category-core-image-width"
                type="number"
                min={10}
                max={90}
                value={imageWidth ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  onContentChange('imageWidth', value > 0 ? Math.min(90, value) : undefined)
                }}
                // Clamp the minimum on blur (not on change, which would fight typing)
                onBlur={() => {
                  if (imageWidth !== undefined && imageWidth < 10) {
                    onContentChange('imageWidth', 10)
                  }
                }}
                placeholder="40"
              />
              <p className="text-xs text-muted-foreground">
                Share of the row the image takes on desktop. Text fills the rest.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Visibility</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <VisibilitySettings
            visibility={content.visibility}
            onChange={(visibility) => onContentChange("visibility", visibility)}
            fields={[
              { key: "image", label: "Featured Image" },
              { key: "title", label: "Title" },
              { key: "body", label: "Rich Text" },
            ]}
          />
        </CardContent>
      </Card>
    </CardGroup>
  )
}
