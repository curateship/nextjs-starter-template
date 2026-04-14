"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { CategoryPicker } from "@/components/admin/shared/CategoryPicker"
import { ChevronDown, ImageIcon, X } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import { getDirectoryTemplatesBySite } from "@/lib/actions/directories/directory-template-actions"
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { generateSlug } from "@/lib/utils/slug"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import type { DirectoryTemplate } from "@/lib/actions/directories/directory-template-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  })
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [templates, setTemplates] = useState<DirectoryTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('blank')

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentSite?.id) {
        setTemplates([])
        setTemplatesLoading(false)
        return
      }

      setTemplatesLoading(true)
      const { data } = await getDirectoryTemplatesBySite(currentSite.id)

      if (!cancelled) {
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find((template) => template.is_default)
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : 'blank')
        setTemplatesLoading(false)
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

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
      const selectedTemplate = selectedTemplateId !== 'blank'
        ? templates.find((template) => template.id === selectedTemplateId)
        : null
      const templateContentBlocks = selectedTemplate?.content_blocks && typeof selectedTemplate.content_blocks === 'object'
        ? JSON.parse(JSON.stringify(selectedTemplate.content_blocks))
        : {}
      const templateSettings = templateContentBlocks._settings && typeof templateContentBlocks._settings === 'object'
        ? templateContentBlocks._settings
        : {}

      const directoryData = {
        title: formData.title.trim(),
        slug: formData.slug.trim() || generateSlug(formData.title.trim()),
        site_id: currentSite.id,
        description: formData.description.trim() || richTextContent.trim() || null,
        meta_description: formData.meta_description.trim() || null,
        featured_image: featuredImage || null,
        status: 'draft',
        content_blocks: {
          ...templateContentBlocks,
          _settings: templateSettings,
          show_featured_image: templateContentBlocks.show_featured_image ?? true,
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
      onSuccess(toSnakeCase(result.data) as Directory, continueToBuilder)
    } catch (err) {
      setError("Failed to create directory")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="template">Start from Template</Label>
          {templatesLoading ? (
            <div className="border-input mt-2 inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
              <Skeleton className="h-4 w-24 rounded-sm" />
              <ChevronDown className="size-4 opacity-50" />
            </div>
          ) : (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                <SelectItem value="blank">Blank</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

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
