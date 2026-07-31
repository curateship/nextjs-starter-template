"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getProductTemplatesBySite } from "@/lib/actions/products/product-template-actions"
import { parseProductBlocksFromJson, productBlocksToJson } from "@/components/admin/product-builder/config/product-block-utils"
import { generateSlug } from "@/lib/utils/slug"
import type { Product } from "@/lib/actions/products/product-actions"
import type { ProductTemplate } from "@/lib/actions/products/product-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

interface CreateProductData {
  title: string
  slug?: string
  meta_description?: string
  is_published: boolean
}

interface CreateProductModalProps {
  onSuccess: (product: Product, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreateProductModal({ onSuccess, onCancel }: CreateProductModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [formData, setFormData] = useState<CreateProductData>({
    title: '',
    slug: '',
    meta_description: '',
    is_published: false
  })
  const [isPrivate, setIsPrivate] = useState(false)
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<"draft" | "continue" | "publish" | null>(null)
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProductTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")

  // Handle title change and auto-generate slug if slug hasn't been manually edited
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

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

  // Debounced slug conflict checking
  useEffect(() => {
    const checkSlugConflict = async () => {
      const slug = formData.slug?.trim()
      if (!slug || slug.length < 2 || !currentSite?.id) {
        setSlugWarning(null)
        return
      }

      // Skip client-side slug checking - server will handle validation
    }

    const timeoutId = setTimeout(checkSlugConflict, 500) // 500ms debounce
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
      const { data } = await getProductTemplatesBySite({ data: { siteId: currentSite.id } })

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find((template) => template.is_default)
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : "blank")
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

  // Handle featured image changes
  const handleImageChange = async (newImageUrl: string) => {
    setFeaturedImage(newImageUrl)
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    setFeaturedImage('')
  }

  // Handle saving as draft, optionally signaling redirect to builder
  const handleSave = async (continueToBuilder = false, publishNow = false) => {
    if (!formData.title.trim()) {
      setError('Product title is required')
      return
    }

    if (!currentSite?.id) {
      setError('No site selected')
      return
    }

    try {
      setLoading(true)
      setLoadingAction(publishNow ? "publish" : continueToBuilder ? "continue" : "draft")
      setError(null)

      const selectedTemplate = selectedTemplateId !== "blank"
        ? templates.find((template) => template.id === selectedTemplateId)
        : null
      const templateContentBlocks = selectedTemplate?.content_blocks && typeof selectedTemplate.content_blocks === "object"
        ? JSON.parse(JSON.stringify(selectedTemplate.content_blocks))
        : {}
      const sanitizedTemplateContentBlocks = selectedTemplate
        ? productBlocksToJson(parseProductBlocksFromJson(templateContentBlocks), templateContentBlocks)
        : {}

      const draftData = {
        ...formData,
        site_id: currentSite.id,
        is_published: publishNow,
        featured_image: featuredImage || null,
        meta_description: formData.meta_description?.trim() || null,
        content_blocks: {
          ...sanitizedTemplateContentBlocks,
          _settings: {
            ...(sanitizedTemplateContentBlocks._settings || {}),
            is_private: isPrivate,
          }
        }
      }

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to create product')
        return
      }

      if (result.data) {
        if (selectedCategoryIds.length > 0) {
          const categoryResult = await bulkAssignCategoriesToContentAction({ data: { contentId: result.data.id, contentType: 'product', categoryIds: selectedCategoryIds, primaryCategoryId: primaryCategoryId } })
          if (!categoryResult.success) {
            setError(categoryResult.error || 'Failed to save categories')
            return
          }
        }
        onSuccess(result.data, continueToBuilder)
      }
    } catch (err) {
      console.error('Error saving product:', err)
      setError(`Failed to save product: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
      setLoadingAction(null)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <form id="create-product-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create New Product"
        description="Add a new product to your catalog. You can customize the content after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button
                form="create-product-form"
                type="submit"
                variant="outline"
                disabled={loading}
              >
                {loadingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button
                type="button"
                onClick={() => handleSave(true)}
                disabled={loading}
              >
                {loadingAction === 'continue' ? 'Saving...' : 'Continue'}
              </Button>
              <Button
                type="button"
                onClick={() => handleSave(false, true)}
                disabled={loading}
              >
                {loadingAction === 'publish' ? 'Publishing...' : 'Publish'}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Product setup</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="template">Start from Template</FieldLabel>
                {templatesLoading ? (
                  <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
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
              </Field>

              <Field>
                <FieldLabel htmlFor="title">Product Title *</FieldLabel>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter product title"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="slug">Product URL</FieldLabel>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="product-url-slug"
                />
                <FieldDescription>
                  {slugManuallyEdited
                    ? "Custom URL slug. Clear this field to auto-generate from title again."
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </FieldDescription>
                {formData.slug && (
                  <FieldDescription className="text-blue-600">
                    Product URL: /products/{formData.slug}
                  </FieldDescription>
                )}
                {checkingSlug && (
                  <FieldDescription className="text-blue-600">
                    Checking slug availability...
                  </FieldDescription>
                )}
                {slugWarning && (
                  <FieldDescription className="text-amber-600">
                    {slugWarning}
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
                <Field className="w-48">
                  {featuredImage ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                    <img
                      src={featuredImage}
                      alt="Featured image preview"
                      className="h-full w-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
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
                    className="flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                    </div>
                  </div>
                  )}
                </Field>
              </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel>Privacy Settings</FieldLabel>
                <Field orientation="horizontal" className="items-start gap-3">
                  <Checkbox
                    id="is_private"
                    checked={isPrivate}
                    onCheckedChange={(checked) => setIsPrivate(!!checked)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="is_private" className="font-normal">
                      Private
                    </FieldLabel>
                    <FieldDescription>
                      Accessible only by direct URL and hidden from product listings.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </Field>

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
                  <FieldDescription>Assign this product to one or more categories.</FieldDescription>
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>SEO</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="SEO meta description"
                  rows={1}
                  className="min-h-10 field-sizing-content"
                />
                <FieldDescription>
                  Used for SEO. Keep it under 160 characters. Currently: {(formData.meta_description || '').length}/160
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(imageUrl) => {
          handleImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={featuredImage || ''}
      />
    </form>
  )
}
