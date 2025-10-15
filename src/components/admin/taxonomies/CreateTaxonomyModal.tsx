"use client"

import { useState } from "react"
import { createTaxonomyAction, type Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"
import type { TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { ImageIcon, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"

interface CreateTaxonomyModalProps {
  siteId: string
  taxonomyType: TaxonomyType
  existingTaxonomies: Taxonomy[]
  onClose: () => void
  onCreated: (taxonomy: Taxonomy) => void
}

export function CreateTaxonomyModal({
  siteId,
  taxonomyType,
  existingTaxonomies,
  onClose,
  onCreated
}: CreateTaxonomyModalProps) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [richTextContent, setRichTextContent] = useState("")
  const [parentId, setParentId] = useState<string>("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    // Auto-generate slug if user hasn't manually edited it
    if (!slugManuallyEdited) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    if (value === '') {
      setSlugManuallyEdited(false)
      setSlug(generateSlug(title))
    } else {
      setSlugManuallyEdited(true)
      setSlug(value)
    }
  }

  // Build hierarchical path for a taxonomy
  const buildTaxonomyPath = (taxonomy: Taxonomy): string => {
    const path: string[] = []
    let current: Taxonomy | undefined = taxonomy

    while (current) {
      path.unshift(current.title)
      current = existingTaxonomies.find(t => t.id === current?.parent_id)
    }

    return path.join(' > ')
  }

  // Build hierarchical options for parent select
  const buildParentOptions = (): ComboboxOption[] => {
    const options: ComboboxOption[] = []

    const addTaxonomy = (taxonomy: Taxonomy, ancestors: Taxonomy[] = []) => {
      const path = ancestors.length > 0
        ? ancestors.reverse().map(a => a.title).join(' > ')
        : undefined

      options.push({
        value: taxonomy.id,
        label: taxonomy.title,
        path
      })

      // Find children and add them recursively
      const children = existingTaxonomies.filter(t => t.parent_id === taxonomy.id)
      children.forEach(child => addTaxonomy(child, [...ancestors, taxonomy]))
    }

    // Add top-level taxonomies first
    const topLevel = existingTaxonomies.filter(t => !t.parent_id)
    topLevel.forEach(taxonomy => addTaxonomy(taxonomy))

    return options
  }

  // Handle saving as draft
  const handleSaveDraft = async () => {
    if (!title.trim()) {
      setError('Term title is required')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const contentBlocks = {
        _settings: {
          is_private: isPrivate
        }
      }

      const { data, error: createError } = await createTaxonomyAction(
        siteId,
        taxonomyType.id,
        {
          title,
          slug,
          description: richTextContent || undefined,
          parent_id: parentId || null,
          featured_image: featuredImage || null,
          content_blocks: contentBlocks,
          is_published: false
        }
      )

      if (createError) {
        setError(createError)
        setIsSubmitting(false)
        return
      }

      if (data) {
        onCreated(data)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create taxonomy')
      setIsSubmitting(false)
    }
  }

  // Handle publishing immediately
  const handlePublish = async () => {
    if (!title.trim()) {
      setError('Term title is required')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const contentBlocks = {
        _settings: {
          is_private: isPrivate
        }
      }

      const { data, error: createError } = await createTaxonomyAction(
        siteId,
        taxonomyType.id,
        {
          title,
          slug,
          description: richTextContent || undefined,
          parent_id: parentId || null,
          featured_image: featuredImage || null,
          content_blocks: contentBlocks,
          is_published: true
        }
      )

      if (createError) {
        setError(createError)
        setIsSubmitting(false)
        return
      }

      if (data) {
        onCreated(data)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create taxonomy')
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  const parentOptions = buildParentOptions()

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>Create {taxonomyType.name} Term</DialogTitle>
          <DialogDescription>
            Add a new term to the {taxonomyType.name} taxonomy.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Term Title */}
            <div className="col-span-2">
              <Label htmlFor="title">Term Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g., Canada, Toronto, Dental Services"
                required
              />
            </div>

            {/* Term Slug */}
            <div className="col-span-2">
              <Label htmlFor="slug">Term URL</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="canada-toronto-dental-services"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {slugManuallyEdited
                  ? "Custom URL slug. Clear this field to auto-generate from title again."
                  : "Auto-generated from title. You can edit this to customize the URL."}
              </p>
            </div>
          </div>

          {/* Parent (only if hierarchical) */}
          {taxonomyType.is_hierarchical && (
            <div className="space-y-2">
              <Label htmlFor="parent">Parent Term (Optional)</Label>
              <Combobox
                options={parentOptions}
                value={parentId}
                onValueChange={setParentId}
                placeholder="None (top-level)"
                searchPlaceholder="Search parent terms..."
                emptyMessage="No parent terms found."
                allowClear={true}
              />
              <p className="text-xs text-muted-foreground">
                Create nested hierarchies like Country &gt; Province &gt; City. Search to find parent terms.
              </p>
            </div>
          )}

          {/* Featured Image */}
          <div>
            <Label htmlFor="featured_image">Featured Image</Label>
            <div className="mt-2">
              {featuredImage ? (
                <div className="relative w-48 h-48 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={featuredImage}
                    alt="Featured image preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <button
                    type="button"
                    onClick={() => setFeaturedImage('')}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 cursor-pointer"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <div className="text-white text-center">
                      <ImageIcon className="mx-auto h-8 w-8 mb-2" />
                      <p className="text-sm font-medium">Click to change image</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center w-48 h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all p-4"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Optional featured image for this term
            </p>
          </div>

          {/* Privacy Settings */}
          <div className="space-y-3">
            <Label>Privacy Settings</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_private"
                checked={isPrivate}
                onCheckedChange={(checked) => setIsPrivate(!!checked)}
              />
              <Label htmlFor="is_private" className="text-sm font-normal">
                Private (accessible only via direct URL, hidden from listings)
              </Label>
            </div>
          </div>

          {/* Rich Text Content */}
          <div>
            <Label htmlFor="rich_text">Term Description</Label>
            <PageRichTextEditorBlock
              content={{
                content: richTextContent,
                hideHeader: true,
                hideEditorHeader: true
              }}
              onContentChange={(content) => setRichTextContent(content.content)}
              compact={true}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Rich text content for the term description
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              <Button
                type="submit"
                variant="outline"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          </div>

          {/* Image Picker Modal */}
          <MediaPicker
            open={showImagePicker}
            onOpenChange={setShowImagePicker}
            onSelectMedia={(imageUrl) => {
              setFeaturedImage(imageUrl)
              setShowImagePicker(false)
            }}
            currentMediaUrl={featuredImage || ''}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
