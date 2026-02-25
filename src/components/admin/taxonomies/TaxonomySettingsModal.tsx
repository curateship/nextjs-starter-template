"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { ImageIcon, X, Check } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { updateTaxonomyAction, type Taxonomy, type UpdateTaxonomyData } from "@/lib/actions/taxonomies/taxonomy-actions"
import type { TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"

interface TaxonomySettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taxonomy: Taxonomy | null
  taxonomyType: TaxonomyType | null
  existingTaxonomies: Taxonomy[]
  onSuccess?: (updatedTaxonomy: Taxonomy) => void
}

export function TaxonomySettingsModal({
  open,
  onOpenChange,
  taxonomy,
  taxonomyType,
  existingTaxonomies,
  onSuccess
}: TaxonomySettingsModalProps) {
  const [formData, setFormData] = useState<UpdateTaxonomyData>({})
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [parentId, setParentId] = useState<string>("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [isSaved, setIsSaved] = useState(false)


  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // Handle title change and auto-generate slug if slug hasn't been manually edited
  const handleTitleChange = (title: string) => {
    setIsSaved(false)
    setFormData(prev => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : generateSlug(title)
    }))
  }

  // Handle manual slug changes
  const handleSlugChange = (slug: string) => {
    setIsSaved(false)
    if (slug === '') {
      // If user clears the field, reset to auto-generation
      setSlugManuallyEdited(false)
      setFormData(prev => ({ ...prev, slug: generateSlug(prev.title || '') }))
    } else {
      setSlugManuallyEdited(true)
      setFormData(prev => ({ ...prev, slug }))
    }
  }

  // Handle featured image changes
  const handleImageChange = async (newImageUrl: string) => {
    setIsSaved(false)
    setFeaturedImage(newImageUrl)
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    setIsSaved(false)
    setFeaturedImage('')
  }

  // Check if a taxonomy is a descendant of another
  const isDescendant = (potentialDescendant: Taxonomy, ancestorId: string): boolean => {
    let current: Taxonomy | undefined = potentialDescendant
    while (current) {
      if (current.id === ancestorId) return true
      current = existingTaxonomies.find(t => t.id === current?.parent_id)
    }
    return false
  }

  // Build hierarchical options for parent select
  const buildParentOptions = (): ComboboxOption[] => {
    const options: ComboboxOption[] = []

    const addTaxonomy = (tax: Taxonomy, ancestors: Taxonomy[] = []) => {
      // Don't add the current taxonomy or its descendants
      if (taxonomy && (tax.id === taxonomy.id || isDescendant(tax, taxonomy.id))) {
        return
      }

      const path = ancestors.length > 0
        ? ancestors.reverse().map(a => a.title).join(' > ')
        : undefined

      options.push({
        value: tax.id,
        label: tax.title,
        path
      })

      // Find children and add them recursively
      const children = existingTaxonomies.filter(t => t.parent_id === tax.id)
      children.forEach(child => addTaxonomy(child, [...ancestors, tax]))
    }

    // Add top-level taxonomies first
    const topLevel = existingTaxonomies.filter(t => !t.parent_id)
    topLevel.forEach(tax => addTaxonomy(tax))

    return options
  }

  // Initialize form data when taxonomy changes
  useEffect(() => {
    if (taxonomy) {
      setFormData({
        title: taxonomy.title,
        slug: taxonomy.slug,
        is_published: taxonomy.is_published
      })

      // Get is_private from content_blocks
      setIsPrivate(taxonomy.content_blocks?._settings?.is_private === true)

      // Get content from taxonomy columns
      setRichTextContent(taxonomy.description || '')
      setFeaturedImage(taxonomy.featured_image || '')
      setParentId(taxonomy.parent_id || '')

      // Check if slug was manually edited (different from auto-generated)
      const autoGeneratedSlug = generateSlug(taxonomy.title)
      setSlugManuallyEdited(taxonomy.slug !== autoGeneratedSlug)

      // Reset states
      setError(null)
      setSaveMessage(null)
    }
  }, [taxonomy])


  // Handle saving as draft
  const handleSaveDraft = async () => {
    if (!formData.title?.trim()) {
      setError('Term title is required')
      return
    }

    if (!taxonomy) {
      setError('No taxonomy selected')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)

      const draftData: UpdateTaxonomyData = {
        ...formData,
        is_published: false,
        featured_image: featuredImage || null,
        description: richTextContent || null,
        parent_id: parentId || null,
        content_blocks: {
          ...taxonomy.content_blocks,
          _settings: {
            ...taxonomy.content_blocks?._settings,
            is_private: isPrivate
          }
        }
      }

      const { data, error: updateError } = await updateTaxonomyAction(taxonomy.id, draftData)

      if (updateError || !data) {
        setError(updateError || 'Failed to save taxonomy as draft')
        return
      }

      setSaveMessage('Term saved as draft successfully!')
      setIsSaved(true)

      // Call success callback with updated taxonomy
      if (onSuccess) {
        onSuccess(data)
      }

      // Clear success message after 3 seconds but keep modal open
      setTimeout(() => {
        setSaveMessage(null)
      }, 3000)
    } catch (err) {
      setError('Failed to save taxonomy as draft')
    } finally {
      setSaving(false)
    }
  }

  // Handle publishing
  const handlePublish = async () => {
    if (!formData.title?.trim()) {
      setError('Term title is required')
      return
    }

    if (!taxonomy) {
      setError('No taxonomy selected')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)

      const publishData: UpdateTaxonomyData = {
        ...formData,
        is_published: true,
        featured_image: featuredImage || null,
        description: richTextContent || null,
        parent_id: parentId || null,
        content_blocks: {
          ...taxonomy.content_blocks,
          _settings: {
            ...taxonomy.content_blocks?._settings,
            is_private: isPrivate
          }
        }
      }

      const { data, error: updateError } = await updateTaxonomyAction(taxonomy.id, publishData)

      if (updateError || !data) {
        setError(updateError || 'Failed to publish taxonomy')
        return
      }

      setSaveMessage(taxonomy?.is_published ? 'Term saved successfully!' : 'Term published successfully!')
      setIsSaved(true)

      // Call success callback with updated taxonomy
      if (onSuccess) {
        onSuccess(data)
      }

      // Clear success message after 3 seconds but keep modal open
      setTimeout(() => {
        setSaveMessage(null)
      }, 3000)
    } catch (err) {
      setError('Failed to publish taxonomy')
    } finally {
      setSaving(false)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!taxonomy || !taxonomyType) {
    return null
  }

  const parentOptions = buildParentOptions()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
             onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}>
          <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
               style={{ width: '840px', maxWidth: '95vw' }}
               onClick={(e) => e.stopPropagation()}>
            <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
        <DialogHeader className="mb-6">
          <DialogTitle className="flex items-center gap-3">
            Configure settings for &quot;{taxonomy.title}&quot;
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                taxonomy?.is_published ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium">
                {taxonomy?.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {saveMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">{saveMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Term Title */}
              <div className="space-y-2">
                <Label htmlFor="modal-title">Term Title *</Label>
                <Input
                  id="modal-title"
                  value={formData.title || ''}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter term title"
                  required
                />
              </div>

              {/* Term Slug */}
              <div className="space-y-2">
                <Label htmlFor="modal-slug">Term URL</Label>
                <Input
                  id="modal-slug"
                  value={formData.slug || ''}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="term-url-slug"
                />
                <p className="text-xs text-muted-foreground">
                  {slugManuallyEdited
                    ? "Custom URL slug. Clear this field to auto-generate from title again."
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </p>
              </div>

              {/* Parent (only if hierarchical) */}
              {taxonomyType.is_hierarchical && (
                <div className="space-y-2">
                  <Label htmlFor="parent">Parent Term (Optional)</Label>
                  <Combobox
                    options={parentOptions}
                    value={parentId}
                    onValueChange={(value) => {
                      setIsSaved(false)
                      setParentId(value)
                    }}
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
              <div className="space-y-2">
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
                        onClick={handleRemoveImage}
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
                      className="flex items-center justify-center w-48 h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                      onClick={() => setShowImagePicker(true)}
                    >
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                        <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional featured image for this term
                </p>
              </div>

              {/* Privacy Settings */}
              <div className="space-y-2">
                <Label>Privacy Settings</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="modal-is-private"
                    checked={isPrivate}
                    onCheckedChange={(checked) => {
                      setIsSaved(false)
                      setIsPrivate(!!checked)
                    }}
                  />
                  <Label htmlFor="modal-is-private" className="text-sm font-normal">
                    Private (accessible only via direct URL, hidden from listings)
                  </Label>
                </div>
              </div>

              {/* Rich Text Content */}
              <div className="space-y-2">
                <Label htmlFor="rich_text">Term Description</Label>
                <PageRichTextEditorBlock
                  content={{
                    content: richTextContent,
                    hideHeader: true,
                    hideEditorHeader: true
                  }}
                  onContentChange={(content) => {
                    setIsSaved(false)
                    setRichTextContent(content.content)
                  }}
                  compact={true}
                  inline={true}
                />
                <p className="text-xs text-muted-foreground">
                  Rich text content for the term description
                </p>
              </div>

          {/* Form Actions */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <div className="flex items-center space-x-2">
              {isSaved && (
                <div className="flex items-center space-x-1 text-green-600">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">Saved!</span>
                </div>
              )}
              <Button
                type="submit"
                variant="outline"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={saving}
              >
                {saving ? "Saving..." : taxonomy?.is_published ? "Save" : "Publish"}
              </Button>
            </div>
          </div>
        </form>

        {/* Image Picker Modal */}
        <MediaPicker
          open={showImagePicker}
          onOpenChange={setShowImagePicker}
          onSelectMedia={(imageUrl) => {
            handleImageChange(imageUrl)
            setShowImagePicker(false)
          }}
          currentMediaUrl={featuredImage || ''}
        />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  )
}
