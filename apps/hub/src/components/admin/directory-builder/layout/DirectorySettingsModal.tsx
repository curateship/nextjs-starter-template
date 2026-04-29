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
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
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
  site,
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

  // Save as draft
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

        setSaveMessage('Directory saved as draft successfully!')
        
        // Call success callback with updated directory
        if (onSuccess) {
          onSuccess(updateResult.data)
        }
        
        // Clear success message after 3 seconds but keep modal open
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      }
    } catch (err) {
      setError('Failed to save directory')
    } finally {
      setSaving(false)
    }
  }

  // Publish directory
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

        setSaveMessage(directory?.status === 'published' ? 'Directory saved successfully!' : 'Directory published successfully!')

        // Call success callback with updated directory
        if (onSuccess) {
          onSuccess(updateResult.data)
        }
        
        // Clear success message after 3 seconds but keep modal open
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      }
    } catch (err) {
      setError('Failed to publish directory')
    } finally {
      setSaving(false)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!directory) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="admin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Configure settings for &quot;{directory.title}&quot;
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                directory?.status === 'published' ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium">
                {directory?.status === 'published' ? 'Published' : 'Draft'}
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
          {/* Directory Title */}
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <Label htmlFor="modal-title">Directory Title *</Label>
              <Input
                id="modal-title"
                value={formData.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter directory title"
                required
              />
            </div>

            {/* Directory Slug */}
            <div className="col-span-2">
              <Label htmlFor="modal-slug">Directory URL</Label>
              <Input
                id="modal-slug"
                value={formData.slug || ''}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="directory-url-slug"
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
                <div className="relative w-48 h-48 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={featuredImage}
                    alt="Featured image preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
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
            <p className="text-xs text-muted-foreground mt-1">
              Optional featured image for this directory
            </p>
          </div>

          {/* Categories */}
          {directory?.site_id && (
            <Field>
              <FieldLabel>Categories</FieldLabel>
              <CategoryPicker
                siteId={directory.site_id}
                selectedCategoryIds={selectedCategoryIds}
                onSelectionChange={setSelectedCategoryIds}
                primaryCategoryId={primaryCategoryId}
                onPrimaryCategoryChange={setPrimaryCategoryId}
                loadingSelectedCategories={loadingCategories}
              />
              <FieldDescription>
                Assign this directory to one or more categories
              </FieldDescription>
            </Field>
          )}

          {/* Meta Description */}
          <div>
            <Label htmlFor="meta_description">Meta Description</Label>
            <Textarea
              id="meta_description"
              value={formData.meta_description}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, meta_description: e.target.value }))
              }}
              placeholder="SEO meta description"
              rows={3}
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
              {saveMessage && (
                <div className="flex items-center space-x-1 text-green-600">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">{saveMessage}</span>
                </div>
              )}
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
                {saving ? 'Saving...' : directory?.status === 'published' ? 'Save' : 'Publish'}
              </Button>
            </div>
          </div>
        </form>

        {/* Image Picker Modal */}
        <MediaPicker
          open={showImagePicker}
          onOpenChange={setShowImagePicker}
          onSelectMedia={(mediaUrl) => {
            handleImageChange(mediaUrl)
            setShowImagePicker(false)
          }}
          currentMediaUrl={featuredImage || ''}
        />
      </DialogContent>
    </Dialog>
  )
}
