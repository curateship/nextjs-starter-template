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
import { Field, FieldDescription } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { ImageIcon, X } from "lucide-react"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import {
  putJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
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
  const { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState('')
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)

  const { loading: saving, loadingAction: savingAction, error, setError, submit } = useCreateContent<Event>({
    entityLabel: "event",
    title,
    titleRequiredMessage: "Event title is required",
    create: (publish) => putJson(`/api/events/${event?.id}`, {
      title,
      slug,
      meta_description: metaDescription,
      is_published: publish,
      featured_image: featuredImage || null,
    }),
    // Persist category selection after the event row is updated
    afterCreate: async (updated) => {
      const categoryResult = await bulkAssignCategoriesToContentAction(updated.id, 'event', selectedCategoryIds, primaryCategoryId)
      return categoryResult.success ? null : (categoryResult.error || 'Failed to save categories')
    },
    failureMessage: (_, publish) => publish ? 'Failed to publish event' : 'Failed to save event',
  })

  // Initialize form data and load the event's current categories
  useEffect(() => {
    let cancelled = false

    if (event) {
      // Event settings historically starts in auto-slug mode regardless of the stored slug
      reset(event.title || '', event.slug || '', { detectManualEdit: false })
      setMetaDescription(event.meta_description || '')
      setFeaturedImage(event.featured_image || '')

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  const handleSave = async (publish: boolean) => {
    if (!event) return
    await submit(publish ? "publish" : "draft", publish, (updated) => {
      onSuccess?.(updated)
      onOpenChange(false)
    })
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
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
                value={title || ''}
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
                value={slug || ''}
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

          <div>
            <div className="mt-2">
              {featuredImage ? (
                <div className="relative aspect-square w-48 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={featuredImage}
                    alt="Featured image preview"
                    className="w-full h-full object-contain"
                  />
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
                  className="flex aspect-square w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Categories */}
          {event?.site_id && (
            <Field>
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
              className="flex min-h-10 w-full field-sizing-content rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              id="meta_description"
              value={metaDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setMetaDescription(e.target.value)
              }}
              placeholder="SEO meta description"
              rows={1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for SEO. Keep it under 160 characters. Currently: {metaDescription.length}/160
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
              {savingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
            </Button>
              <Button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                {savingAction === 'publish' ? 'Saving...' : event?.is_published ? 'Save' : 'Publish'}
              </Button>
            </div>
          </div>
        </form>

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
      </DialogContent>
    </Dialog>
  )
}
