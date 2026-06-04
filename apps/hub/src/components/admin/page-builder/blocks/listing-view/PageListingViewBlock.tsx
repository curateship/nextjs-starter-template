import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { VisibilitySettings } from "../shared/VisibilitySettings"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"

type ListingContentType = 'products' | 'posts' | 'directory'
type ListingStyle = 'default' | 'blog'
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

interface SharedListingViewsBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  mobileHeaderAlign?: 'left' | 'center'
  contentType?: ListingContentType
  categoryIds?: string[]
  listingStyle?: ListingStyle
  imageFit?: ImageFit
  imageHeight?: number
  imageQuality?: number
  saveIconOpacity?: number
  displayMode?: 'grid' | 'list'
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
  onListingStyleChange: (value: ListingStyle) => void
  onImageFitChange: (value: ImageFit) => void
  onImageHeightChange: (value: number | undefined) => void
  onImageQualityChange: (value: number | undefined) => void
  onSaveIconOpacityChange: (value: number | undefined) => void
  onDisplayModeChange: (value: 'grid' | 'list') => void
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
  listingStyle = 'default',
  imageFit = 'crop',
  imageHeight,
  imageQuality = 25,
  saveIconOpacity = 100,
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
  onListingStyleChange,
  onImageFitChange,
  onImageHeightChange,
  onImageQualityChange,
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
              <Select value={contentType} onValueChange={(value) => onContentTypeChange(value as ListingContentType)}>
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
                        onImageQualityChange(value > 0 ? Math.min(100, value) : undefined)
                      }}
                      placeholder="25"
                    />
                  </div>
                  {contentType === 'directory' && (
                    <div className="space-y-2">
                      <Label htmlFor="saveIconOpacity">Save Icon Opacity</Label>
                      <Input
                        id="saveIconOpacity"
                        type="number"
                        min={0}
                        max={100}
                        value={saveIconOpacity ?? ''}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          onSaveIconOpacityChange(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined)
                        }}
                        placeholder="100"
                      />
                    </div>
                  )}
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
                    <Select value={displayMode} onValueChange={onDisplayModeChange}>
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
                      onValueChange={(v) => onMobileColumnsChange(parseInt(v))}
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
                      onValueChange={(v) => onColumnsChange(parseInt(v))}
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
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {Object.entries(LISTING_STYLES).map(([key, style]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onListingStyleChange(key as ListingStyle)}
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
                    { key: 'showDescription', label: 'Show Description' },
                    ...(listingStyle === 'blog' ? [
                      { key: 'showAuthor', label: 'Show Author' },
                      { key: 'showDate', label: 'Show Date' },
                      { key: 'showReadMore', label: 'Show Read More' },
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
