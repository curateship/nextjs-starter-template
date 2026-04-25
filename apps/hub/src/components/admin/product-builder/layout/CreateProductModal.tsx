"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminModalBody,
  AdminModalFooter,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { RichTextEditor } from "@/components/admin/layout/builder/RichTextEditor"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Product } from "@/lib/actions/products/product-actions"

interface CreateProductData {
  title: string
  slug?: string
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
    is_published: false
  })
  const [isPrivate, setIsPrivate] = useState(false)
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)

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


  // Handle featured image changes
  const handleImageChange = async (newImageUrl: string) => {
    setFeaturedImage(newImageUrl)
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    setFeaturedImage('')
  }

  // Handle saving as draft, optionally signaling redirect to builder
  const handleSave = async (continueToBuilder = false) => {
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
      setError(null)

      const draftData = {
        ...formData,
        site_id: currentSite.id,
        is_published: false,
        featured_image: featuredImage || null,
        description: richTextContent || null,
        content_blocks: {
          _settings: { is_private: isPrivate }
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
          const categoryResult = await bulkAssignCategoriesToContentAction(result.data.id, 'product', selectedCategoryIds, primaryCategoryId)
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
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <AdminModalBody>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <FieldGroup className={error ? "gap-6 pt-4" : "gap-6"}>
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

          <Field className="*:data-[slot=field-label]:w-fit *:data-[slot=field-description]:max-w-md [&>div]:w-fit">
            <FieldLabel>Featured Image</FieldLabel>
            {featuredImage ? (
              <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                <img
                  src={featuredImage}
                  alt="Featured image preview"
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
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
            <FieldDescription>
              Optional featured image for this product.
            </FieldDescription>
          </Field>

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
              <FieldLabel>Categories</FieldLabel>
              <CategoryPicker
                siteId={currentSite.id}
                selectedCategoryIds={selectedCategoryIds}
                onSelectionChange={setSelectedCategoryIds}
                primaryCategoryId={primaryCategoryId}
                onPrimaryCategoryChange={setPrimaryCategoryId}
              />
              <FieldDescription>
                Assign this product to one or more categories.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="rich_text">Product Description</FieldLabel>
            <RichTextEditor
              content={{
                content: richTextContent,
                hideHeader: true,
                hideEditorHeader: true
              }}
              onContentChange={(content) => setRichTextContent(content.content)}
              compact={true}
              inline={true}
            />
            <FieldDescription>
              Rich text content for the product description. This is saved into the product content.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </AdminModalBody>

      <AdminModalFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center space-x-2">
          <Button 
            type="submit" 
            variant="outline" 
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button
            type="button"
            onClick={() => handleSave(true)}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      </AdminModalFooter>

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
    </form>
  )
}
