"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RichTextEditor } from "@/components/admin/layout/page-builder/RichTextEditor"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { ImageIcon, X } from "lucide-react"
import { createProductAction } from "@/lib/actions/product-actions"
import type { Product, CreateProductData } from "@/lib/actions/product-actions"

interface CreateProductFormProps {
  siteId: string
  onSuccess: (product: Product) => void
  onCancel: () => void
}

export function CreateProductForm({ siteId, onSuccess, onCancel }: CreateProductFormProps) {
  const [formData, setFormData] = useState<CreateProductData>({
    title: '',
    slug: '',
    is_published: false
  })
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

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

  // Handle featured image changes with usage tracking
  const handleImageChange = async (newImageUrl: string) => {
    try {
      // Remove tracking for old image
      if (featuredImage && siteId) {
        const { data: oldImageId } = await getImageByUrlAction(featuredImage)
        if (oldImageId) {
          await removeImageUsageAction(oldImageId, siteId, "product", "featured-image")
        }
      }

      // Track usage for new image
      if (newImageUrl && siteId) {
        const { data: newImageId, error: getImageError } = await getImageByUrlAction(newImageUrl)
        if (newImageId && !getImageError) {
          await trackImageUsageAction(newImageId, siteId, "product", "featured-image")
        }
      }

      // Update the image state
      setFeaturedImage(newImageUrl)
    } catch (error) {
      console.error('Error tracking image usage:', error)
      // Still update the image even if tracking fails
      setFeaturedImage(newImageUrl)
    }
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    if (featuredImage && siteId) {
      try {
        const { data: imageId } = await getImageByUrlAction(featuredImage)
        if (imageId) {
          await removeImageUsageAction(imageId, siteId, "product", "featured-image")
        }
      } catch (error) {
        console.error('Error removing image usage tracking:', error)
      }
    }
    setFeaturedImage('')
  }

  // Handle saving as draft
  const handleSaveDraft = async () => {
    if (!formData.title.trim()) {
      setError('Product title is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      // Create product with default block containing all core content
      const contentBlocks = {
        'product-default': {
          title: formData.title,
          richText: richTextContent || 'Add your product description here...',
          featuredImage: featuredImage || '',
          display_order: 0
        }
      }
      
      const draftData = { ...formData, is_published: false, content_blocks: contentBlocks }
      const { data, error: actionError } = await createProductAction(siteId, draftData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      console.error('Error saving product as draft:', err)
      setError(`Failed to save product as draft: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Handle publishing immediately
  const handlePublish = async () => {
    if (!formData.title.trim()) {
      setError('Product title is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      // Create product with default block containing all core content
      const contentBlocks = {
        'product-default': {
          title: formData.title,
          richText: richTextContent || 'Add your product description here...',
          featuredImage: featuredImage || '',
          display_order: 0
        }
      }
      
      const publishData = { ...formData, is_published: true, content_blocks: contentBlocks }
      const { data, error: actionError } = await createProductAction(siteId, publishData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      console.error('Error publishing product:', err)
      setError(`Failed to publish product: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Product Title */}
        <div className="col-span-2">
          <Label htmlFor="title">Product Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter product title"
            required
          />
        </div>

        {/* Product Slug */}
        <div className="col-span-2">
          <Label htmlFor="slug">Product URL</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="product-url-slug"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {slugManuallyEdited 
              ? "Custom URL slug. Clear this field to auto-generate from title again." 
              : "Auto-generated from title. You can edit this to customize the URL."}
          </p>
        </div>
      </div>

      {/* Rich Text Content */}
      <div>
        <Label htmlFor="rich_text">Product Description</Label>
        <RichTextEditor
          content={{
            content: richTextContent,
            hideHeader: true,
            hideEditorHeader: true
          }}
          onContentChange={(content) => setRichTextContent(content.content)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rich text content for the product description (will be saved as a product block)
        </p>
      </div>

      {/* Featured Image */}
      <div>
        <Label htmlFor="featured_image">Featured Image</Label>
        <div className="mt-2">
          {featuredImage ? (
            <div className="relative rounded-lg overflow-hidden bg-muted">
              <img 
                src={featuredImage} 
                alt="Featured image preview" 
                className="w-full h-48 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
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
              className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
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
          Optional featured image for this product
        </p>
      </div>



      {/* Form Actions */}
      <div className="flex items-center justify-between">
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
            onClick={handlePublish}
            disabled={loading}
          >
            {loading ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Image Picker Modal */}
      <ImagePicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectImage={(imageUrl) => {
          handleImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentImageUrl={featuredImage || ''}
      />
    </form>
  )
}