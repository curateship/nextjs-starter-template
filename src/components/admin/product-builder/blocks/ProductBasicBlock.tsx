"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Upload, X } from "lucide-react"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"

interface BasicBlockProps {
  title: string
  description: string
  richText: string
  status: string
  featured: boolean
  image: File | null
  imagePreview: string | null
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onRichTextChange: (value: string) => void
  onStatusChange: (value: string) => void
  onFeaturedChange: (value: boolean) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function BasicBlock({
  title,
  description,
  richText,
  status,
  featured,
  image,
  imagePreview,
  onTitleChange,
  onDescriptionChange,
  onRichTextChange,
  onStatusChange,
  onFeaturedChange,
  onImageChange,
  onImagePreviewChange,
}: BasicBlockProps) {
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImageChange(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        onImagePreviewChange(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    onImageChange(null)
    onImagePreviewChange(null)
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Product Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter product title"
            required
          />
        </div>

        {/* Rich Text Editor */}
        <div className="space-y-2">
          <PageRichTextEditorBlock
            content={{
              content: richText || '',
              hideHeader: true,
              hideEditorHeader: true
            }}
            onContentChange={(content) => onRichTextChange(content.content)}
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
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

        {/* Featured Checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="featured"
            checked={featured}
            onCheckedChange={(checked) => onFeaturedChange(checked as boolean)}
          />
          <span className="text-sm">Featured Product</span>
        </div>

        {/* Product Image */}
        <div className="space-y-2">
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <label htmlFor="image-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF up to 10MB
                </span>
              </label>
              <Input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Product preview"
                className="w-full h-48 object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeImage}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 