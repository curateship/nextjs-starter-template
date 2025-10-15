"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ImageIcon } from "lucide-react"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"

interface TaxonomyDefaultBlockProps {
  title: string
  richText: string
  featuredImage: string
  status?: string
  onTitleChange?: (value: string) => void
  onRichTextChange?: (value: string) => void
  onFeaturedImageChange?: (value: string) => void
  onStatusChange?: (value: string) => void
  onOpenSettings?: () => void
}

export function TaxonomyDefaultBlock({
  title,
  richText,
  featuredImage,
  status = 'draft',
  onTitleChange,
  onRichTextChange,
  onFeaturedImageChange,
  onStatusChange,
  onOpenSettings
}: TaxonomyDefaultBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  const handleImageChange = (imageUrl: string) => {
    if (onFeaturedImageChange) {
      onFeaturedImageChange(imageUrl)
    }
    setShowImagePicker(false)
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Tag Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tag Title</label>
            <Input
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Enter tag title"
              required
            />
          </div>

          {/* Rich Text Editor */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tag Description</label>
            <PageRichTextEditorBlock
              content={{
                content: richText || '',
                hideHeader: true,
                hideEditorHeader: true
              }}
              onContentChange={(content) => onRichTextChange?.(content.content)}
              compact={true}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Featured Image */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Featured Image</label>
            <div className="relative">
              {featuredImage ? (
                <div
                  className="relative rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowImagePicker(true)}
                >
                  <img
                    src={featuredImage}
                    alt="Tag preview"
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                    <div className="text-white text-center">
                      <ImageIcon className="mx-auto h-6 w-6 mb-1" />
                      <p className="text-sm font-medium">Click to change</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Image Picker Modal */}
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={handleImageChange}
        currentMediaUrl={featuredImage}
        showVideos={false}
      />
    </div>
  )
}
