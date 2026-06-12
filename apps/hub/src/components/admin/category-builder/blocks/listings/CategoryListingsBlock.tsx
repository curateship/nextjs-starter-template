"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { getCategoriesWithCountsAction, type Category } from "@/lib/actions/categories/category-actions"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"

type ListingContentType = 'products' | 'posts' | 'directory'
type ListingStyle = 'default' | 'blog' | 'directory'
type ImageFit = 'crop' | 'fit'

const LISTING_STYLES: Record<ListingStyle, { label: string; description: string }> = {
  default: {
    label: 'Default',
    description: 'Current grid or list layout',
  },
  blog: {
    label: 'Blog',
    description: 'Editorial cards with images and read-more links',
  },
  directory: {
    label: 'Directory',
    description: 'Directory cards with rating and address',
  },
}

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

function isPublishedCategory(category: Category) {
  return category.is_published === true
}

// Picks parent categories whose children render as chips on directory-style cards
function ParentCategoryChipPicker({
  siteId,
  selectedIds,
  onChange,
}: {
  siteId: string
  selectedIds: string[]
  onChange: (value: string[]) => void
}) {
  const [parents, setParents] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!siteId) return

    let cancelled = false
    setLoading(true)
    getCategoriesWithCountsAction(siteId, { pageSize: 100 })
      .then(({ data }) => {
        if (cancelled) return
        setParents((data || []).filter(isPublishedCategory))
      })
      .catch(() => {
        if (!cancelled) setParents([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

  if (loading) return <div className="text-sm text-muted-foreground">Loading categories…</div>
  if (parents.length === 0) return <div className="text-sm text-muted-foreground">No parent categories found.</div>

  return (
    <div className="flex flex-wrap gap-2">
      {parents.map((parent) => {
        const selected = selectedIds.includes(parent.id)
        return (
          <button
            key={parent.id}
            type="button"
            onClick={() => {
              onChange(selected ? selectedIds.filter((id) => id !== parent.id) : [...selectedIds, parent.id])
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            )}
          >
            {parent.title}
          </button>
        )
      })}
    </div>
  )
}

interface CategoryListingsBlockProps {
  siteId: string
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

// Template-mode config editor for the category Listings block. Trimmed clone of
// the page builder's listing-view editor: no category picker — items are always
// filtered to the category being viewed, injected at render time.
export function CategoryListingsBlock({ siteId, content, onContentChange, onBack }: CategoryListingsBlockProps) {
  // Defaults mirror the frontend ListingViewsBlock destructure defaults
  const title = content.title ?? ''
  const subtitle = content.subtitle ?? ''
  const headerAlign = (content.headerAlign ?? 'left') as 'left' | 'center'
  const mobileHeaderAlign = (content.mobileHeaderAlign ?? 'left') as 'left' | 'center'
  const contentType = (content.contentType ?? 'directory') as ListingContentType
  const listingStyle = (content.listingStyle ?? 'directory') as ListingStyle
  const imageFit = (content.imageFit ?? 'crop') as ImageFit
  const imageHeight = content.imageHeight as number | undefined
  const imageQuality = content.imageQuality ?? 25
  const saveIconOpacity = content.saveIconOpacity ?? 70
  const displayMode = (content.displayMode ?? 'grid') as 'grid' | 'list'
  const itemsToShow = content.itemsToShow ?? 6
  const mobileColumns = content.mobileColumns ?? 1
  const columns = content.columns ?? 3
  const sortBy = (content.sortBy ?? 'date') as 'date' | 'title' | 'display_order'
  const sortOrder = (content.sortOrder ?? 'desc') as 'asc' | 'desc'
  const isPaginated = Boolean(content.isPaginated)
  const itemsPerPage = content.itemsPerPage ?? 12
  const viewAllText = content.viewAllText ?? ''
  const viewAllLink = content.viewAllLink ?? ''
  const visibility = (content.visibility ?? {}) as Record<string, boolean>
  const selectedCategoryChipParentIds = Array.isArray(content.categoryChipParentIds)
    ? content.categoryChipParentIds as string[]
    : []

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
                  <BlockEditorSection heading="Header Settings" contentClassName="space-y-8">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,220px)_minmax(0,220px)]">
                      <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => onContentChange('title', e.target.value)}
                          placeholder="Enter block title"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="subtitle">Subtitle</Label>
                        <Input
                          id="subtitle"
                          value={subtitle}
                          onChange={(e) => onContentChange('subtitle', e.target.value)}
                          placeholder="Enter block subtitle"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="viewAllText">Header Button Text</Label>
                        <Input
                          id="viewAllText"
                          value={viewAllText}
                          onChange={(e) => onContentChange('viewAllText', e.target.value)}
                          placeholder="View all listings"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="viewAllLink">Header Button Link</Label>
                        <Input
                          id="viewAllLink"
                          value={viewAllLink}
                          onChange={(e) => onContentChange('viewAllLink', e.target.value)}
                          placeholder="/directory"
                        />
                      </div>
                    </div>

                    <div className="flex gap-6">
                      <div className="space-y-2">
                        <Label>Header Alignment</Label>
                        <div className="flex gap-4">
                          {(['left', 'center'] as const).map((option) => (
                            <div key={option} className="flex items-center gap-2">
                              <Checkbox
                                id={`listing-header-align-${option}`}
                                checked={headerAlign === option}
                                onCheckedChange={() => onContentChange('headerAlign', option)}
                              />
                              <Label
                                htmlFor={`listing-header-align-${option}`}
                                className="text-sm capitalize cursor-pointer"
                              >
                                {option}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Mobile Header Alignment</Label>
                        <div className="flex gap-4">
                          {(['left', 'center'] as const).map((option) => (
                            <div key={option} className="flex items-center gap-2">
                              <Checkbox
                                id={`listing-mobile-header-align-${option}`}
                                checked={mobileHeaderAlign === option}
                                onCheckedChange={() => onContentChange('mobileHeaderAlign', option)}
                              />
                              <Label
                                htmlFor={`listing-mobile-header-align-${option}`}
                                className="text-sm capitalize cursor-pointer"
                              >
                                {option}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Content Settings">
                    <div className="grid gap-4">
                      <div className="w-40 space-y-2">
                        <Label htmlFor="contentType">Content Type</Label>
                        <Select value={contentType} onValueChange={(value) => onContentChange('contentType', value)}>
                          <SelectTrigger id="contentType" size="button" className="w-full min-h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="products">Products</SelectItem>
                            <SelectItem value="posts">Posts</SelectItem>
                            <SelectItem value="directory">Directory</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        Items are automatically filtered to the category being viewed.
                      </p>

                      {contentType === 'directory' && (
                        <div className="space-y-2">
                          <Label>Category Chips</Label>
                          <ParentCategoryChipPicker
                            siteId={siteId}
                            selectedIds={selectedCategoryChipParentIds}
                            onChange={(value) => onContentChange('categoryChipParentIds', value)}
                          />
                        </div>
                      )}
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
                      <div className="space-y-2">
                        <Label htmlFor="imageQuality">Image Quality</Label>
                        <Input
                          id="imageQuality"
                          type="number"
                          min={1}
                          max={100}
                          value={imageQuality ?? ''}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            onContentChange('imageQuality', value > 0 ? Math.min(100, value) : undefined)
                          }}
                          placeholder="25"
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              {contentType === 'directory' && (
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
              )}

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
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="title">Title</SelectItem>
                            <SelectItem value="display_order">Display Order</SelectItem>
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
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Listing Style">
                    <div className="grid max-w-3xl grid-cols-3 gap-2">
                      {Object.entries(LISTING_STYLES).map(([key, style]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            onContentChange('listingStyle', key)
                            // Directory cards only make sense for directory content
                            if (key === 'directory') {
                              onContentChange('contentType', 'directory')
                            }
                          }}
                          className={cn(
                            "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            listingStyle === key
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            listingStyle === key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}>
                            {listingStyle === key && <Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{style.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Header Visibility"
                visibility={visibility}
                onChange={(value) => onContentChange('visibility', value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: 'title', label: 'Title' },
                  { key: 'subtitle', label: 'Subtitle' },
                  { key: 'viewAllButton', label: 'Show Header Button' },
                ]}
              />

              <VisibilitySettings
                title="Element Visibility"
                visibility={visibility}
                onChange={(value) => onContentChange('visibility', value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: 'showImage', label: 'Show Image' },
                  ...(contentType === 'directory' ? [
                    { key: 'showSaveButton', label: 'Show Save Button' },
                  ] : []),
                  { key: 'showTitle', label: 'Show Title' },
                  ...(listingStyle === 'directory' ? [
                    { key: 'showMetaDescription', label: 'Show Meta Description' },
                  ] : [
                    { key: 'showDescription', label: 'Show Description' },
                  ]),
                  ...(listingStyle === 'blog' ? [
                    { key: 'showAuthor', label: 'Show Author' },
                    { key: 'showDate', label: 'Show Date' },
                    { key: 'showReadMore', label: 'Show Read More' },
                  ] : []),
                  ...(listingStyle === 'directory' ? [
                    { key: 'showRating', label: 'Show Rating' },
                    { key: 'showAddress', label: 'Show Address' },
                  ] : []),
                ]}
              />

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Pagination">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isPaginated"
                        checked={isPaginated}
                        onCheckedChange={(checked) => onContentChange('isPaginated', !!checked)}
                      />
                      <Label htmlFor="isPaginated" className="cursor-pointer">Enable Pagination</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={isPaginated ? itemsPerPage : itemsToShow}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || (isPaginated ? 12 : 6)
                          onContentChange(isPaginated ? 'itemsPerPage' : 'itemsToShow', value)
                        }}
                        placeholder={isPaginated ? "12" : "6"}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">
                        {isPaginated ? 'per page' : 'items'}
                      </span>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Block Visibility"
                visibility={visibility}
                onChange={(value) => onContentChange('visibility', value)}
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
