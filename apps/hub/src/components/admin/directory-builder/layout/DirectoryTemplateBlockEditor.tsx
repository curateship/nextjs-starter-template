"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  DIRECTORY_GOOGLE_MAP_BLOCK_TYPE,
  DIRECTORY_GOOGLE_MAP_MAX_HEIGHT,
  DIRECTORY_GOOGLE_MAP_MIN_HEIGHT,
  normalizeDirectoryGoogleMapHeight,
} from "@/lib/actions/directories/directory-google-map"
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from "@/lib/actions/directories/directory-opening-hours"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface DirectoryTemplateBlockEditorProps {
  block: DirectoryBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  customBlockTemplates: DirectoryCustomBlockTemplate[]
}

type VisibilityField = { key: string; label: string }

function getElementVisibilityFields(blockType: string): VisibilityField[] {
  if (blockType === DIRECTORY_CORE_BLOCK_TYPE) {
    return [
      { key: "image", label: "Image" },
      { key: "title", label: "Title" },
      { key: "address", label: "Address" },
      { key: "rating", label: "Rating" },
      { key: "socialLinks", label: "Social Links" },
      { key: "menuLinks", label: "Menu Links" },
    ]
  }

  if (blockType === "directory-rich-text") {
    return [{ key: "body", label: "Content" }]
  }

  if (blockType === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) {
    return [
      { key: "map", label: "Map" },
      { key: "caption", label: "Caption" },
    ]
  }

  if (blockType === DIRECTORY_OPENING_HOURS_BLOCK_TYPE) {
    return [
      { key: "title", label: "Title" },
      { key: "hours", label: "Hours" },
      { key: "openChip", label: "Open Chip" },
      { key: "timezone", label: "Timezone" },
    ]
  }

  return []
}

function getSaveIconOpacity(value: unknown) {
  const numericValue = Number(value)
  return Math.min(100, Math.max(0, Number.isFinite(numericValue) ? numericValue : 100))
}

export function DirectoryTemplateBlockEditor({
  block,
  content,
  onContentChange,
  customBlockTemplates,
}: DirectoryTemplateBlockEditorProps) {
  const elementFields = getElementVisibilityFields(block.type)
  const customTemplate = block.type === "directory-custom"
    ? customBlockTemplates.find((template) => template.id === content.templateId)
    : null
  const height = normalizeDirectoryGoogleMapHeight(content.height)
  const saveIconOpacity = getSaveIconOpacity(content.saveIconOpacity)

  return (
    <CardGroup className="grid">
      <VisibilitySettings
        title="Block Visibility"
        visibility={content.visibility}
        onChange={(visibility) => onContentChange("visibility", visibility)}
        useCard
        fields={[]}
      />

      {elementFields.length > 0 ? (
        <VisibilitySettings
          title="Element Visibility"
          visibility={content.visibility}
          onChange={(visibility) => onContentChange("visibility", visibility)}
          includeHideBlock={false}
          useCard
          fields={elementFields}
        />
      ) : null}

      {block.type === DIRECTORY_CORE_BLOCK_TYPE ? (
        <>
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Save Button</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="directory-core-save-icon-opacity">Save Icon Opacity</FieldLabel>
                <Input
                  id="directory-core-save-icon-opacity"
                  type="number"
                  min={0}
                  max={100}
                  value={saveIconOpacity}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    onContentChange(
                      "saveIconOpacity",
                      Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined
                    )
                  }}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Sticky</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-start gap-3" htmlFor="directory-core-sticky">
                <Checkbox
                  id="directory-core-sticky"
                  checked={content.sticky === true}
                  onCheckedChange={(checked) => onContentChange("sticky", checked === true)}
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">Keep block visible while scrolling</span>
                  <span className="text-sm text-muted-foreground">
                    Uses sticky positioning on larger screens.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Claim Flow</DashboardModalCardTitle>
              <CardDescription>
                Configure the Claim Listing action shown on inherited listings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-center gap-3" htmlFor="directory-core-claim-enabled">
                <Checkbox
                  id="directory-core-claim-enabled"
                  checked={content.claimEnabled !== false}
                  onCheckedChange={(checked) => onContentChange("claimEnabled", checked === true)}
                />
                <span className="text-sm font-medium">Show claim action</span>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="directory-core-claim-button-text">Button Text</FieldLabel>
                  <Input
                    id="directory-core-claim-button-text"
                    value={content.claimButtonText ?? "Claim Listing"}
                    onChange={(event) => onContentChange("claimButtonText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-edit-path">Owner Edit Path</FieldLabel>
                  <Input
                    id="directory-core-claim-edit-path"
                    value={content.ownerEditPath ?? "/account"}
                    onChange={(event) => onContentChange("ownerEditPath", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-email-text">Pending Email Text</FieldLabel>
                  <Input
                    id="directory-core-claim-email-text"
                    value={content.claimPendingEmailText ?? "Check Business Email"}
                    onChange={(event) => onContentChange("claimPendingEmailText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-review-text">Pending Review Text</FieldLabel>
                  <Input
                    id="directory-core-claim-review-text"
                    value={content.claimPendingReviewText ?? "Claim Pending Review"}
                    onChange={(event) => onContentChange("claimPendingReviewText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-approved-text">Approved Text</FieldLabel>
                  <Input
                    id="directory-core-claim-approved-text"
                    value={content.claimApprovedText ?? "Edit Listing"}
                    onChange={(event) => onContentChange("claimApprovedText", event.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE ? (
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
                onChange={(event) => {
                  onContentChange("height", normalizeDirectoryGoogleMapHeight(event.target.value))
                }}
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {block.type === "directory-custom" ? (
        <Card>
          <CardHeader>
            <DashboardModalCardTitle>Linked Custom Block</DashboardModalCardTitle>
            <CardDescription>
              Field values come from each inherited directory listing.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3 text-sm text-muted-foreground">
            {customTemplate ? (
              <>
                <div>
                  <span className="font-medium text-foreground">Name:</span> {customTemplate.name}
                </div>
                <div>
                  <span className="font-medium text-foreground">Layout:</span> {customTemplate.layout}
                </div>
                <div>
                  <span className="font-medium text-foreground">Fields:</span> {customTemplate.fields.length}
                </div>
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href={`/admin/directory/custom-blocks/${customTemplate.id}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Edit Custom Block
                  </Link>
                </Button>
              </>
            ) : (
              <p>This block references a custom block template that could not be found.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </CardGroup>
  )
}
