"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Event } from "@/lib/actions/events/event-actions"

interface CreateEventModalProps {
  onSuccess: (event: Event, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreateEventModal({ onSuccess, onCancel }: CreateEventModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    meta_description: '',
    is_published: false
  })
  const [isPrivate, setIsPrivate] = useState(false)
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({ ...prev, title }))

    if (!slugManuallyEdited) {
      const newSlug = generateSlug(title)
      setFormData(prev => ({ ...prev, slug: newSlug }))
    }
  }

  const handleSlugChange = (slug: string) => {
    setFormData(prev => ({ ...prev, slug }))
    setSlugManuallyEdited(slug.length > 0)
  }

  const handleImageChange = (imageUrl: string) => {
    setFeaturedImage(imageUrl)
  }

  const handleRemoveImage = () => {
    setFeaturedImage('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  const handleSave = async (continueToBuilder: boolean) => {
    if (!currentSite?.id) {
      setError("No site selected")
      return
    }

    if (!formData.title.trim()) {
      setError("Title is required")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const eventData = {
        title: formData.title.trim(),
        slug: formData.slug.trim() || generateSlug(formData.title.trim()),
        site_id: currentSite.id,
        meta_description: formData.meta_description.trim() || null,
        featured_image: featuredImage || null,
        is_published: false,
        content_blocks: {
          ...(isPrivate ? { _settings: { is_private: true } } : {}),
          show_featured_image: true
        }
      }

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to create event')
        setLoading(false)
        return
      }

      if (!result.data) {
        setError("Failed to create event")
        setLoading(false)
        return
      }

      if (selectedCategoryIds.length > 0) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'event', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          setLoading(false)
          return
        }
      }
      onSuccess(result.data, continueToBuilder)
    } catch (err) {
      setError("Failed to create event")
      setLoading(false)
    }
  }

  return (
    <form id="create-event-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create New Event Item"
        description="Add a new item to your events. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button form="create-event-form" type="submit" variant="outline" disabled={loading}>
                {loading ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
                {loading ? 'Saving...' : 'Continue'}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >
        {error && (
          <div className="px-6 pb-2">
            <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
              {error}
            </div>
          </div>
        )}
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Setup</DashboardModalCardTitle>
              <CardDescription>Set the title and URL for this event.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="title">Event Title *</FieldLabel>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter event title"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="slug">Event URL</FieldLabel>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="event-url-slug"
                />
                <FieldDescription>
                  {slugManuallyEdited
                    ? "Custom URL slug. Clear this field to auto-generate from title again."
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </FieldDescription>
                {formData.slug && (
                  <FieldDescription className="text-blue-600">
                    Event URL: /events/{formData.slug}
                  </FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Image</DashboardModalCardTitle>
              <CardDescription>Optional featured image for this event.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-48">
                {featuredImage ? (
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted">
                    <img
                      src={featuredImage}
                      alt="Featured image preview"
                      className="h-full w-full object-contain"
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
                    className="flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel>Privacy</FieldLabel>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    id="is_private"
                    checked={isPrivate}
                    onCheckedChange={(checked) => setIsPrivate(!!checked)}
                  />
                  <span className="text-sm">
                    Private (accessible only via direct URL, hidden from event listings)
                  </span>
                </label>
              </Field>

              {currentSite?.id && (
                <Field>
                  <FieldLabel>Categories</FieldLabel>
                  <CategoryPicker
                    siteId={currentSite.id}
                    selectedCategoryIds={selectedCategoryIds}
                    onSelectionChange={setSelectedCategoryIds}
                    primaryCategoryId={primaryCategoryId}
                    onPrimaryCategoryChange={setPrimaryCategoryId}
                  />
                  <FieldDescription>
                    Assign this event to one or more categories
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="SEO meta description"
                  rows={1}
                  className="min-h-10 field-sizing-content"
                />
                <FieldDescription>
                  Used for SEO. Keep it under 160 characters. Currently: {formData.meta_description.length}/160
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(mediaUrl) => {
          handleImageChange(mediaUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={featuredImage || ''}
      />
    </form>
  )
}
