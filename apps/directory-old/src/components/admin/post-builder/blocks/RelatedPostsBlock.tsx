"use client"

import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

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
  return (
    <CardGroup className="grid">
      {activeTab === "content" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Header Settings</CardTitle>
            </CardHeader>
            <CardContent>
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
            <CardHeader>
              <CardTitle className="text-base">Content Settings</CardTitle>
            </CardHeader>
            <CardContent>
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
        <>
          <VisibilitySettings
            title="Element Visibility"
            visibility={content.visibility}
            onChange={(visibility) => onContentChange('visibility', visibility)}
            includeHideBlock={false}
            useCard
            fields={[
              { key: 'showImage', label: 'Show Image' },
              { key: 'showTitle', label: 'Show Title' },
              { key: 'showExcerpt', label: 'Show Excerpt' },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content Count</CardTitle>
            </CardHeader>
            <CardContent>
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
        </>
      )}
    </CardGroup>
  )
}
