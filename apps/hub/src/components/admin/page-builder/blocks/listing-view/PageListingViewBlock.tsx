import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface SharedListingViewsBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  mobileHeaderAlign?: 'left' | 'center'
  contentType?: 'products'
  displayMode?: 'grid' | 'list'
  itemsToShow?: number
  columns?: number
  sortBy?: 'date' | 'title' | 'display_order'
  sortOrder?: 'asc' | 'desc'
  showImage?: boolean
  showTitle?: boolean
  showDescription?: boolean
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
  onContentTypeChange: (value: 'products') => void
  onDisplayModeChange: (value: 'grid' | 'list') => void
  onItemsToShowChange: (value: number) => void
  onColumnsChange: (value: number) => void
  onSortByChange: (value: 'date' | 'title' | 'display_order') => void
  onSortOrderChange: (value: 'asc' | 'desc') => void
  onShowImageChange: (value: boolean) => void
  onShowTitleChange: (value: boolean) => void
  onShowDescriptionChange: (value: boolean) => void
  onIsPaginatedChange: (value: boolean) => void
  onItemsPerPageChange: (value: number) => void
  onViewAllTextChange: (value: string) => void
  onViewAllLinkChange: (value: string) => void
  onBack?: () => void
}

export function PageListingViewBlock({
  title = 'Latest Products',
  subtitle = 'Check out our products',
  headerAlign = 'left',
  mobileHeaderAlign = 'left',
  contentType = 'products',
  displayMode = 'grid',
  itemsToShow = 6,
  columns = 3,
  sortBy = 'date',
  sortOrder = 'desc',
  showImage = true,
  showTitle = true,
  showDescription = true,
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
  onDisplayModeChange,
  onItemsToShowChange,
  onColumnsChange,
  onSortByChange,
  onSortOrderChange,
  onShowImageChange,
  onShowTitleChange,
  onShowDescriptionChange,
  onIsPaginatedChange,
  onItemsPerPageChange,
  onViewAllTextChange,
  onViewAllLinkChange,
  onBack,
}: SharedListingViewsBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <div className="space-y-4">
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
              <Label htmlFor="viewAllText">View All Button Text</Label>
              <Input
                id="viewAllText"
                value={viewAllText}
                onChange={(e) => onViewAllTextChange(e.target.value)}
                placeholder="View all products"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="viewAllLink">View All Button Link</Label>
              <Input
                id="viewAllLink"
                value={viewAllLink}
                onChange={(e) => onViewAllLinkChange(e.target.value)}
                placeholder="/products"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Add text and link to display a &quot;View All&quot; button (only shown when not paginated)
            </p>
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

      <BlockEditorSection heading="Content Settings">
          <div className="flex flex-wrap gap-4">
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
      </BlockEditorSection>
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="space-y-4">
              <BlockEditorSection heading="Display Options">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showImage"
                      checked={showImage}
                      onCheckedChange={(checked) => onShowImageChange(!!checked)}
                    />
                    <Label htmlFor="showImage" className="cursor-pointer">Show Image</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showTitle"
                      checked={showTitle}
                      onCheckedChange={(checked) => onShowTitleChange(!!checked)}
                    />
                    <Label htmlFor="showTitle" className="cursor-pointer">Show Title</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showDescription"
                      checked={showDescription}
                      onCheckedChange={(checked) => onShowDescriptionChange(!!checked)}
                    />
                    <Label htmlFor="showDescription" className="cursor-pointer">Show Description</Label>
                  </div>

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

              {onVisibilityChange && (
                <>
                  <VisibilitySettings
                    title="Header Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    includeHideBlock={false}
                    fields={[
                      { key: 'title', label: 'Title' },
                      { key: 'subtitle', label: 'Subtitle' },
                    ]}
                  />
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    fields={[]}
                  />
                </>
              )}

            </div>
          ),
        },
      ]}
    />
  )
}
