"use client"

import { useState, useEffect } from "react"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { ImageIcon, X } from "lucide-react"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Event } from "@/lib/actions/events/event-actions"

interface EventSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: Event | null
  site: any | null
  onSuccess?: (updatedEvent: Event) => void
}

export function EventSettingsModal({ 
  open, 
  onOpenChange, 
  event, 
  onSuccess 
}: EventSettingsModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    meta_description: ''
  })
  const [featuredImage, setFeaturedImage] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)

  // Handle title change and auto-generate slug if slug hasn't been manually edited
  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : generateSlug(title)
    }))
  }

  // Handle manual slug changes
  const handleSlugChange = (slug: string) => {
    if (slug === '') {
      // If user clears the field, reset to auto-generation
      setSlugManuallyEdited(false)
      setFormData(prev => ({ ...prev, slug: generateSlug(prev.title || '') }))
    } else {
      setSlugManuallyEdited(true)
      setFormData(prev => ({ ...prev, slug }))
    }
  }

  const handleImageChange = (imageUrl: string) => {
    setFeaturedImage(imageUrl)
  }

  const handleRemoveImage = () => {
    setFeaturedImage('')
  }

  // Initialize form data
  useEffect(() => {
    let cancelled = false

    if (event) {
      setFormData({
        title: event.title || '',
        slug: event.slug || '',
        meta_description: event.meta_description || ''
      })
      setFeaturedImage(event.featured_image || '')
      setIsPrivate(event.content_blocks?._settings?.is_private === true)
      setSlugManuallyEdited(false)

      setSelectedCategoryIds([])
      setPrimaryCategoryId(null)
      setLoadingCategories(true)
      getContentCategoriesAction(event.id, 'event').then(({ data }) => {
        if (cancelled) return
        if (data) {
          setSelectedCategoryIds(data.map((c) => c.id))
          setPrimaryCategoryId(data.find((c) => c.is_primary)?.id || data[0]?.id || null)
        }
      }).finally(() => {
        if (cancelled) return
        setLoadingCategories(false)
      })
    }

    return () => {
      cancelled = true
    }
  }, [event])

  // Save as draft
  const handleSaveDraft = async () => {
    if (!event) return

    try {
      setSaving(true)
      setError(null)

      const draftData = { 
        ...formData, 
        is_published: false,
        featured_image: featuredImage || null
      }
      const response = await fetch(`/api/events/${event.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftData),
      })
      
      const result = await response.json()
      
      if (!response.ok || result.error) {
        setError(result.error || 'Failed to save event as draft')
        return
      }
      
      if (result.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'event', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        if (onSuccess) {
          onSuccess(result.data)
        }

        onOpenChange(false)
      }
    } catch (err) {
      setError('Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  // Publish event
  const handlePublish = async () => {
    if (!event) return

    try {
      setSaving(true)
      setError(null)

      const publishData = { 
        ...formData, 
        is_published: true,
        featured_image: featuredImage || null
      }
      const response = await fetch(`/api/events/${event.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(publishData),
      })
      
      const result = await response.json()
      
      if (!response.ok || result.error) {
        setError(result.error || 'Failed to publish event')
        return
      }
      
      if (result.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'event', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        if (onSuccess) {
          onSuccess(result.data)
        }

        onOpenChange(false)
      }
    } catch (err) {
      setError('Failed to publish event')
    } finally {
      setSaving(false)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!event) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="admin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Configure settings for &quot;{event.title}&quot;
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                event?.is_published ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium">
                {event?.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
          {/* Event Title */}
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <Label htmlFor="modal-title">Event Title *</Label>
              <Input
                id="modal-title"
                value={formData.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter event title"
                required
              />
            </div>

            {/* Event Slug */}
            <div className="col-span-2">
              <Label htmlFor="modal-slug">Event URL</Label>
              <Input
                id="modal-slug"
                value={formData.slug || ''}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="event-url-slug"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {slugManuallyEdited
                  ? "Custom URL slug. Clear this field to auto-generate from title again."
                  : "Auto-generated from title. You can edit this to customize the URL."}
              </p>
            </div>
          </div>

          {/* Featured Image */}
          <div>
            <Label htmlFor="featured_image">Featured Image</Label>
            <div className="mt-2">
              {featuredImage ? (
                <div className="relative aspect-square w-48 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={featuredImage}
                    alt="Featured image preview"
                    className="w-full h-full object-cover"
                  />
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
                  className="flex aspect-square w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
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
              Optional featured image for this event
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
                  setIsPrivate(!!checked)
                }}
              />
              <Label htmlFor="modal-is-private" className="text-sm font-normal">
                Private (accessible only via direct URL, hidden from event listings)
              </Label>
            </div>
          </div>

          {/* Categories */}
          {event?.site_id && (
            <Field>
              <FieldLabel>Categories</FieldLabel>
              <CategoryPicker
                siteId={event.site_id}
                selectedCategoryIds={selectedCategoryIds}
                onSelectionChange={setSelectedCategoryIds}
                primaryCategoryId={primaryCategoryId}
                onPrimaryCategoryChange={setPrimaryCategoryId}
                loadingSelectedCategories={loadingCategories}
              />
              <FieldDescription>
                Assign this event to one or more categories
              </FieldDescription>
            </Field>
          )}

          {/* Meta Description */}
          <div>
            <Label htmlFor="meta_description">Meta Description</Label>
            <textarea
              className="flex min-h-10 w-full [field-sizing:content] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              id="meta_description"
              value={formData.meta_description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setFormData(prev => ({ ...prev, meta_description: e.target.value }))
              }}
              placeholder="SEO meta description"
              rows={1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for SEO. Keep it under 160 characters. Currently: {formData.meta_description.length}/160
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
              <Button 
                type="submit" 
                variant="outline"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button 
                type="button" 
                onClick={handlePublish}
                disabled={saving}
              >
                {saving ? 'Saving...' : event?.is_published ? 'Save' : 'Publish'}
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
      </DialogContent>
    </Dialog>
  )
}
