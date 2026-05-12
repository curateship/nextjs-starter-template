"use client"

import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export type RelatedPostsBlockTab = "content" | "styling" | "settings"

interface RelatedPostsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  activeTab?: RelatedPostsBlockTab
}

export function RelatedPostsBlock({
  content,
  onContentChange,
  activeTab = "content",
}: RelatedPostsBlockProps) {
  const title = content.title ?? 'Related Posts'
  const subtitle = content.subtitle ?? ''
  const displayMode = content.displayMode ?? 'grid'
  const columns = content.columns ?? 3
  const itemsToShow = content.itemsToShow ?? 3
  const sortBy = content.sortBy ?? 'date'
  const sortOrder = content.sortOrder ?? 'desc'
  const showImage = content.showImage ?? true
  const showTitle = content.showTitle ?? true
  const showExcerpt = content.showExcerpt ?? true

  return (
    <CardGroup className="grid">
      {activeTab === "content" && (
        <>
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">Header Settings</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rp-title">Title</Label>
                <Input
                  id="rp-title"
                  value={title}
                  onChange={(e) => onContentChange('title', e.target.value)}
                  placeholder="Related Posts"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp-subtitle">Subtitle</Label>
                <Input
                  id="rp-subtitle"
                  value={subtitle}
                  onChange={(e) => onContentChange('subtitle', e.target.value)}
                  placeholder="Enter subtitle"
                />
              </div>
            </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">Content Settings</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-2">
                <Label htmlFor="rp-displayMode">Mode</Label>
                <Select value={displayMode} onValueChange={(v) => onContentChange('displayMode', v)}>
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
                  onValueChange={(v) => onContentChange('columns', parseInt(v))}
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
                <Select value={sortBy} onValueChange={(v) => onContentChange('sortBy', v)}>
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
                <Select value={sortOrder} onValueChange={(v) => onContentChange('sortOrder', v)}>
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
        </>
      )}

      {activeTab === "styling" && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No styling options available for this block.
          </CardContent>
        </Card>
      )}

      {activeTab === "settings" && (
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">Display Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
          <div className="flex items-center gap-3">
            <Label htmlFor="rp-showImage">Show Image</Label>
            <Switch
              id="rp-showImage"
              checked={showImage}
              onCheckedChange={(v) => onContentChange('showImage', v)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="rp-showTitle">Show Title</Label>
            <Switch
              id="rp-showTitle"
              checked={showTitle}
              onCheckedChange={(v) => onContentChange('showTitle', v)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="rp-showExcerpt">Show Excerpt</Label>
            <Switch
              id="rp-showExcerpt"
              checked={showExcerpt}
              onCheckedChange={(v) => onContentChange('showExcerpt', v)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="rp-itemsToShow">Items to Show</Label>
            <Input
              id="rp-itemsToShow"
              type="number"
              min="1"
              max="12"
              value={itemsToShow}
              onChange={(e) => onContentChange('itemsToShow', parseInt(e.target.value) || 3)}
              className="w-20"
            />
          </div>
          </CardContent>
        </Card>
      )}
    </CardGroup>
  )
}
