"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RichTextEditor } from "@/components/admin/layout/page-builder/RichTextEditor"
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
    meta_description: '',
    meta_keywords: '',
    rich_text: '',
    is_published: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Handle saving as draft
  const handleSaveDraft = async () => {
    if (!formData.title.trim()) {
      setError('Product title is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const draftData = { ...formData, is_published: false }
      const { data, error: actionError } = await createProductAction(siteId, draftData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      setError('Failed to save product as draft')
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
      
      const publishData = { ...formData, is_published: true }
      const { data, error: actionError } = await createProductAction(siteId, publishData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      setError('Failed to publish product')
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
            content: formData.rich_text || '',
            hideHeader: true,
            hideEditorHeader: true
          }}
          onContentChange={(content) => setFormData(prev => ({ ...prev, rich_text: content.content }))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rich text content for the product description
        </p>
      </div>

      {/* Meta Description */}
      <div>
        <Label htmlFor="meta_description">Meta Description</Label>
        <Textarea
          id="meta_description"
          value={formData.meta_description}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
          placeholder="A brief description of this product for search engines"
          rows={3}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Recommended length: 150-160 characters
        </p>
      </div>

      {/* Meta Keywords */}
      <div>
        <Label htmlFor="meta_keywords">Meta Keywords</Label>
        <Input
          id="meta_keywords"
          value={formData.meta_keywords}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_keywords: e.target.value }))}
          placeholder="keyword1, keyword2, keyword3"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Separate keywords with commas
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
    </form>
  )
}