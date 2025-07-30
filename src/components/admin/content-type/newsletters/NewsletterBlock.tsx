"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Upload, X } from "lucide-react"

interface NewsletterBlockProps {
  title: string
  body: string
  status: string
  image: File | null
  imagePreview: string | null
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onStatusChange: (value: string) => void
  onImageChange: (file: File | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export function NewsletterBlock({
  title,
  body,
  status,
  image,
  imagePreview,
  onTitleChange,
  onBodyChange,
  onStatusChange,
  onImageChange,
  onImagePreviewChange,
}: NewsletterBlockProps) {
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
        <CardTitle>Newsletter Content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Newsletter Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter newsletter title"
            required
          />
        </div>

        {/* Body with Rich Editor */}
        <div className="space-y-2">
          <Label htmlFor="body">Newsletter Body</Label>
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
                <Separator orientation="vertical" className="h-6" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  📝
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                  🤖
                </Button>
              </div>
            </div>
            <textarea
              id="body"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder="Enter newsletter content... This will be enhanced with AI generation capabilities."
              className="w-full p-3 min-h-[300px] resize-none border-0 focus:outline-none focus:ring-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Future enhancement: AI-powered content generation using Perplexity, ChatGPT, and other AI services
          </p>
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
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Newsletter Image */}
        <div className="space-y-2">
          <Label>Newsletter Image</Label>
          {!imagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <Label htmlFor="image-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF up to 10MB (recommended for newsletter header)
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
                alt="Newsletter image preview"
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