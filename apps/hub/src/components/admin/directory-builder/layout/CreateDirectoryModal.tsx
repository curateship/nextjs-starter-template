"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ChevronDown, ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getDirectoryTemplatesBySite } from "@/lib/actions/directories/directory-template-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import type { DirectoryTemplate } from "@/lib/actions/directories/directory-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreateDirectoryModalProps {
  onSuccess: (directory: Directory, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreateDirectoryModal({ onSuccess, onCancel }: CreateDirectoryModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    meta_description: '',
  })
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<"draft" | "continue" | "publish" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<DirectoryTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentSite?.id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getDirectoryTemplatesBySite(currentSite.id)

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find((template) => template.is_default)
        setSelectedTemplateId(defaultTemplate?.id || loaded[0]?.id || '')
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

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

  const resetForm = () => {
    const defaultTemplate = templates.find((template) => template.is_default)

    setFormData({
      title: '',
      slug: '',
      meta_description: '',
    })
    setFeaturedImage('')
    setError(null)
    setShowImagePicker(false)
    setSlugManuallyEdited(false)
    setSelectedCategoryIds([])
    setPrimaryCategoryId(null)
    setSelectedTemplateId(defaultTemplate?.id || templates[0]?.id || '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  const handleSave = async (continueToBuilder: boolean, publishNow = false) => {
    if (!currentSite?.id) {
      setError("No site selected")
      return
    }

    if (!formData.title.trim()) {
      setError("Title is required")
      return
    }

    setLoading(true)
    setLoadingAction(publishNow ? "publish" : continueToBuilder ? "continue" : "draft")
    setError(null)

    try {
      if (!selectedTemplateId) {
        setError("Template is required")
        return
      }

      const directoryData = {
        title: formData.title.trim(),
        slug: formData.slug.trim() || generateSlug(formData.title.trim()),
        site_id: currentSite.id,
        template_id: selectedTemplateId,
        meta_description: formData.meta_description.trim() || null,
        featured_image: featuredImage || null,
        status: publishNow ? 'published' : 'draft',
        content_blocks: {},
      }

      const response = await fetch('/api/directories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(directoryData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to create directory')
        return
      }

      if (!result.data) {
        setError("Failed to create directory")
        return
      }

      if (selectedCategoryIds.length > 0) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'directory', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }
      }
      resetForm()
      onSuccess(result.data, continueToBuilder)
    } catch (err) {
      setError("Failed to create listing")
    } finally {
      setLoading(false)
      setLoadingAction(null)
    }
  }

  return (
    <form id="create-directory-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Add Listing"
        description="Add a new listing to your directory. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button form="create-directory-form" type="submit" variant="outline" disabled={loading}>
                {loadingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button type="button" onClick={() => handleSave(true)} disabled={loading}>
                {loadingAction === 'continue' ? 'Saving...' : 'Continue'}
              </Button>
              <Button type="button" onClick={() => handleSave(false, true)} disabled={loading}>
                {loadingAction === 'publish' ? 'Publishing...' : 'Publish'}
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
              <CardDescription>Choose a template and set the title and URL for this listing.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="template">Start from Template</FieldLabel>
                {templatesLoading ? (
                  <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                    <Skeleton className="h-4 w-24 rounded-sm" />
                    <ChevronDown className="size-4 opacity-50" />
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="title">Listing Title *</FieldLabel>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter listing title"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="slug">Listing URL</FieldLabel>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="listing-url-slug"
                />
                <FieldDescription>
                  {slugManuallyEdited
                    ? "Custom URL slug. Clear this field to auto-generate from title again."
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </FieldDescription>
                {formData.slug && (
                  <FieldDescription className="text-blue-600">
                    Listing URL: /directory/{formData.slug}
                  </FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Image</DashboardModalCardTitle>
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
              {currentSite?.id && (
                <Field>
                  <CategoryPicker
                    siteId={currentSite.id}
                    selectedCategoryIds={selectedCategoryIds}
                    onSelectionChange={setSelectedCategoryIds}
                    primaryCategoryId={primaryCategoryId}
                    onPrimaryCategoryChange={setPrimaryCategoryId}
                    variant="combobox"
                  />
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
