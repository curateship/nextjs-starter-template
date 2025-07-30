"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface ImageBlockProps {
  title: string
  image: File | null
  imagePreview: string | null
  onTitleChange: (value: string) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function ImageBlock({
  title,
  image,
  imagePreview,
  onTitleChange,
  onImageChange,
  onImagePreviewChange,
}: ImageBlockProps) {
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
        <CardTitle>Image Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Image Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter descriptive image title"
            required
          />
          <p className="text-xs text-muted-foreground">
            Use a descriptive title to help identify this image in the library
          </p>
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          <Label>Image File *</Label>
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
              <Label htmlFor="image-upload" className="cursor-pointer">
                <span className="text-lg text-muted-foreground font-medium">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-sm text-muted-foreground mt-2 block">
                  PNG, JPG, GIF, SVG, WebP up to 10MB
                </span>
                <span className="text-xs text-muted-foreground mt-1 block">
                  High-quality images recommended for best results
                </span>
              </Label>
              <Input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                required
              />
            </div>
          ) : (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Image preview"
                className="w-full max-h-96 object-contain rounded-lg border bg-muted/50"
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
              
              {/* Image Info */}
              {image && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <div className="grid grid-cols-2 gap-2">
                    <span><strong>File:</strong> {image.name}</span>
                    <span><strong>Size:</strong> {(image.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span><strong>Type:</strong> {image.type}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}