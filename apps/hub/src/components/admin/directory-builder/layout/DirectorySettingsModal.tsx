"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { ImageIcon, X, Check } from "lucide-react"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { updateDirectoryAction } from "@/lib/actions/directories/directory-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Directory } from "@/lib/actions/directories/directory-actions"

interface DirectorySettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  directory: Directory | null
  site: any | null
  onSuccess?: (updatedDirectory: Directory) => void
}

export function DirectorySettingsModal({
  open,
  onOpenChange,
  directory,
  onSuccess
}: DirectorySettingsModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    meta_description: ''
  })
  const [featuredImage, setFeaturedImage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : generateSlug(title)
    }))
  }

  const handleSlugChange = (slug: string) => {
    if (slug === '') {
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

  useEffect(() => {
    if (!open || !directory) return

    let cancelled = false

    setFormData({
      title: directory.title || '',
      slug: directory.slug || '',
      meta_description: directory.meta_description || ''
    })
    setFeaturedImage(directory.featured_image || '')
    setSlugManuallyEdited(false)

    setSelectedCategoryIds([])
    setPrimaryCategoryId(null)
    setLoadingCategories(true)
    getContentCategoriesAction(directory.id, 'directory').then(({ data }) => {
      if (!cancelled) {
        setSelectedCategoryIds(data ? data.map((c) => c.id) : [])
        setPrimaryCategoryId(data?.find((c) => c.is_primary)?.id || data?.[0]?.id || null)
      }
    }).finally(() => {
      if (!cancelled) {
        setLoadingCategories(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [directory, open])

  const handleSaveDraft = async () => {
    if (!directory) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)

      const draftData = {
        ...formData,
        status: 'draft' as const,
        featured_image: featuredImage || null
      }

      const updateResult = await updateDirectoryAction(directory.id, draftData)

      if (updateResult.error || !updateResult.data) {
        setError(updateResult.error || 'Failed to save directory as draft')
        return
      }

      if (updateResult.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(updateResult.data.id, 'directory', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        setSaveMessage('Saved as draft')
        if (onSuccess) onSuccess(updateResult.data)
        setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (err) {
      setError('Failed to save directory')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!directory) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)

      const publishData = {
        ...formData,
        status: 'published' as const,
        featured_image: featuredImage || null
      }

      const updateResult = await updateDirectoryAction(directory.id, publishData)

      if (updateResult.error || !updateResult.data) {
        setError(updateResult.error || 'Failed to publish directory')
        return
      }

      if (updateResult.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(updateResult.data.id, 'directory', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        setSaveMessage(directory?.status === 'published' ? 'Saved' : 'Published')
        if (onSuccess) onSuccess(updateResult.data)
        setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (err) {
      setError('Failed to publish directory')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!directory) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={(
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate">{directory.title}</span>
            <div className="flex shrink-0 items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${directory?.status === 'published' ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                {directory?.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
        )}
        footerClassName="sm:justify-between"
        footer={(
          <>
            {saveMessage ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">{saveMessage}</span>
              </div>
            ) : <div />}
            <div className="flex items-center space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="directory-settings-form" variant="outline" disabled={saving}>
                {saving ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button type="button" onClick={handlePublish} disabled={saving}>
                {saving ? 'Saving...' : directory?.status === 'published' ? 'Save' : 'Publish'}
              </Button>
            </div>
          </>
        )}
      >
        {error && (
          <div className="px-6 pb-2">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
          </div>
        )}

        <form id="directory-settings-form" onSubmit={handleSubmit} className="contents">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Directory details</DashboardModalCardTitle>
                <CardDescription>Name the directory, set its URL, and featured image.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-title">Directory Title *</FieldLabel>
                  <Input
                    id="modal-title"
                    value={formData.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Enter directory title"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="modal-slug">Directory URL</FieldLabel>
                  <Input
                    id="modal-slug"
                    value={formData.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="directory-url-slug"
                  />
                  <FieldDescription>
                    {slugManuallyEdited
                      ? "Custom URL slug. Clear this field to auto-generate from title again."
                      : "Auto-generated from title. You can edit this to customize the URL."}
                  </FieldDescription>
                </Field>

                <Field className="[&>div]:w-fit">
                  <FieldLabel>Featured Image</FieldLabel>
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
                      <div
                        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 cursor-pointer"
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
                  <FieldDescription>Optional featured image for this directory</FieldDescription>
                </Field>
              </CardContent>
            </Card>

            {directory?.site_id && (
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Categories</DashboardModalCardTitle>
                  <CardDescription>Organize this directory by topic.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel>Categories</FieldLabel>
                    <CategoryPicker
                      siteId={directory.site_id}
                      selectedCategoryIds={selectedCategoryIds}
                      onSelectionChange={setSelectedCategoryIds}
                      primaryCategoryId={primaryCategoryId}
                      onPrimaryCategoryChange={setPrimaryCategoryId}
                      loadingSelectedCategories={loadingCategories}
                      variant="combobox"
                    />
                    <FieldDescription>Assign this directory to one or more categories</FieldDescription>
                  </Field>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
                <CardDescription>Set the search description for this directory.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
                  <Textarea
                    id="meta_description"
                    value={formData.meta_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                    placeholder="SEO meta description"
                    rows={1}
                    className="min-h-10 [field-sizing:content]"
                  />
                  <FieldDescription>
                    Used for SEO. Keep it under 160 characters. Currently: {formData.meta_description.length}/160
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>
          </CardGroup>
        </form>

        <MediaPicker
          open={showImagePicker}
          onOpenChange={setShowImagePicker}
          onSelectMedia={(mediaUrl) => {
            handleImageChange(mediaUrl)
            setShowImagePicker(false)
          }}
          currentMediaUrl={featuredImage || ''}
        />
      </DashboardModalContent>
    </Dialog>
  )
}
