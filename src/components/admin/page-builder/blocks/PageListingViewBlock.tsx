import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft, Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { VisibilitySettings } from "./shared/VisibilitySettings"

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
  const [activeTab, setActiveTab] = useState('content')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted"
          >
            <ArrowLeft className="w-3.5 h-4 mr-1.5" />
            Back
          </button>
        )}
        <TabsList className="gap-1">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="space-y-2">
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
          </div>

          <div className="flex gap-6">
            <div className="space-y-2">
              <Label>Header Alignment</Label>
              <div className="flex gap-2">
                {(['left', 'center'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onHeaderAlignChange(option)}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      headerAlign === option
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      headerAlign === option
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}>
                      {headerAlign === option && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="capitalize">{option}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mobile Header Alignment</Label>
              <div className="flex gap-2">
                {(['left', 'center'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onMobileHeaderAlignChange(option)}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      mobileHeaderAlign === option
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      mobileHeaderAlign === option
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}>
                      {mobileHeaderAlign === option && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="capitalize">{option}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type</Label>
              <Select value={contentType} onValueChange={onContentTypeChange}>
                <SelectTrigger id="contentType">
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
                <SelectTrigger id="displayMode">
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
                <SelectTrigger id="columns">
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
                <SelectTrigger id="sortBy">
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
                <SelectTrigger id="sortOrder">
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
        </div>
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Display Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {onVisibilityChange && (
            <VisibilitySettings
              visibility={visibility}
              onChange={onVisibilityChange}
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'subtitle', label: 'Subtitle' },
              ]}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}