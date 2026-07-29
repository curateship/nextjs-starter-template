import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { getCategoriesWithCountsAction, type Category } from "@/lib/actions/categories/category-actions"
import {
  backfillDirectoryCoordinatesAction,
  getDirectoryCoordinateStatsAction,
  type DirectoryCoordinateStats,
} from "@/lib/actions/directories/directory-map-actions"
import { NEAR_ME_RADII_KM, normalizeRadiusKm } from "@/lib/actions/directories/directory-near-me-core"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import Check from "lucide-react/dist/esm/icons/check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
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
    getCategoriesWithCountsAction({ data: { siteId: siteId, options: { pageSize: 100 } } })
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

  const toggleParent = (categoryId: string) => {
    onChange(selectedIds.includes(categoryId)
      ? selectedIds.filter((id) => id !== categoryId)
      : [...selectedIds, categoryId]
    )
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading category types...</div>
  if (parents.length === 0) return <div className="text-sm text-muted-foreground">No parent categories found.</div>

  return (
    <div className="flex flex-wrap gap-4">
      {parents.map((parent) => (
        <div key={parent.id} className="flex items-center gap-2">
          <Checkbox
            id={`listing-chip-parent-${parent.id}`}
            checked={selectedIds.includes(parent.id)}
            onCheckedChange={() => toggleParent(parent.id)}
          />
          <Label htmlFor={`listing-chip-parent-${parent.id}`} className="cursor-pointer text-sm">
            {parent.title}
          </Label>
        </div>
      ))}
    </div>
  )
}

function ListingMapSettingsPanel({ siteId }: { siteId: string }) {
  const [stats, setStats] = useState<DirectoryCoordinateStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [lastRun, setLastRun] = useState<{ geocoded: number; failed: number } | null>(null)

  const loadStats = useCallback(async () => {
    const result = await getDirectoryCoordinateStatsAction(siteId)
    if (result.data) {
      setStats(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [siteId])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const handleGeocode = async () => {
    setGeocoding(true)
    setLastRun(null)
    try {
      const result = await backfillDirectoryCoordinatesAction(siteId)
      if (result.error || !result.data) {
        setError(result.error || 'Failed to geocode listings')
        return
      }
      setLastRun({ geocoded: result.data.geocoded, failed: result.data.failed })
      await loadStats()
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
      <p className="font-medium">Map locations</p>
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : !stats ? (
        <p className="text-muted-foreground">Checking listing locations…</p>
      ) : (
        <>
          {!stats.hasApiKey && (
            <p className="text-muted-foreground">
              Connect the Google Maps integration (Site Settings → Integrations) to show the map.
              Until then this block falls back to the grid layout.
            </p>
          )}
          <p className="text-muted-foreground">
            {stats.withCoordinates} of {stats.totalPublished} published listings have map locations.
            Listings without one are left off the map.
          </p>
          {stats.hasApiKey && stats.needingGeocode > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleGeocode} disabled={geocoding}>
                {geocoding ? <Loader2 className="size-4 animate-spin" /> : null}
                Geocode {stats.needingGeocode} listing{stats.needingGeocode === 1 ? '' : 's'}
              </Button>
              <span className="text-xs text-muted-foreground">Runs in batches; click again if some remain.</span>
            </div>
          )}
          {stats.hasApiKey && stats.needingGeocode === 0 && stats.totalPublished > 0 && (
            <p className="text-muted-foreground">All listings with addresses are geocoded.</p>
          )}
          {lastRun && (
            <p className="text-xs text-muted-foreground">
              Geocoded {lastRun.geocoded} listing{lastRun.geocoded === 1 ? '' : 's'}
              {lastRun.failed > 0 ? `; ${lastRun.failed} address${lastRun.failed === 1 ? '' : 'es'} could not be resolved` : ''}.
            </p>
          )}
        </>
      )}
    </div>
  )
}

interface SharedListingViewsBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  mobileHeaderAlign?: 'left' | 'center'
  contentType?: ListingContentType
  categoryIds?: string[]
  categoryChipParentIds?: string[]
  enableNearMe?: boolean
  nearMeRadiusKm?: number
  listingStyle?: ListingStyle
  imageFit?: ImageFit
  imageHeight?: number
  saveIconOpacity?: number
  displayMode?: 'grid' | 'list' | 'map'
  itemsToShow?: number
  mobileColumns?: number
  columns?: number
  sortBy?: 'date' | 'title' | 'display_order'
  sortOrder?: 'asc' | 'desc'
  isPaginated?: boolean
  itemsPerPage?: number
  viewAllText?: string
  viewAllLink?: string
  visibility?: Record<string, boolean>
  onVisibilityChange?: (value: Record<string, boolean>) => void
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onHeaderAlignChange: (value: 'left' | 'center') => void
  onMobileHeaderAlignChange: (value: 'left' | 'center') => void
  onContentTypeChange: (value: ListingContentType) => void
  onCategoryIdsChange: (value: string[]) => void
  onCategoryChipParentIdsChange: (value: string[]) => void
  onEnableNearMeChange: (value: boolean) => void
  onNearMeRadiusKmChange: (value: number) => void
  onListingStyleChange: (value: ListingStyle) => void
  onImageFitChange: (value: ImageFit) => void
  onImageHeightChange: (value: number | undefined) => void
  onSaveIconOpacityChange: (value: number | undefined) => void
  onDisplayModeChange: (value: 'grid' | 'list' | 'map') => void
  onItemsToShowChange: (value: number) => void
  onMobileColumnsChange: (value: number) => void
  onColumnsChange: (value: number) => void
  onSortByChange: (value: 'date' | 'title' | 'display_order') => void
  onSortOrderChange: (value: 'asc' | 'desc') => void
  onIsPaginatedChange: (value: boolean) => void
  onItemsPerPageChange: (value: number) => void
  onViewAllTextChange: (value: string) => void
  onViewAllLinkChange: (value: string) => void
  siteId: string
  onBack?: () => void
}

