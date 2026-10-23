"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import Check from "lucide-react/dist/esm/icons/check.js"
import { cn } from "@/lib/utils/tailwind"

type ImageFit = 'crop' | 'fit'

const IMAGE_FIT_OPTIONS: Record<ImageFit, { label: string; description: string }> = {
  crop: {
    label: 'Crop',
    description: 'Fill the image frame',
  },
  fit: {
    label: 'Fit',
    description: 'Show the full image',
  },
}

interface AccountCoreBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

// Admin editor for the account Core block — profile header is member data
// (avatar/name/bio/socials come from the user), so only the saved-listings
// labels, card styling (mirrors the listing-view editors), and element
// visibility are configurable here.
export function AccountCoreBlock({
  content,
  onContentChange,
  onBack,
}: AccountCoreBlockProps) {
  // Defaults mirror the frontend AccountCoreBlock destructure defaults
  const imageFit = (content.imageFit ?? 'crop') as ImageFit
  const imageHeight = content.imageHeight as number | undefined
  const saveIconOpacity = content.saveIconOpacity ?? 70
  const displayMode = (content.displayMode ?? 'grid') as 'grid' | 'list'
  const columns = content.columns ?? 3
  const mobileColumns = content.mobileColumns ?? 1
  const sortBy = (content.sortBy ?? 'date') as 'date' | 'title'
  const sortOrder = (content.sortOrder ?? 'desc') as 'asc' | 'desc'

  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Saved Listings">
                    <div className="space-y-2">
                      <Label htmlFor="account-core-saved-title">Title</Label>
                      <Input
                        id="account-core-saved-title"
                        value={content.savedTitle ?? ""}
                        onChange={(event) => onContentChange("savedTitle", event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-core-empty-text">Empty Folder Text</Label>
                      <Input
                        id="account-core-empty-text"
                        value={content.emptyText ?? ""}
                        onChange={(event) => onContentChange("emptyText", event.target.value)}
                      />
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "stylings",
          label: "Stylings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Image Display">
                    <div className="grid grid-cols-2 gap-2 max-w-sm">
                      {Object.entries(IMAGE_FIT_OPTIONS).map(([key, option]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onContentChange('imageFit', key)}
                          className={cn(
                            "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            imageFit === key
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            imageFit === key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}>
                            {imageFit === key && <Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid max-w-sm grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="imageHeight">Image Height %</Label>
                        <Input
                          id="imageHeight"
                          type="number"
                          min={0}
                          max={200}
                          value={imageHeight ?? ''}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            onContentChange('imageHeight', value > 0 ? value : undefined)
                          }}
                          placeholder="Default"
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Save Button">
                    <div className="max-w-sm space-y-2">
                      <Label htmlFor="saveIconOpacity">Save Icon Opacity</Label>
                      <Input
                        id="saveIconOpacity"
                        type="number"
                        min={0}
                        max={100}
                        value={saveIconOpacity ?? ''}
                        onChange={(event) => {
                          if (event.target.value === '') {
                            onContentChange('saveIconOpacity', undefined)
                            return
                          }
                          const value = Number(event.target.value)
                          onContentChange('saveIconOpacity', Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined)
                        }}
                        placeholder="70"
                      />
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Layout">
                    <div className="flex flex-wrap gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="displayMode">Display Mode</Label>
                        <Select value={displayMode} onValueChange={(value) => onContentChange('displayMode', value)}>
                          <SelectTrigger id="displayMode" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grid">Grid</SelectItem>
                            <SelectItem value="list">List</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mobileColumns">Mobile Columns</Label>
                        <Select
                          value={displayMode === 'grid' ? mobileColumns.toString() : 'disabled'}
                          onValueChange={(v) => onContentChange('mobileColumns', parseInt(v))}
                          disabled={displayMode === 'list'}
                        >
                          <SelectTrigger id="mobileColumns" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Column</SelectItem>
                            <SelectItem value="2">2 Columns</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="columns">Columns</Label>
                        <Select
                          value={displayMode === 'grid' ? columns.toString() : 'disabled'}
                          onValueChange={(v) => onContentChange('columns', parseInt(v))}
                          disabled={displayMode === 'list'}
                        >
                          <SelectTrigger id="columns" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 Columns</SelectItem>
                            <SelectItem value="3">3 Columns</SelectItem>
                            <SelectItem value="4">4 Columns</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sortBy">Sort By</Label>
                        <Select value={sortBy} onValueChange={(value) => onContentChange('sortBy', value)}>
                          <SelectTrigger id="sortBy" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Date = when the member saved the listing */}
                            <SelectItem value="date">Date Saved</SelectItem>
                            <SelectItem value="title">Title</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sortOrder">Sort Order</Label>
                        <Select value={sortOrder} onValueChange={(value) => onContentChange('sortOrder', value)}>
                          <SelectTrigger id="sortOrder" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">Ascending</SelectItem>
                            <SelectItem value="desc">Descending</SelectItem>
                          </SelectContent>
                        </Select>
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
              <VisibilitySettings
                title="Elements Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: "avatar", label: "Avatar" },
                  { key: "name", label: "Name" },
                  { key: "bio", label: "Bio" },
                  { key: "socialLinks", label: "Social Links" },
                  { key: "savedTabs", label: "Saved Listings Tabs" },
                ]}
              />
              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
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
