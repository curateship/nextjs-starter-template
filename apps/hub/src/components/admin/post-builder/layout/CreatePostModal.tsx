"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Field, FieldLabel } from "@/components/ui/field"
import { ChevronDown, ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getPostTemplatesBySite } from "@/lib/actions/posts/post-template-actions"
import { parsePostBlocksFromJson, postBlocksToJson } from "@/components/admin/post-builder/config/post-block-utils"
import { generateSlug } from "@/lib/utils/slug"
import type { Post } from "@/lib/actions/posts/post-actions"
import type { PostTemplate } from "@/lib/actions/posts/post-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreatePostData {
  title: string
  slug: string
  meta_description: string
  featured_image: string
  excerpt: string
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
    is_published: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [templates, setTemplates] = useState<PostTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('blank')

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

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentSite?.id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getPostTemplatesBySite(currentSite.id)

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find((template) => template.is_default)
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : 'blank')
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

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

      const selectedTemplate = selectedTemplateId !== 'blank'
        ? templates.find((template) => template.id === selectedTemplateId)
        : null
      const templateContentBlocks = selectedTemplate?.content_blocks && typeof selectedTemplate.content_blocks === 'object'
        ? JSON.parse(JSON.stringify(selectedTemplate.content_blocks))
        : {}
      const sanitizedTemplateContentBlocks = selectedTemplate
        ? postBlocksToJson(parsePostBlocksFromJson(templateContentBlocks), templateContentBlocks)
        : {}
      const contentBlocks = selectedTemplate ? sanitizedTemplateContentBlocks : {}

      const draftData = {
        title: formData.title,
        slug: formData.slug,
        site_id: currentSite.id,
        meta_description: formData.meta_description,
        featured_image: formData.featured_image || null,
        excerpt: formData.excerpt || null,
        is_published: false,
        content_blocks: contentBlocks,
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
          const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, "post", selectedCategoryIds, primaryCategoryId)
          if (!categoryResult.success) {
            setError(categoryResult.error || "Failed to save categories")
            return
          }
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
    <DashboardModalContent
      title="Create New Post"
      footerClassName="sm:justify-between"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex items-center space-x-2">
            <Button type="submit" form="create-post-form" variant="outline" disabled={loading}>
              {loading ? "Saving..." : "Save as Draft"}
            </Button>
            <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
              {loading ? "Saving..." : "Continue"}
            </Button>
          </div>
        </>
      )}
    >
      <form
        id="create-post-form"
        onSubmit={handleSubmit}
        className="contents [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2"
      >
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-800">{error}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="p-4 pb-3">
            <DashboardModalCardTitle>Post details</DashboardModalCardTitle>
            <CardDescription>Name the post, set its URL, image, and summary.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6 p-4 pt-0">
            <div className="col-span-2">
              <Label htmlFor="template">Start from Template</Label>
              {templatesLoading ? (
                <div className="border-input mt-2 inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                  <Skeleton className="h-4 w-24 rounded-sm" />
                  <ChevronDown className="size-4 opacity-50" />
                </div>
              ) : (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger id="template">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent className="z-60">
                    <SelectItem value="blank">Blank</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
              {slugManuallyEdited ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Custom URL slug. Clear this field to auto-generate from title again.
                </p>
              ) : null}
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

            <div className="col-span-2">
              <Label htmlFor="featured_image">Featured Image</Label>
              <div className="mt-2">
                {formData.featured_image ? (
                  <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                    <img
                      src={formData.featured_image}
                      alt="Featured image preview"
                      className="h-full w-full object-contain"
                    />
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
            </div>

            <div className="col-span-2">
              <Label htmlFor="excerpt">Post Excerpt</Label>
              <Textarea
                id="excerpt"
                value={formData.excerpt}
                onChange={(e) => setFormData((prev) => ({ ...prev, excerpt: e.target.value }))}
                placeholder="A brief summary of your post"
                rows={1}
                className="h-10 min-h-10 resize-none overflow-hidden"
              />
            </div>
          </CardContent>
        </Card>

        {currentSite?.id && (
          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Categories</DashboardModalCardTitle>
              <CardDescription>Organize this post by topic.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Field>
                <FieldLabel>Categories</FieldLabel>
                <CategoryPicker
                  siteId={currentSite.id}
                  selectedCategoryIds={selectedCategoryIds}
                  onSelectionChange={setSelectedCategoryIds}
                  primaryCategoryId={primaryCategoryId}
                  onPrimaryCategoryChange={setPrimaryCategoryId}
                  variant="combobox"
                />
              </Field>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="p-4 pb-3">
            <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
            <CardDescription>Set the search description for this post.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Label htmlFor="meta_description">Meta Description</Label>
            <Textarea
              id="meta_description"
              value={formData.meta_description}
              onChange={(e) => setFormData((prev) => ({ ...prev, meta_description: e.target.value }))}
              placeholder="A brief description of this post for search engines"
              rows={1}
              className="h-10 min-h-10 resize-none overflow-hidden"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Recommended length: 150-160 characters
            </p>
          </CardContent>
        </Card>
      </form>

      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(imageUrl) => {
          handleImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={formData.featured_image || ""}
      />
    </DashboardModalContent>
  )
}
