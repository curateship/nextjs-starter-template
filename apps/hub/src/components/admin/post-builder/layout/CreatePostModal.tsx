"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { CategoryPicker } from "@/components/admin/shared/CategoryPicker"
import { ImageIcon, X } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Post } from "@/lib/actions/posts/post-actions"

interface CreatePostData {
  title: string
  slug: string
  meta_description: string
  featured_image: string
  excerpt: string
  content: string
  is_published: boolean
}

interface CreatePostModalProps {
  onSuccess: (post: Post, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreatePostModal({ onSuccess, onCancel }: CreatePostModalProps) {
  const { currentSite } = useSiteContext()
  const [formData, setFormData] = useState<CreatePostData>({
    title: '',
    slug: '',
    meta_description: '',
    featured_image: '',
    excerpt: '',
    content: '',
    is_published: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [showFeaturedImage, setShowFeaturedImage] = useState(true)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

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
    setFormData(prev => ({ ...prev, featured_image: newImageUrl }))
  }

  // Handle removing the featured image
  const handleRemoveImage = async () => {
    setFormData(prev => ({ ...prev, featured_image: '' }))
  }

  // Handle saving as draft, optionally signaling redirect to builder
  const handleSave = async (continueToBuilder = false) => {
    if (!formData.title.trim()) {
      setError('Post title is required')
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
        title: formData.title,
        slug: formData.slug,
        site_id: currentSite.id,
        meta_description: formData.meta_description,
        featured_image: formData.featured_image || null,
        excerpt: formData.excerpt || null,
        is_published: false,
        content_blocks: {
          show_featured_image: showFeaturedImage
        }
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to create post')
        return
      }

      if (result.data) {
        if (selectedCategoryIds.length > 0) {
          bulkAssignCategoriesToContentAction(result.data.id, 'post', selectedCategoryIds).catch(() => {})
        }
        onSuccess(result.data, continueToBuilder)
      }
    } catch (err) {
      setError('Failed to save post')
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Post Title */}
        <div className="col-span-2">
          <Label htmlFor="title">Post Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter post title"
            required
          />
        </div>

        {/* Post Slug */}
        <div className="col-span-2">
          <Label htmlFor="slug">Post URL</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="post-url-slug"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {slugManuallyEdited 
              ? "Custom URL slug. Clear this field to auto-generate from title again." 
              : "Auto-generated from title. You can edit this to customize the URL."}
          </p>
          {formData.slug && (
            <p className="text-xs text-blue-600 mt-1">
              📝 Post URL: <strong>
                /posts/{formData.slug}
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
          {formData.featured_image ? (
            <div className="relative w-48 h-48 rounded-lg overflow-hidden bg-muted">
              <img 
                src={formData.featured_image} 
                alt="Featured image preview" 
                className="w-full h-full object-contain"
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
          Optional featured image for this post
        </p>

        {/* Show Featured Image Toggle */}
        {formData.featured_image && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show_featured_image">Show featured image on post page</Label>
              <p className="text-xs text-muted-foreground">
                Control whether the featured image appears at the top of the post page
              </p>
            </div>
            <Switch
              id="show_featured_image"
              checked={showFeaturedImage}
              onCheckedChange={setShowFeaturedImage}
            />
          </div>
        )}
      </div>

      {/* Post Excerpt */}
      <div>
        <Label htmlFor="excerpt">Post Excerpt</Label>
        <Textarea
          id="excerpt"
          value={formData.excerpt}
          onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
          placeholder="A brief summary of your post content"
          className="resize-none min-h-[40px] overflow-hidden"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Brief summary shown in post listings and previews
        </p>
      </div>

      {/* Categories */}
      {currentSite?.id && (
        <div>
          <Label>Categories</Label>
          <CategoryPicker
            siteId={currentSite.id}
            selectedCategoryIds={selectedCategoryIds}
            onSelectionChange={setSelectedCategoryIds}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Assign this post to one or more categories
          </p>
        </div>
      )}

      {/* Post Content */}
      <div>
        <Label htmlFor="content">Post Content</Label>
        <RichTextEditor
          content={{
            content: formData.content || '',
            hideHeader: true,
            hideEditorHeader: true
          }}
          onContentChange={(content) => setFormData(prev => ({ ...prev, content: content.content }))}
          compact={true}
          inline={true}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rich text content for the post body
        </p>
      </div>

      {/* Meta Description */}
      <div>
        <Label htmlFor="meta_description">Meta Description</Label>
        <Textarea
          id="meta_description"
          value={formData.meta_description}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
          placeholder="A brief description of this post for search engines"
          className="resize-none min-h-[40px] overflow-hidden"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Recommended length: 150-160 characters
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
            onClick={() => handleSave(true)}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      </div>

      {/* Image Picker Modal */}
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(imageUrl) => {
          handleImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={formData.featured_image || ''}
      />
    </form>
  )
}