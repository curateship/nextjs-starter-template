"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface HeroBlockProps {
  heading: string
  subHeading: string
  image: File | null
  imagePreview: string | null
  onHeadingChange: (value: string) => void
  onSubHeadingChange: (value: string) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function HeroBlock({
  heading,
  subHeading,
  image,
  imagePreview,
  onHeadingChange,
  onSubHeadingChange,
  onImageChange,
  onImagePreviewChange,
}: HeroBlockProps) {
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
        <CardTitle>Hero Section</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Heading */}
        <div className="space-y-2">
          <Label htmlFor="heading">Heading *</Label>
          <Input
            id="heading"
            value={heading}
            onChange={(e) => onHeadingChange(e.target.value)}
            placeholder="Enter hero heading"
            required
          />
        </div>

        {/* Sub-heading */}
        <div className="space-y-2">
          <Label htmlFor="subHeading">Sub-heading</Label>
          <Input
            id="subHeading"
            value={subHeading}
            onChange={(e) => onSubHeadingChange(e.target.value)}
            placeholder="Enter hero sub-heading"
          />
        </div>

        {/* Hero Image */}
        <div className="space-y-2">
          <Label>Hero Image</Label>
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <Label htmlFor="hero-image-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF up to 10MB
                </span>
              </Label>
              <Input
                id="hero-image-upload"
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
                alt="Hero preview"
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