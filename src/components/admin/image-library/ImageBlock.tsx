"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface ImageBlockProps {
  altText: string
  image: File | null
  imagePreview: string | null
  onAltTextChange: (value: string) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function ImageBlock({
  altText,
  image,
  imagePreview,
  onAltTextChange,
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
        {/* Alt Text */}
        <div className="space-y-2">
          <Input
            id="altText"
            value={altText}
            onChange={(e) => onAltTextChange(e.target.value)}
            placeholder="Describe this image for accessibility (optional)"
          />
          <p className="text-xs text-muted-foreground">
            Alt text helps screen readers understand the image content and improves SEO
          </p>
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
              <label htmlFor="image-upload" className="cursor-pointer">
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
              </label>
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
                className="w-full max-h-96 object-contain rounded-lg border bg-muted"
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
                    <span><strong>File:</strong> {image.name.replace(/[<>"'&]/g, '')}</span>
                    <span><strong>Size:</strong> {(image.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span><strong>Type:</strong> {image.type.replace(/[<>"'&]/g, '')}</span>
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