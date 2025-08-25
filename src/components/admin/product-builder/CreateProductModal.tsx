"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ImagePicker } from "@/components/admin/image-library/ImagePicker"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { ImageIcon, X } from "lucide-react"
import { createProductAction, updateProductBlocksAction } from "@/lib/actions/products/product-actions"
import { checkSlugConflicts } from "@/lib/utils/url-path-resolver"
import { useSiteContext } from "@/contexts/site-context"
import type { Product, CreateProductData } from "@/lib/actions/products/product-actions"

interface CreateProductModalProps {
  onSuccess: (product: Product) => void
  onCancel: () => void
}

export function CreateProductModal({ onSuccess, onCancel }: CreateProductModalProps) {
  const { currentSite, siteSettings } = useSiteContext()
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
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [urlPrefix, setUrlPrefix] = useState<string>("")

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

  // Debounced slug conflict checking
  useEffect(() => {
    const checkSlugConflict = async () => {
      const slug = formData.slug?.trim()
      if (!slug || slug.length < 2 || !currentSite?.id) {
        setSlugWarning(null)
        return
      }

      setCheckingSlug(true)
      try {
        const conflictResult = await checkSlugConflicts(currentSite.id, slug)
        
        if (conflictResult.hasConflict) {
          const contentType = conflictResult.conflictType === 'page' ? 'page' :
                             conflictResult.conflictType === 'post' ? 'post' : 'product'
          setSlugWarning(`This slug is already used by a ${contentType} titled "${conflictResult.conflictTitle}". Please choose a different slug.`)
        } else {
          setSlugWarning(null)
        }
      } catch (error) {
        // Silently fail - don't show error for conflict checking
        setSlugWarning(null)
      } finally {
        setCheckingSlug(false)
      }
    }

    const timeoutId = setTimeout(checkSlugConflict, 500) // 500ms debounce
    return () => clearTimeout(timeoutId)
  }, [formData.slug, currentSite?.id])

  // Get URL prefix from context (cached, no API call needed)
  useEffect(() => {
    if (currentSite?.id) {
      setUrlPrefix(siteSettings?.urlPrefixes?.products || "")
    }
  }, [currentSite?.id, siteSettings?.urlPrefixes?.products])

  // Handle featured image changes
  const handleImageChange = async (newImageUrl: string) => {
    setFeaturedImage(newImageUrl)
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    setFeaturedImage('')
  }

  // Handle saving as draft
  const handleSaveDraft = async () => {
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
      const { data, error: actionError } = await createProductAction(currentSite.id, draftData)
      
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

    if (!currentSite?.id) {
      setError('No site selected')
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
      const { data, error: actionError } = await createProductAction(currentSite.id, publishData)
      
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
          {formData.slug && (
            <p className="text-xs text-blue-600 mt-1">
              📄 Product URL: <strong>
                /{urlPrefix ? `${urlPrefix}/` : ''}{formData.slug}
              </strong>
            </p>
          )}
          {checkingSlug && (
            <p className="text-xs text-blue-600 mt-1">
              Checking slug availability...
            </p>
          )}
          {slugWarning && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ {slugWarning}
            </p>
          )}
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
                className="w-full h-full object-cover"
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
          Optional featured image for this product
        </p>
      </div>

      {/* Rich Text Content */}
      <div>
        <Label htmlFor="rich_text">Product Description</Label>
        <PageRichTextEditorBlock
          content={{
            content: richTextContent,
            hideHeader: true,
            hideEditorHeader: true
          }}
          onContentChange={(content) => setRichTextContent(content.content)}
          compact={true}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rich text content for the product description (will be saved as a product block)
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