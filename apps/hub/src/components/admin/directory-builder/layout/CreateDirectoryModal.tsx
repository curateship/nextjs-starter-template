"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { CategoryPicker } from "@/components/admin/shared/CategoryPicker"
import { ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/site-switcher/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { generateSlug } from "@/lib/utils/slug"
import type { Directory } from "@/lib/actions/directories/directory-actions"

interface CreateDirectoryModalProps {
  onSuccess: (directory: Directory, continueToBuilder?: boolean) => void
  onCancel: () => void
}

export function CreateDirectoryModal({ onSuccess, onCancel }: CreateDirectoryModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    meta_description: '',
    is_published: false
  })
  const [isPrivate, setIsPrivate] = useState(false)
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  const handleSave = async (continueToBuilder: boolean) => {
    if (!currentSite?.id) {
      setError("No site selected")
      return
    }

    if (!formData.title.trim()) {
      setError("Title is required")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const directoryData = {
        title: formData.title.trim(),
        slug: formData.slug.trim() || generateSlug(formData.title.trim()),
        site_id: currentSite.id,
        description: formData.description.trim() || richTextContent.trim() || null,
        meta_description: formData.meta_description.trim() || null,
        featured_image: featuredImage || null,
        is_published: false,
        content_blocks: {
          ...(isPrivate ? { _settings: { is_private: true } } : {}),
          show_featured_image: true
        }
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
        setLoading(false)
        return
      }

      if (!result.data) {
        setError("Failed to create directory")
        setLoading(false)
        return
      }

      if (selectedCategoryIds.length > 0) {
        bulkAssignCategoriesToContentAction(result.data.id, 'directory', selectedCategoryIds).catch(() => {})
      }
      onSuccess(result.data, continueToBuilder)
    } catch (err) {
      setError("Failed to create directory")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Directory Title */}
        <div className="col-span-2">
          <Label htmlFor="title">Directory Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter directory title"
            required
          />
        </div>

        {/* Directory Slug */}
        <div className="col-span-2">
          <Label htmlFor="slug">Directory URL</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="directory-url-slug"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {slugManuallyEdited 
              ? "Custom URL slug. Clear this field to auto-generate from title again." 
              : "Auto-generated from title. You can edit this to customize the URL."}
          </p>
          {formData.slug && (
            <p className="text-xs text-blue-600 mt-1">
              📄 Directory URL: <strong>
                /directories/{formData.slug}
              </strong>
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
          Optional featured image for this directory
        </p>
      </div>

      {/* Privacy Settings */}
      <div className="space-y-3">
        <Label>Privacy Settings</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_private"
            checked={isPrivate}
            onCheckedChange={(checked) => setIsPrivate(!!checked)}
          />
          <Label htmlFor="is_private" className="text-sm font-normal">
            Private (accessible only via direct URL, hidden from directory listings)
          </Label>
        </div>
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
            Assign this directory to one or more categories
          </p>
        </div>
      )}

      {/* Rich Text Content */}
      <div>
        <Label htmlFor="rich_text">Directory Description</Label>
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
        <p className="text-xs text-muted-foreground mt-1">
          Rich text content for the directory description (will be saved as a directory block)
        </p>
      </div>

      {/* Meta Description */}
      <div>
        <Label htmlFor="meta_description">Meta Description</Label>
        <Textarea
          id="meta_description"
          value={formData.meta_description}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
          placeholder="SEO meta description"
          rows={3}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Used for SEO. Keep it under 160 characters. Currently: {formData.meta_description.length}/160
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

      {/* Media Picker Modal */}
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