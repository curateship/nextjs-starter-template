"use client"

import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { LISTING_SUBMISSION_FIELDS } from "@/lib/utils/listing-submission-fields"

interface PageListingSubmissionBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function PageListingSubmissionBlock({
  content,
  onContentChange,
  onBack,
}: PageListingSubmissionBlockProps) {
  const visibility = content.visibility && typeof content.visibility === "object" ? content.visibility : {}
  const fields = content.fields && typeof content.fields === "object" ? content.fields : {}

  const updateField = (key: string, prop: string, value: unknown) => {
    const current = fields[key] && typeof fields[key] === "object" ? fields[key] : {}
    onContentChange("fields", { ...fields, [key]: { ...current, [prop]: value } })
  }

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
                        <Label htmlFor="listing-submission-title">Title</Label>
                        <Input
                          id="listing-submission-title"
                          value={content.title ?? ""}
                          onChange={(event) => onContentChange("title", event.target.value)}
                          placeholder="Add your listing"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="listing-submission-subtitle">Subtitle</Label>
                        <Input
                          id="listing-submission-subtitle"
                          value={content.subtitle ?? ""}
                          onChange={(event) => onContentChange("subtitle", event.target.value)}
                          placeholder="Optional subtitle"
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Form">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="listing-submission-category-label">Category field label</Label>
                        <Input
                          id="listing-submission-category-label"
                          value={content.categoryLabel ?? ""}
                          onChange={(event) => onContentChange("categoryLabel", event.target.value)}
                          placeholder="Category"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="listing-submission-button">Submit button text</Label>
                        <Input
                          id="listing-submission-button"
                          value={content.submitButtonText ?? ""}
                          onChange={(event) => onContentChange("submitButtonText", event.target.value)}
                          placeholder="Submit listing"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="listing-submission-success">Confirmation message</Label>
                        <Textarea
                          id="listing-submission-success"
                          value={content.successMessage ?? ""}
                          onChange={(event) => onContentChange("successMessage", event.target.value)}
                          rows={2}
                          placeholder="Shown after someone submits a listing."
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
          value: "fields",
          label: "Fields",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Rename these fields or change their placeholder text. Optional fields can be hidden or made required.
                    Business name and contact email are always shown.
                  </p>
                </CardContent>
              </Card>

              {LISTING_SUBMISSION_FIELDS.map((field) => {
                const config = fields[field.key] && typeof fields[field.key] === "object" ? fields[field.key] : {}
                const show = config.show !== false
                const required = config.required === true

                return (
                  <Card key={field.key}>
                    <CardContent>
                      <BlockEditorSection heading={field.label}>
                        <div className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`listing-submission-field-${field.key}-label`}>Label</Label>
                              <Input
                                id={`listing-submission-field-${field.key}-label`}
                                value={config.label ?? ""}
                                onChange={(event) => updateField(field.key, "label", event.target.value)}
                                placeholder={field.label}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`listing-submission-field-${field.key}-placeholder`}>Placeholder</Label>
                              <Input
                                id={`listing-submission-field-${field.key}-placeholder`}
                                value={config.placeholder ?? ""}
                                onChange={(event) => updateField(field.key, "placeholder", event.target.value)}
                                placeholder={field.placeholder}
                              />
                            </div>
                          </div>

                          {field.optional ? (
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`listing-submission-field-${field.key}-show`}
                                  checked={show}
                                  onCheckedChange={(value) => updateField(field.key, "show", value === true)}
                                />
                                <Label htmlFor={`listing-submission-field-${field.key}-show`}>Show this field</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`listing-submission-field-${field.key}-required`}
                                  checked={required}
                                  disabled={!show}
                                  onCheckedChange={(value) => updateField(field.key, "required", value === true)}
                                />
                                <Label htmlFor={`listing-submission-field-${field.key}-required`}>Required</Label>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Always shown and required.</p>
                          )}
                        </div>
                      </BlockEditorSection>
                    </CardContent>
                  </Card>
                )
              })}
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <VisibilitySettings
                visibility={visibility}
                onChange={(value) => onContentChange("visibility", value)}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "subtitle", label: "Subtitle" },
                  { key: "category", label: "Category selector" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
