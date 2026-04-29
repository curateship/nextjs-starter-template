"use client"

import { useState } from "react"
import { createCategoryAction, type Category } from "@/lib/actions/categories/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { ImageIcon, X } from "lucide-react"
import {
  Dialog,
} from "@/components/ui/dialog"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { generateSlug } from "@/lib/utils/slug"

interface CreateCategoryModalProps {
  siteId: string
  existingCategories: Category[]
  onClose: () => void
  onCreated: (category: Category, continueToBuilder?: boolean) => void
}

export function CreateCategoryModal({
  siteId,
  existingCategories,
  onClose,
  onCreated
}: CreateCategoryModalProps) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [metaDescription, setMetaDescription] = useState("")
  const [parentId, setParentId] = useState<string>("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  const handleTitleChange = (value: string) => {
    setTitle(value)
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

  const buildParentOptions = (): ComboboxOption[] => {
    const options: ComboboxOption[] = []

    const addCategory = (category: Category, ancestors: Category[] = []) => {
      const path = ancestors.length > 0
        ? ancestors.map(a => a.title).join(' > ')
        : undefined

      options.push({
        value: category.id,
        label: category.title,
        path
      })

      const children = existingCategories.filter(c => c.parent_id === category.id)
      children.forEach(child => addCategory(child, [...ancestors, category]))
    }

    const topLevel = existingCategories.filter(c => !c.parent_id)
    topLevel.forEach(category => addCategory(category))

    return options
  }

  const handleSave = async (continueToBuilder: boolean) => {
    if (!title.trim()) {
      setError('Category title is required')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const { data, error: createError } = await createCategoryAction(
        siteId,
        {
          title,
          slug,
          meta_description: metaDescription.trim() || null,
          parent_id: parentId || null,
          featured_image: featuredImage || null,
          content_blocks: {
            _settings: { is_private: isPrivate },
            show_featured_image: true
          },
          is_published: false
        }
      )

      if (createError) {
        setError(createError)
        setIsSubmitting(false)
        return
      }

      if (data) {
        onCreated(data, continueToBuilder)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  const parentOptions = buildParentOptions()

  return (
    <Dialog open onOpenChange={onClose}>
      <AdminModalContent>
        <AdminModalHeader>
          <AdminModalTitle>Create Category</AdminModalTitle>
          <AdminModalDescription>
            Add a new category to organize your content.
          </AdminModalDescription>
        </AdminModalHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <Label htmlFor="title">Category Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g., Technology, Health, Travel"
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="slug">Category URL</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="technology-health-travel"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {slugManuallyEdited
                  ? "Custom URL slug. Clear this field to auto-generate from title again."
                  : "Auto-generated from title. You can edit this to customize the URL."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">Parent Category (Optional)</Label>
            <Combobox
              options={parentOptions}
              value={parentId}
              onValueChange={setParentId}
              placeholder="None (top-level)"
              searchPlaceholder="Search parent categories..."
              emptyMessage="No parent categories found."
              allowClear={true}
            />
            <p className="text-xs text-muted-foreground">
              Create nested hierarchies. Search to find parent categories.
            </p>
          </div>

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
                  <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
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
              Optional featured image for this category
            </p>
          </div>

          <div className="space-y-2">
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

          <div>
            <Label htmlFor="meta_description">Meta Description</Label>
            <Textarea
              id="meta_description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="SEO meta description"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for SEO. Keep it under 160 characters. Currently: {metaDescription.length}/160
            </p>
          </div>
          </AdminModalBody>

          <AdminModalFooter>
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
                onClick={() => handleSave(true)}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Continue'}
              </Button>
            </div>
          </AdminModalFooter>

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
      </AdminModalContent>
    </Dialog>
  )
}
