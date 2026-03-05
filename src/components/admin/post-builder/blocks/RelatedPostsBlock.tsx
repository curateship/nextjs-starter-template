import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

interface RelatedPostsBlockProps {
  title?: string
  subtitle?: string
  displayMode?: 'grid' | 'list'
  columns?: number
  itemsToShow?: number
  sortBy?: 'date' | 'title'
  sortOrder?: 'asc' | 'desc'
  showImage?: boolean
  showTitle?: boolean
  showExcerpt?: boolean
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onDisplayModeChange: (value: 'grid' | 'list') => void
  onColumnsChange: (value: number) => void
  onItemsToShowChange: (value: number) => void
  onSortByChange: (value: 'date' | 'title') => void
  onSortOrderChange: (value: 'asc' | 'desc') => void
  onShowImageChange: (value: boolean) => void
  onShowTitleChange: (value: boolean) => void
  onShowExcerptChange: (value: boolean) => void
}

export function RelatedPostsBlock({
  title = 'Related Posts',
  subtitle = '',
  displayMode = 'grid',
  columns = 3,
  itemsToShow = 3,
  sortBy = 'date',
  sortOrder = 'desc',
  showImage = true,
  showTitle = true,
  showExcerpt = true,
  onTitleChange,
  onSubtitleChange,
  onDisplayModeChange,
  onColumnsChange,
  onItemsToShowChange,
  onSortByChange,
  onSortOrderChange,
  onShowImageChange,
  onShowTitleChange,
  onShowExcerptChange,
}: RelatedPostsBlockProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rp-title">Title</Label>
              <Input
                id="rp-title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Related Posts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-subtitle">Subtitle</Label>
              <Input
                id="rp-subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange(e.target.value)}
                placeholder="Enter subtitle"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rp-displayMode">Display Mode</Label>
              <Select value={displayMode} onValueChange={onDisplayModeChange}>
                <SelectTrigger id="rp-displayMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rp-columns">Columns</Label>
              <Select
                value={displayMode === 'grid' ? columns.toString() : 'disabled'}
                onValueChange={(v) => onColumnsChange(parseInt(v))}
                disabled={displayMode === 'list'}
              >
                <SelectTrigger id="rp-columns">
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
              <Label htmlFor="rp-sortBy">Sort By</Label>
              <Select value={sortBy} onValueChange={onSortByChange}>
                <SelectTrigger id="rp-sortBy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rp-sortOrder">Sort Order</Label>
              <Select value={sortOrder} onValueChange={onSortOrderChange}>
                <SelectTrigger id="rp-sortOrder">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="rp-showImage">Show Image</Label>
            <Switch
              id="rp-showImage"
              checked={showImage}
              onCheckedChange={onShowImageChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rp-showTitle">Show Title</Label>
            <Switch
              id="rp-showTitle"
              checked={showTitle}
              onCheckedChange={onShowTitleChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rp-showExcerpt">Show Excerpt</Label>
            <Switch
              id="rp-showExcerpt"
              checked={showExcerpt}
              onCheckedChange={onShowExcerptChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rp-itemsToShow">Items to Show</Label>
            <Input
              id="rp-itemsToShow"
              type="number"
              min="1"
              max="12"
              value={itemsToShow}
              onChange={(e) => onItemsToShowChange(parseInt(e.target.value) || 3)}
              className="w-20"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
