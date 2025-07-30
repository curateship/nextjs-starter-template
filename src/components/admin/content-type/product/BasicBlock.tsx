"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Upload, X } from "lucide-react"

interface BasicBlockProps {
  title: string
  description: string
  status: string
  featured: boolean
  image: File | null
  imagePreview: string | null
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onStatusChange: (value: string) => void
  onFeaturedChange: (value: boolean) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function BasicBlock({
  title,
  description,
  status,
  featured,
  image,
  imagePreview,
  onTitleChange,
  onDescriptionChange,
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
    <Card>
      <CardHeader>
        <CardTitle>Product Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Product Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter product title"
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <div className="border rounded-md">
            <div className="p-3 border-b bg-muted/50">
              <div className="flex space-x-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  <strong>B</strong>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  <em>I</em>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  <u>U</u>
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  H1
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  H2
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  H3
                </Button>
              </div>
            </div>
            <textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Enter product description..."
              className="w-full p-3 min-h-[200px] resize-none border-0 focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
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
          <Label htmlFor="featured">Featured Product</Label>
        </div>

        {/* Product Image */}
        <div className="space-y-2">
          <Label>Product Image</Label>
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <Label htmlFor="image-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF up to 10MB
                </span>
              </Label>
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