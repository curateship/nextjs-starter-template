"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { CalendarIcon, ImageIcon, X } from "lucide-react"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Product, UpdateProductData } from "@/lib/actions/products/product-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

const EMPTY_INITIAL_CATEGORIES: CategoryInfo[] = []

function formatDateInputValue(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isValidDateInputValue(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false

  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function applyDateInputValue(currentValue: string | undefined, dateValue: string) {
  if (!isValidDateInputValue(dateValue)) return ''

  const [year, month, day] = dateValue.split('-').map(Number)
  const date = currentValue ? new Date(currentValue) : new Date()
  const nextDate = Number.isNaN(date.getTime()) ? new Date() : date

  nextDate.setFullYear(year, month - 1, day)

  return nextDate.toISOString()
}

function toCalendarDate(value?: string | null) {
  const dateValue = formatDateInputValue(value)
  if (!dateValue) return undefined

  const [year, month, day] = dateValue.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatCalendarDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

interface ProductSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  site: SiteWithTheme | null
  initialCategories?: CategoryInfo[]
  onSuccess?: (updatedProduct: Product) => void
}

export function ProductSettingsModal({
  open,
  onOpenChange,
  product,
  initialCategories,
  onSuccess
}: ProductSettingsModalProps) {
  const [formData, setFormData] = useState<UpdateProductData>({})
  const [featuredImage, setFeaturedImage] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [savingAction, setSavingAction] = useState<"draft" | "publish" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [createdDateInput, setCreatedDateInput] = useState('')
  const [createdDateOpen, setCreatedDateOpen] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedCategoryDetails, setSelectedCategoryDetails] = useState<CategoryInfo[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const hasInitialCategorySnapshot = initialCategories !== undefined
  const hasInitialSelectedCategories = (initialCategories?.length ?? 0) > 0
  const showCategorySkeleton = loadingCategories && (!hasInitialCategorySnapshot || hasInitialSelectedCategories)
  const saving = savingAction !== null

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

  const handleImageChange = async (newImageUrl: string) => {
    setFeaturedImage(newImageUrl)
  }

  const handleRemoveImage = async () => {
    setFeaturedImage('')
  }

  useEffect(() => {
    let cancelled = false

    if (product) {
      const createdDateValue = formatDateInputValue(product.created_at)

      setFormData({
        title: product.title,
        slug: product.slug,
        is_published: product.is_published,
        created_at: product.created_at,
        meta_description: product.meta_description || ''
      })
      setCreatedDateInput(createdDateValue)
      setIsPrivate(product.content_blocks?._settings?.is_private === true)
      setFeaturedImage(product.featured_image || '')

      const autoGeneratedSlug = generateSlug(product.title)
      setSlugManuallyEdited(product.slug !== autoGeneratedSlug)

      setError(null)

      const startingCategories = initialCategories ?? EMPTY_INITIAL_CATEGORIES
      setSelectedCategoryIds(startingCategories.map((category) => category.id))
      setSelectedCategoryDetails([])
      setPrimaryCategoryId(null)
      setLoadingCategories(true)
      getContentCategoriesAction(product.id, 'product').then(({ data }) => {
        if (cancelled) return
        if (data) {
          setSelectedCategoryIds(data.map((c) => c.id))
          setSelectedCategoryDetails(data)
          setPrimaryCategoryId(data.find((c) => c.is_primary)?.id || data[0]?.id || null)
        } else {
          setSelectedCategoryIds([])
          setSelectedCategoryDetails([])
          setPrimaryCategoryId(null)
        }
      }).finally(() => {
        if (cancelled) return
        setLoadingCategories(false)
      })
    }

    return () => {
      cancelled = true
    }
  }, [initialCategories, product])

  const handleSaveDraft = async () => {
    if (!formData.title?.trim()) {
      setError('Product title is required')
      return
    }
    if (!product) {
      setError('No product selected')
      return
    }
    if (!isValidDateInputValue(createdDateInput) || !formData.created_at || Number.isNaN(new Date(formData.created_at).getTime())) {
      setError('Enter a valid created date')
      return
    }

    try {
      setSavingAction("draft")
      setError(null)

      const draftData = {
        ...formData,
        is_published: false,
        featured_image: featuredImage || null,
        content_blocks: {
          ...product.content_blocks,
          _settings: {
            ...product.content_blocks?._settings,
            is_private: isPrivate
          }
        }
      }

      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to save product as draft')
        return
      }

      if (result.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'product', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        if (onSuccess) onSuccess(result.data)
        onOpenChange(false)
      }
    } catch (err) {
      setError('Failed to save product as draft')
    } finally {
      setSavingAction(null)
    }
  }

  const handlePublish = async () => {
    if (!formData.title?.trim()) {
      setError('Product title is required')
      return
    }
    if (!product) {
      setError('No product selected')
      return
    }
    if (!isValidDateInputValue(createdDateInput) || !formData.created_at || Number.isNaN(new Date(formData.created_at).getTime())) {
      setError('Enter a valid created date')
      return
    }

    try {
      setSavingAction("publish")
      setError(null)

      const publishData = {
        ...formData,
        is_published: true,
        featured_image: featuredImage || null,
        content_blocks: {
          ...product.content_blocks,
          _settings: {
            ...product.content_blocks?._settings,
            is_private: isPrivate
          }
        }
      }

      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to publish product')
        return
      }

      if (result.data) {
        const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'product', selectedCategoryIds, primaryCategoryId)
        if (!categoryResult.success) {
          setError(categoryResult.error || 'Failed to save categories')
          return
        }

        if (onSuccess) onSuccess(result.data)
        onOpenChange(false)
      }
    } catch (err) {
      setError('Failed to publish product')
    } finally {
      setSavingAction(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={(
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate">{product.title}</span>
            <div className="flex shrink-0 items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${product?.is_published ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                {product?.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
        )}
        footerClassName="sm:justify-between"
        footer={(
          <>
            <div />
            <DashboardModalFooterActions>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="product-settings-form"
                variant="outline"
                disabled={saving}
              >
                {savingAction === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={saving}
              >
                {savingAction === "publish" ? "Saving..." : product?.is_published ? "Save" : "Publish"}
              </Button>
            </DashboardModalFooterActions>
          </>
        )}
      >
        <form
          id="product-settings-form"
          onSubmit={handleSubmit}
          className="contents"
        >
          {error && (
            <div className="px-6 pb-2">
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            </div>
          )}

          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Product details</DashboardModalCardTitle>
                <CardDescription>Name the product, set its URL, date, and image.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-title">Product Title *</FieldLabel>
                  <Input
                    id="modal-title"
                    value={formData.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Enter product title"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="modal-slug">Product URL</FieldLabel>
                  <Input
                    id="modal-slug"
                    value={formData.slug || ''}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="product-url-slug"
                  />
                  {slugManuallyEdited && (
                    <FieldDescription>
                      Custom URL slug. Clear this field to auto-generate from title again.
                    </FieldDescription>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="modal-created-date">Created Date</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="modal-created-date"
                      type="text"
                      value={createdDateInput}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        setCreatedDateInput(nextValue)
                        setFormData(prev => ({
                          ...prev,
                          created_at: applyDateInputValue(prev.created_at, nextValue)
                        }))
                      }}
                      placeholder="YYYY-MM-DD"
                      required
                    />
                    <Popover open={createdDateOpen} onOpenChange={setCreatedDateOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="icon" aria-label="Choose created date">
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarPicker
                          mode="single"
                          selected={toCalendarDate(formData.created_at)}
                          onSelect={(date) => {
                            if (!date) return
                            const nextValue = formatCalendarDateInputValue(date)
                            setCreatedDateInput(nextValue)
                            setFormData(prev => ({
                              ...prev,
                              created_at: applyDateInputValue(prev.created_at, nextValue)
                            }))
                            setCreatedDateOpen(false)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FieldDescription>Used when product listings are sorted by date.</FieldDescription>
                </Field>

                <Field className="[&>div]:w-fit">
                  <FieldLabel>Featured Image</FieldLabel>
                  <div>
                    {featuredImage ? (
                      <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-muted">
                        <img
                          src={featuredImage}
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
                  <FieldDescription>Optional featured image for this product.</FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Privacy &amp; Categories</DashboardModalCardTitle>
                <CardDescription>Control visibility and organize by topic.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="modal-is-private"
                    checked={isPrivate}
                    onCheckedChange={(checked) => {
                      setIsPrivate(!!checked)
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <label htmlFor="modal-is-private" className="text-sm font-normal cursor-pointer">Private</label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Accessible only by direct URL and hidden from product listings.
                    </p>
                  </div>
                </div>

                {product.site_id && (
                  <Field>
                    <FieldLabel>Categories</FieldLabel>
                    <CategoryPicker
                      siteId={product.site_id}
                      selectedCategoryIds={selectedCategoryIds}
                      onSelectionChange={setSelectedCategoryIds}
                      selectedCategoryDetails={selectedCategoryDetails}
                      primaryCategoryId={primaryCategoryId}
                      onPrimaryCategoryChange={setPrimaryCategoryId}
                      loadingSelectedCategories={showCategorySkeleton}
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
                <CardDescription>Set the search description for this product.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-meta-description">Meta Description</FieldLabel>
                  <Textarea
                    id="modal-meta-description"
                    value={formData.meta_description || ''}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, meta_description: e.target.value }))
                    }}
                    placeholder="SEO meta description"
                    rows={1}
                    className="min-h-10 field-sizing-content"
                  />
                  <FieldDescription>
                    Keep it under 160 characters. Currently: {(formData.meta_description || '').length}/160
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>
          </CardGroup>
        </form>

        <MediaPicker
          open={showImagePicker}
          onOpenChange={setShowImagePicker}
          onSelectMedia={(imageUrl) => {
            handleImageChange(imageUrl)
            setShowImagePicker(false)
          }}
          currentMediaUrl={featuredImage || ''}
        />
      </DashboardModalContent>
    </Dialog>
  )
}
