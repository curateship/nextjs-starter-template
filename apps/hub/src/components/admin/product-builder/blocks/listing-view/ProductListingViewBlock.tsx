import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { Check } from "lucide-react"
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

interface ProductListingViewBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  contentType?: 'products'
  imageFit?: ImageFit
  displayMode?: 'grid' | 'list'
  itemsToShow?: number
  columns?: number
  sortBy?: 'date' | 'title' | 'display_order'
  sortOrder?: 'asc' | 'desc'
  isPaginated?: boolean
  itemsPerPage?: number
  viewAllText?: string
  viewAllLink?: string
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange: (value: 'left' | 'center') => void
  onContentTypeChange: (value: 'products') => void
  onImageFitChange: (value: ImageFit) => void
  onDisplayModeChange: (value: 'grid' | 'list') => void
  onItemsToShowChange: (value: number) => void
  onColumnsChange: (value: number) => void
  onSortByChange: (value: 'date' | 'title' | 'display_order') => void
  onSortOrderChange: (value: 'asc' | 'desc') => void
  onIsPaginatedChange: (value: boolean) => void
  onItemsPerPageChange: (value: number) => void
  onViewAllTextChange: (value: string) => void
  onViewAllLinkChange: (value: string) => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
  onBack?: () => void
}

export function ProductListingViewBlock({
  header = 'Latest Products',
  subheader = 'Check out our products',
  headerAlign = 'left',
  contentType = 'products',
  imageFit = 'crop',
  displayMode = 'grid',
  itemsToShow = 6,
  columns = 3,
  sortBy = 'date',
  sortOrder = 'desc',
  isPaginated = false,
  itemsPerPage = 12,
  viewAllText = '',
  viewAllLink = '',
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onContentTypeChange,
  onImageFitChange,
  onDisplayModeChange,
  onItemsToShowChange,
  onColumnsChange,
  onSortByChange,
  onSortOrderChange,
  onIsPaginatedChange,
  onItemsPerPageChange,
  onViewAllTextChange,
  onViewAllLinkChange,
  visibility,
  onVisibilityChange,
  onBack,
}: ProductListingViewBlockProps) {
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
                <CardHeader>
                  <DashboardModalCardTitle>Header Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                    <div className="space-y-2">
                      <Label htmlFor="title">Header</Label>
                      <Input
                        id="title"
                        value={header}
                        onChange={(e) => onHeaderChange(e.target.value)}
                        placeholder="Enter block title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subtitle">Sub Header</Label>
                      <Input
                        id="subtitle"
                        value={subheader}
                        onChange={(e) => onSubheaderChange(e.target.value)}
                        placeholder="Enter block subtitle"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="headerAlign">Header Alignment</Label>
                      <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                        <SelectTrigger id="headerAlign" size="button">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Content Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="space-y-2">
                      <Label htmlFor="contentType">Content Type</Label>
                      <Select value={contentType} onValueChange={onContentTypeChange}>
                        <SelectTrigger id="contentType" size="button">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="products">Products</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                </CardContent>
              </Card>

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Element Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'showImage', label: 'Show Image' },
                    { key: 'showTitle', label: 'Show Title' },
                    { key: 'showDescription', label: 'Show Description' },
                  ]}
                />
              )}

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Pagination</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="isPaginated">Enable Pagination</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {isPaginated ? 'Enter items per page' : 'Items to show'}
                      </span>
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
                      <Switch id="isPaginated" checked={isPaginated} onCheckedChange={onIsPaginatedChange} />
                    </div>
                  </div>
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
                <CardHeader>
                  <DashboardModalCardTitle>Image Display</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
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
              {onVisibilityChange && (
                <VisibilitySettings
                  title="Header Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'header', label: 'Header' },
                    { key: 'subheader', label: 'Sub Header' },
                    { key: 'viewAllButton', label: 'Show Header Button' },
                  ]}
                />
              )}
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
