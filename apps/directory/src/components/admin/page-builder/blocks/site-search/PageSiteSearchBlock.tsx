"use client"

import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import {
  SITE_SEARCH_TYPE_LABELS,
  SITE_SEARCH_TYPES,
  normalizeSiteSearchTypes,
  type SiteSearchSourceType,
} from "@/lib/site-search/types"

interface PageSiteSearchBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function PageSiteSearchBlock({
  content,
  onContentChange,
  onBack,
}: PageSiteSearchBlockProps) {
  const enabledTypes = normalizeSiteSearchTypes(content.enabledTypes)
  const pageSize = Math.min(50, Math.max(1, numberValue(content.pageSize, 12)))
  const visibility = content.visibility && typeof content.visibility === "object" ? content.visibility : {}

  const toggleType = (type: SiteSearchSourceType, checked: boolean) => {
    const next = checked
      ? [...new Set([...enabledTypes, type])]
      : enabledTypes.filter((item) => item !== type)

    onContentChange("enabledTypes", next.length ? next : enabledTypes)
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
                  <BlockEditorSection heading="Text">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="site-search-title">Title</Label>
                        <Input
                          id="site-search-title"
                          value={content.title ?? ""}
                          onChange={(event) => onContentChange("title", event.target.value)}
                          placeholder="Search"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="site-search-subtitle">Subtitle</Label>
                        <Input
                          id="site-search-subtitle"
                          value={content.subtitle ?? ""}
                          onChange={(event) => onContentChange("subtitle", event.target.value)}
                          placeholder="Find anything on this site"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="site-search-placeholder">Placeholder</Label>
                        <Input
                          id="site-search-placeholder"
                          value={content.placeholder ?? ""}
                          onChange={(event) => onContentChange("placeholder", event.target.value)}
                          placeholder="Search this site..."
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="site-search-empty-text">Empty Prompt</Label>
                        <Input
                          id="site-search-empty-text"
                          value={content.emptyText ?? ""}
                          onChange={(event) => onContentChange("emptyText", event.target.value)}
                          placeholder="Enter a search term to find public content."
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="site-search-no-results-text">No Results Text</Label>
                        <Input
                          id="site-search-no-results-text"
                          value={content.noResultsText ?? ""}
                          onChange={(event) => onContentChange("noResultsText", event.target.value)}
                          placeholder="No results found."
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
                  <BlockEditorSection heading="Content Types">
                    <div className="grid gap-3 md:grid-cols-2">
                      {SITE_SEARCH_TYPES.map((type) => (
                        <div key={type} className="flex items-center gap-2">
                          <Checkbox
                            id={`site-search-type-${type}`}
                            checked={enabledTypes.includes(type)}
                            onCheckedChange={(checked) => toggleType(type, checked === true)}
                          />
                          <Label htmlFor={`site-search-type-${type}`} className="cursor-pointer">
                            {SITE_SEARCH_TYPE_LABELS[type]}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Results">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border p-3">
                        <Label htmlFor="site-search-page-size" className="cursor-pointer">
                          Results per page
                        </Label>
                        <Input
                          id="site-search-page-size"
                          type="number"
                          min={1}
                          max={50}
                          value={pageSize}
                          className="h-9 w-20 text-right sm:w-24"
                          onChange={(event) => {
                            const value = Math.min(50, Math.max(1, numberValue(event.target.value, 12)))
                            onContentChange("pageSize", value)
                          }}
                        />
                      </div>

                      {[
                        ["showTypeChips", "Show type chips"],
                        ["showImages", "Show images"],
                        ["showSummaries", "Show summaries"],
                      ].map(([field, label]) => (
                        <div key={field} className="flex min-h-16 items-center justify-between gap-3 rounded-md border p-3">
                          <Label htmlFor={`site-search-${field}`} className="cursor-pointer">
                            {label}
                          </Label>
                          <Switch
                            id={`site-search-${field}`}
                            className="shrink-0"
                            checked={content[field] !== false}
                            onCheckedChange={(checked) => onContentChange(field, checked)}
                          />
                        </div>
                      ))}
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
                  { key: "form", label: "Search Form" },
                  { key: "typeChips", label: "Type Chips" },
                  { key: "results", label: "Results" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
