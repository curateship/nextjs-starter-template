"use client"

import { useCallback, useMemo, useState } from "react"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"

interface CategoryCoreBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  // Title/featured image write through to the category row (directory core pattern)
  categoryTitle?: string
  categoryFeaturedImage?: string | null
  onCategoryTitleChange?: (title: string) => void
  onCategoryFeaturedImageChange?: (featuredImage: string) => void
}

// Per-category editor for the Core block: edits the category's title and
// featured image (existing row fields) plus a rich text introduction stored
// as a per-category block value (body/format, like directory-rich-text).
export function CategoryCoreBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  categoryTitle,
  categoryFeaturedImage,
  onCategoryTitleChange,
  onCategoryFeaturedImageChange,
}: CategoryCoreBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)
  const featuredImage = categoryFeaturedImage || ""

  // InlineRichTextEditor reads htmlContent; the block stores it as body
  const editorContent = useMemo(() => ({
    ...content,
    htmlContent: content.body || "",
  }), [content])

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange("body", htmlContent)
    if (!content.format) {
      onContentChange("format", "html")
    }
  }, [content.format, onContentChange])

  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Category Details</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="category-core-title">Title</FieldLabel>
            <Input
              id="category-core-title"
              value={categoryTitle || ""}
              onChange={(event) => onCategoryTitleChange?.(event.target.value)}
              placeholder="Category title"
              className="text-lg font-medium"
            />
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-medium">Featured Image</p>
            {featuredImage ? (
              <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                <img
                  src={featuredImage}
                  alt="Featured image preview"
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                <button
                  type="button"
                  onClick={() => onCategoryFeaturedImageChange?.("")}
                  className="absolute right-2 top-2 rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  <X className="h-4 w-4" />
                </button>
                <div
                  className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center text-white">
                    <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm font-medium">Click to change image</p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                onClick={() => setShowImagePicker(true)}
              >
                <div className="text-center">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                </div>
              </div>
            )}
            <MediaPicker
              open={showImagePicker}
              onOpenChange={setShowImagePicker}
              onSelectMedia={(mediaUrl) => {
                onCategoryFeaturedImageChange?.(mediaUrl)
                setShowImagePicker(false)
              }}
              currentMediaUrl={featuredImage}
              site_id={siteId}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Content</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <InlineRichTextEditor
            blockId={blockId}
            content={editorContent}
            onContentChange={handleBodyChange}
            siteId={siteId}
            isActive
            editorPadding={0}
            variant="directory"
          />
        </CardContent>
      </Card>
    </CardGroup>
  )
}