export function PageListingViewBlock({
  title = 'Latest Products',
  subtitle = 'Check out our products',
  headerAlign = 'left',
  mobileHeaderAlign = 'left',
  contentType = 'products',
  categoryIds = [],
  categoryChipParentIds = [],
  enableNearMe = false,
  nearMeRadiusKm,
  listingStyle = 'default',
  imageFit = 'crop',
  imageHeight,
  saveIconOpacity = 70,
  displayMode = 'grid',
  itemsToShow = 6,
  mobileColumns = 1,
  columns = 3,
  sortBy = 'date',
  sortOrder = 'desc',
  isPaginated = false,
  itemsPerPage = 12,
  viewAllText = '',
  viewAllLink = '',
  visibility,
  onVisibilityChange,
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
  onMobileHeaderAlignChange,
  onContentTypeChange,
  onCategoryIdsChange,
  onCategoryChipParentIdsChange,
  onEnableNearMeChange,
  onNearMeRadiusKmChange,
  onListingStyleChange,
  onImageFitChange,
  onImageHeightChange,
  onSaveIconOpacityChange,
  onDisplayModeChange,
  onItemsToShowChange,
  onMobileColumnsChange,
  onColumnsChange,
  onSortByChange,
  onSortOrderChange,
  onIsPaginatedChange,
  onItemsPerPageChange,
  onViewAllTextChange,
  onViewAllLinkChange,
  siteId,
  onBack,
}: SharedListingViewsBlockProps) {
  const selectedCategoryIds = Array.isArray(categoryIds) ? categoryIds : []
  const selectedCategoryChipParentIds = Array.isArray(categoryChipParentIds) ? categoryChipParentIds : []

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
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Enter block title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange(e.target.value)}
                placeholder="Enter block subtitle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="viewAllText">Header Button Text</Label>
              <Input
                id="viewAllText"
                value={viewAllText}
                onChange={(e) => onViewAllTextChange(e.target.value)}
                placeholder="View all products"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="viewAllLink">Header Button Link</Label>
              <Input
                id="viewAllLink"
                value={viewAllLink}
                onChange={(e) => onViewAllLinkChange(e.target.value)}
                placeholder="/products"
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
                      onCheckedChange={() => onHeaderAlignChange(option)}
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
                      onCheckedChange={() => onMobileHeaderAlignChange(option)}
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
              <Select
                value={contentType}
                onValueChange={(value) => {
                  const nextContentType = value as ListingContentType
                  // Map mode is directory-only; leaving directory falls back to grid.
                  if (displayMode === 'map' && nextContentType !== 'directory') {
                    onDisplayModeChange('grid')
                  }
                  onContentTypeChange(nextContentType)
                }}
              >
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

            <div className="min-w-0 space-y-2">
              <Label>Category</Label>
              <CategoryPicker
                siteId={siteId}
                selectedCategoryIds={selectedCategoryIds}
                onSelectionChange={onCategoryIdsChange}
                variant="combobox"
              />
            </div>

            {contentType === 'directory' && (
              <div className="space-y-2">
                <Label>Category Chips</Label>
                <ParentCategoryChipPicker
                  siteId={siteId}
                  selectedIds={selectedCategoryChipParentIds}
                  onChange={onCategoryChipParentIdsChange}
                />
              </div>
            )}

            {contentType === 'directory' && (
              <div className="flex flex-wrap items-start gap-6">
                <div className="grid gap-2">
                  <FieldLabel hint="Adds a location box and a distance dropdown above the listings. Visitors can share their location or type a town, city or postcode, and results are filtered to that distance and ordered nearest first. Listings without a map location are left out while the filter is on.">
                    Near Me Search
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enableNearMe"
                      checked={enableNearMe}
                      onCheckedChange={(checked) => onEnableNearMeChange(!!checked)}
                    />
                    <Label htmlFor="enableNearMe" className="cursor-pointer text-sm">
                      Let visitors search by distance
                    </Label>
                  </div>
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="nearMeRadiusKm" hint="The distance the dropdown starts on. Visitors can change it themselves.">
                    Default Distance
                  </FieldLabel>
                  <Select
                    value={String(normalizeRadiusKm(nearMeRadiusKm))}
                    onValueChange={(value) => onNearMeRadiusKmChange(Number(value))}
                    disabled={!enableNearMe}
                  >
                    <SelectTrigger id="nearMeRadiusKm" size="button">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NEAR_ME_RADII_KM.map((option) => (
                        <SelectItem key={option} value={String(option)}>{option} km</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                      onClick={() => onImageFitChange(key as ImageFit)}
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
                        onImageHeightChange(value > 0 ? value : undefined)
                      }}
                      placeholder="Default"
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
                              onSaveIconOpacityChange(undefined)
                              return
                            }
                            const value = Number(event.target.value)
                            onSaveIconOpacityChange(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined)
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
                    <Select value={displayMode} onValueChange={onDisplayModeChange}>
                      <SelectTrigger id="displayMode" size="button">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grid">Grid</SelectItem>
                        <SelectItem value="list">List</SelectItem>
                        {contentType === 'directory' && <SelectItem value="map">Map</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mobileColumns">Mobile Columns</Label>
                    <Select
                      value={displayMode === 'grid' ? mobileColumns.toString() : 'disabled'}
                      onValueChange={(v) => onMobileColumnsChange(parseInt(v))}
                      disabled={displayMode !== 'grid'}
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
                      onValueChange={(v) => onColumnsChange(parseInt(v))}
                      disabled={displayMode !== 'grid'}
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
                    <Select value={sortBy} onValueChange={onSortByChange}>
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
                    <Select value={sortOrder} onValueChange={onSortOrderChange}>
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

                {displayMode === 'map' && contentType === 'directory' && (
                  <ListingMapSettingsPanel siteId={siteId} />
                )}
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
                        const nextStyle = key as ListingStyle
                        onListingStyleChange(nextStyle)
                        if (nextStyle === 'directory') {
                          onContentTypeChange('directory')
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

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Header Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'title', label: 'Title' },
                    { key: 'subtitle', label: 'Subtitle' },
                    { key: 'viewAllButton', label: 'Show Header Button' },
                  ]}
                />
              )}

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Element Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
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
              )}

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Pagination">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPaginated"
                      checked={isPaginated}
                      onCheckedChange={(checked) => onIsPaginatedChange(!!checked)}
                    />
                    <Label htmlFor="isPaginated" className="cursor-pointer">Enable Pagination</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={isPaginated ? itemsPerPage : itemsToShow}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || (isPaginated ? 12 : 6)
                        if (isPaginated) {
                          onItemsPerPageChange(value)
                        } else {
                          onItemsToShowChange(value)
                        }
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

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Block Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  useCard
                  fields={[]}
                />
              )}

            </CardGroup>
          ),
        },
      ]}
    />
  )
}
