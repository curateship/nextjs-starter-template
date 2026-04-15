import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { BlockEditorEmptyState, BlockEditorSection } from "@/components/admin/shared/BlockTabs"

interface ProductListingViewBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
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
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange: (value: 'left' | 'center') => void
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
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
  onBack?: () => void
}

export function ProductListingViewBlock({
  header = 'Latest Products',
  subheader = 'Check out our products',
  headerAlign = 'left',
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
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
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
            <div className="space-y-6">
        <BlockEditorSection heading="Header Settings">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] gap-4">
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

            <p className="text-sm text-muted-foreground">
              Add text and link to display a &quot;View All&quot; button (only shown when not paginated)
            </p>
        </BlockEditorSection>

        <BlockEditorSection heading="Content Settings">
            <div className="grid grid-cols-5 gap-4">
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

        <BlockEditorSection heading="Display Options">
            <div className="flex items-center justify-between">
              <Label htmlFor="showImage">Show Image</Label>
              <Switch
                id="showImage"
                checked={showImage}
                onCheckedChange={onShowImageChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showTitle">Show Title</Label>
              <Switch
                id="showTitle"
                checked={showTitle}
                onCheckedChange={onShowTitleChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showDescription">Show Description</Label>
              <Switch
                id="showDescription"
                checked={showDescription}
                onCheckedChange={onShowDescriptionChange}
              />
            </div>

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
                <Switch
                  id="isPaginated"
                  checked={isPaginated}
                  onCheckedChange={onIsPaginatedChange}
                />
              </div>
            </div>
        </BlockEditorSection>
            </div>
          ),
        },
        {
          value: "style",
          label: "Style",
          content: (
            <BlockEditorEmptyState>Style options coming soon.</BlockEditorEmptyState>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <>
              {onVisibilityChange && (
                <VisibilitySettings
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  fields={[
                    { key: 'header', label: 'Header' },
                    { key: 'subheader', label: 'Sub Header' },
                  ]}
                />
              )}
            </>
          ),
        },
      ]}
    />
  )
}
