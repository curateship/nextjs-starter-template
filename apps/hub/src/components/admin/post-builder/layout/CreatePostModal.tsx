"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { CategoryPicker } from "@/components/admin/shared/CategoryPicker"
import {
  AdminModalBody,
  AdminModalFooter,
} from "@/components/admin/shared/AdminModalLayout"
import { ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Post } from "@/lib/actions/posts/post-actions"

interface CreatePostData {
  title: string
  slug: string
  meta_description: string
  featured_image: string
  excerpt: string
  content: string
  is_published: boolean
}

interface CreatePostModalProps {
  onSuccess: (post: Post, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreatePostModal({ onSuccess, onCancel }: CreatePostModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [formData, setFormData] = useState<CreatePostData>({
    title: "",
    slug: "",
    meta_description: "",
    featured_image: "",
    excerpt: "",
    content: "",
    is_published: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [showFeaturedImage, setShowFeaturedImage] = useState(true)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : generateSlug(title),
    }))
  }

  const handleSlugChange = (slug: string) => {
    if (slug === "") {
      setSlugManuallyEdited(false)
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.title || "") }))
      return
    }

    setSlugManuallyEdited(true)
    setFormData((prev) => ({ ...prev, slug }))
  }

  useEffect(() => {
    const checkSlugConflict = async () => {
      const slug = formData.slug?.trim()
      if (!slug || slug.length < 2 || !currentSite?.id) {
        setSlugWarning(null)
        return
      }

      // Skip client-side slug checking - server will handle validation
    }

    const timeoutId = setTimeout(checkSlugConflict, 500)
    return () => clearTimeout(timeoutId)
  }, [formData.slug, currentSite?.id])

  const handleImageChange = async (newImageUrl: string) => {
    setFormData((prev) => ({ ...prev, featured_image: newImageUrl }))
  }

  const handleRemoveImage = async () => {
    setFormData((prev) => ({ ...prev, featured_image: "" }))
  }

  const handleSave = async (continueToBuilder = false) => {
    if (!formData.title.trim()) {
      setError("Post title is required")
      return
    }

    if (!currentSite?.id) {
      setError("No site selected")
      return
    }

    try {
      setLoading(true)
      setError(null)

      const draftData = {
        title: formData.title,
        slug: formData.slug,
        site_id: currentSite.id,
        meta_description: formData.meta_description,
        featured_image: formData.featured_image || null,
        excerpt: formData.excerpt || null,
        is_published: false,
        content_blocks: {
          show_featured_image: showFeaturedImage,
        },
      }

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create post")
        return
      }

      if (result.data) {
        if (selectedCategoryIds.length > 0) {
          bulkAssignCategoriesToContentAction(result.data.id, "post", selectedCategoryIds).catch(() => {})
        }
        onSuccess(result.data, continueToBuilder)
      }
    } catch (err) {
      setError("Failed to save post")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="title">Post Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Enter post title"
              required
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="slug">Post URL</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="post-url-slug"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {slugManuallyEdited
                ? "Custom URL slug. Clear this field to auto-generate from title again."
                : "Auto-generated from title. You can edit this to customize the URL."}
            </p>
            {formData.slug && (
              <p className="mt-1 text-xs text-blue-600">
                Post URL: <strong>/posts/{formData.slug}</strong>
              </p>
            )}
            {checkingSlug && (
              <p className="mt-1 text-xs text-blue-600">
                Checking slug availability...
              </p>
            )}
            {slugWarning && (
              <p className="mt-1 text-xs text-amber-600">
                {slugWarning}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="featured_image">Featured Image</Label>
          <div className="mt-2">
            {formData.featured_image ? (
              <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                <img
                  src={formData.featured_image}
                  alt="Featured image preview"
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
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
                className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                onClick={() => setShowImagePicker(true)}
              >
                <div className="text-center">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional featured image for this post
          </p>

          {formData.featured_image && (
            <div className="mt-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show_featured_image">Show featured image on post page</Label>
                <p className="text-xs text-muted-foreground">
                  Control whether the featured image appears at the top of the post page
                </p>
              </div>
              <Switch
                id="show_featured_image"
                checked={showFeaturedImage}
                onCheckedChange={setShowFeaturedImage}
              />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="excerpt">Post Excerpt</Label>
          <Textarea
            id="excerpt"
            value={formData.excerpt}
            onChange={(e) => setFormData((prev) => ({ ...prev, excerpt: e.target.value }))}
            placeholder="A brief summary of your post content"
            className="min-h-[40px] resize-none overflow-hidden"
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = "auto"
              target.style.height = `${target.scrollHeight}px`
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Brief summary shown in post listings and previews
          </p>
        </div>

        {currentSite?.id && (
          <div>
            <Label>Categories</Label>
            <CategoryPicker
              siteId={currentSite.id}
              selectedCategoryIds={selectedCategoryIds}
              onSelectionChange={setSelectedCategoryIds}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Assign this post to one or more categories
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="content">Post Content</Label>
          <RichTextEditor
            content={{
              content: formData.content || "",
              hideHeader: true,
              hideEditorHeader: true,
            }}
            onContentChange={(content) => setFormData((prev) => ({ ...prev, content: content.content }))}
            compact={true}
            inline={true}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Rich text content for the post body
          </p>
        </div>

        <div>
          <Label htmlFor="meta_description">Meta Description</Label>
          <Textarea
            id="meta_description"
            value={formData.meta_description}
            onChange={(e) => setFormData((prev) => ({ ...prev, meta_description: e.target.value }))}
            placeholder="A brief description of this post for search engines"
            className="min-h-[40px] resize-none overflow-hidden"
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = "auto"
              target.style.height = `${target.scrollHeight}px`
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Recommended length: 150-160 characters
          </p>
        </div>
      </AdminModalBody>

      <AdminModalFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center space-x-2">
          <Button type="submit" variant="outline" disabled={loading}>
            {loading ? "Saving..." : "Save as Draft"}
          </Button>
          <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
            {loading ? "Saving..." : "Continue"}
          </Button>
        </div>
      </AdminModalFooter>

      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(imageUrl) => {
          handleImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={formData.featured_image || ""}
      />
    </form>
  )
}
