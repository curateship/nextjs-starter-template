"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ImageIcon } from "lucide-react"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"

interface ProductDefaultBlockProps {
  title: string
  richText: string
  featuredImage: string
  status?: string
  downloadButtonText?: string
  downloadButtonStyle?: string
  downloadButtonUrl?: string
  onTitleChange?: (value: string) => void
  onRichTextChange?: (value: string) => void
  onFeaturedImageChange?: (value: string) => void
  onStatusChange?: (value: string) => void
  onDownloadButtonTextChange?: (value: string) => void
  onDownloadButtonStyleChange?: (value: string) => void
  onDownloadButtonUrlChange?: (value: string) => void
  onOpenSettings?: () => void
}

export function ProductDefaultBlock({
  title,
  richText,
  featuredImage,
  status = 'draft',
  downloadButtonText = '',
  downloadButtonStyle = 'black',
  downloadButtonUrl = '',
  onTitleChange,
  onRichTextChange,
  onFeaturedImageChange,
  onStatusChange,
  onDownloadButtonTextChange,
  onDownloadButtonStyleChange,
  onDownloadButtonUrlChange,
  onOpenSettings
}: ProductDefaultBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  const handleImageChange = (imageUrl: string) => {
    if (onFeaturedImageChange) {
      onFeaturedImageChange(imageUrl)
    }
    setShowImagePicker(false)
  }

  return (
    <div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Product Title</label>
            <Input
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Enter product title"
              required
            />
          </div>

          {/* Rich Text Editor */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Product Description</label>
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
        </CardContent>
      </Card>

      {/* Image and Download Button Row */}
      <div className="grid grid-cols-5 gap-4">
        {/* Featured Image Card - 40% width */}
        <Card className="shadow-sm col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Featured Image</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {featuredImage ? (
                <div 
                  className="relative rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowImagePicker(true)}
                >
                  <img 
                    src={featuredImage} 
                    alt="Product preview" 
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                    <div className="text-white text-center">
                      <ImageIcon className="mx-auto h-5 w-5 mb-1" />
                      <p className="text-xs font-medium">Click to change</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-5 w-5 text-muted-foreground/50" />
                    <p className="mt-1 text-xs text-muted-foreground">Click to select</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Download Button Card - 60% width */}
        <Card className="shadow-sm col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Download Button</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {/* Button Text */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Button Text</label>
                <Input
                  value={downloadButtonText}
                  onChange={(e) => onDownloadButtonTextChange?.(e.target.value)}
                  placeholder="e.g., Download Product"
                  className="text-sm"
                />
              </div>

              {/* Button Style */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Button Style</label>
                <Select value={downloadButtonStyle} onValueChange={onDownloadButtonStyleChange}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="black">Black (Solid)</SelectItem>
                    <SelectItem value="default">Default (Theme)</SelectItem>
                    <SelectItem value="secondary">Secondary (Gray)</SelectItem>
                    <SelectItem value="outline">Outline</SelectItem>
                    <SelectItem value="ghost">Ghost (Transparent)</SelectItem>
                    <SelectItem value="destructive">Destructive (Red)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Button URL */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Download URL</label>
                <Input
                  value={downloadButtonUrl}
                  onChange={(e) => onDownloadButtonUrlChange?.(e.target.value)}
                  placeholder="https://example.com/download"
                  type="url"
                  className="text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
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