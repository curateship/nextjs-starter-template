"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Upload, X } from "lucide-react"

interface PostBlockProps {
  title: string
  summary: string
  content: string
  slug: string
  metaDescription: string
  tags: string
  publishDate: string
  status: string
  featuredImage: File | null
  featuredImagePreview: string | null
  onTitleChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onContentChange: (value: string) => void
  onSlugChange: (value: string) => void
  onMetaDescriptionChange: (value: string) => void
  onTagsChange: (value: string) => void
  onPublishDateChange: (value: string) => void
  onStatusChange: (value: string) => void
  onFeaturedImageChange: (file: File | null) => void
  onFeaturedImagePreviewChange: (preview: string | null) => void
}

export function PostBlock({
  title,
  summary,
  content,
  slug,
  metaDescription,
  tags,
  publishDate,
  status,
  featuredImage,
  featuredImagePreview,
  onTitleChange,
  onSummaryChange,
  onContentChange,
  onSlugChange,
  onMetaDescriptionChange,
  onTagsChange,
  onPublishDateChange,
  onStatusChange,
  onFeaturedImageChange,
  onFeaturedImagePreviewChange,
}: PostBlockProps) {
  const handleFeaturedImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFeaturedImageChange(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        onFeaturedImagePreviewChange(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeFeaturedImage = () => {
    onFeaturedImageChange(null)
    onFeaturedImagePreviewChange(null)
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Post Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Post Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter post title"
            className="text-lg"
            required
          />
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <Label htmlFor="summary">Summary</Label>
          <textarea
            id="summary"
            value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            placeholder="Brief description of the post..."
            className="w-full min-h-[80px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
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
                  🔗
                </Button>
              </div>
            </div>
            <textarea
              id="content"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              placeholder="Write your post content here..."
              className="w-full p-3 min-h-[300px] resize-none border-0 focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        {/* Featured Image */}
        <div className="space-y-2">
          <Label>Featured Image</Label>
          {!featuredImagePreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <Label htmlFor="featured-image-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF up to 10MB (recommended: 1200x630px)
                </span>
              </Label>
              <Input
                id="featured-image-upload"
                type="file"
                accept="image/*"
                onChange={handleFeaturedImageUpload}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative">
              <img
                src={featuredImagePreview}
                alt="Featured image preview"
                className="w-full h-48 object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeFeaturedImage}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* SEO & Meta */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">SEO & Meta</h3>
          
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="url-friendly-slug"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meta-description">Meta Description</Label>
            <textarea
              id="meta-description"
              value={metaDescription}
              onChange={(e) => onMetaDescriptionChange(e.target.value)}
              placeholder="SEO description for search engines..."
              className="w-full min-h-[60px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder="react, typescript, tutorial (comma separated)"
            />
          </div>
        </div>

        {/* Publishing Options */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Publishing Options</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="publish-date">Publish Date</Label>
              <Input
                id="publish-date"
                type="datetime-local"
                value={publishDate}
                onChange={(e) => onPublishDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={onStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 