"use client"

import { useState, useEffect } from "react"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ImagePicker } from "@/components/admin/image-library/ImagePicker"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/PageRichTextEditorBlock"
import { ImageIcon, X, Check } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { updateEventAction } from "@/lib/actions/events/event-actions"
import type { Event } from "@/lib/actions/events/event-actions"

interface EventSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: Event | null
  site: any | null
  onSuccess?: (updatedEvent: Event) => void
}

export function EventSettingsModal({ 
  open, 
  onOpenChange, 
  event, 
  site,
  onSuccess 
}: EventSettingsModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    meta_description: ''
  })
  const [richTextContent, setRichTextContent] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
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
    if (event) {
      setFormData({
        title: event.title || '',
        slug: event.slug || '',
        description: event.description || '',
        meta_description: event.meta_description || ''
      })
      setFeaturedImage(event.featured_image || '')
      setIsPrivate(event.content_blocks?._settings?.is_private === true)
      setRichTextContent(event.description || '')
      setSlugManuallyEdited(false)
    }
  }, [event])

  // Save as draft
  const handleSaveDraft = async () => {
    if (!event) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)
      
      // Update content_blocks with is_private setting and rich text
      const updatedContentBlocks = {
        ...event.content_blocks,
        _settings: {
          ...event.content_blocks?._settings,
          is_private: isPrivate
        }
      }

      
      const draftData = { 
        ...formData, 
        description: richTextContent || null,
        is_published: false,
        featured_image: featuredImage || null,
        content_blocks: updatedContentBlocks
      }
      const { data, error: actionError } = await updateEventAction(event.id, draftData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        setSaveMessage('Event saved as draft successfully!')
        
        // Call success callback with updated event
        if (onSuccess) {
          onSuccess(data)
        }
        
        // Clear success message after 3 seconds but keep modal open
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      }
    } catch (err) {
      setError('Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  // Publish event
  const handlePublish = async () => {
    if (!event) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)
      
      // Update content_blocks with is_private setting and rich text
      const updatedContentBlocks = {
        ...event.content_blocks,
        _settings: {
          ...event.content_blocks?._settings,
          is_private: isPrivate
        }
      }

      
      const publishData = { 
        ...formData, 
        description: richTextContent || null,
        is_published: true,
        featured_image: featuredImage || null,
        content_blocks: updatedContentBlocks
      }
      const { data, error: actionError } = await updateEventAction(event.id, publishData)
      
      if (actionError) {
        setError(actionError)
        return
      }
      
      if (data) {
        setSaveMessage(event?.is_published ? 'Event saved successfully!' : 'Event published successfully!')
        
        // Call success callback with updated event
        if (onSuccess) {
          onSuccess(data)
        }
        
        // Clear success message after 3 seconds but keep modal open
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      }
    } catch (err) {
      setError('Failed to publish event')
    } finally {
      setSaving(false)
    }
  }

  // Handle form submission (default to save as draft)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveDraft()
  }

  if (!event) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
             onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}>
          <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-6 relative my-8"
               style={{ width: '840px', maxWidth: '95vw' }}
               onClick={(e) => e.stopPropagation()}>
            <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
        <DialogHeader className="mb-6">
          <DialogTitle className="flex items-center gap-3">
            Configure settings for &quot;{event.title}&quot;
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                event?.is_published ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium">
                {event?.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Configure the basic settings for this event
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Event Title */}
              <div className="space-y-2">
                <Label htmlFor="modal-title">Event Title *</Label>
                <Input
                  id="modal-title"
                  value={formData.title || ''}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter event title"
                  required
                />
              </div>

              {/* Event Slug */}
              <div className="space-y-2">
                <Label htmlFor="modal-slug">Event URL</Label>
                <Input
                  id="modal-slug"
                  value={formData.slug || ''}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="event-url-slug"
                />
                <p className="text-xs text-muted-foreground">
                  {slugManuallyEdited 
                    ? "Custom URL slug. Clear this field to auto-generate from title again." 
                    : "Auto-generated from title. You can edit this to customize the URL."}
                </p>
              </div>

              {/* Featured Image */}
              <div className="space-y-2">
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
                <p className="text-xs text-muted-foreground">
                  Optional featured image for this event
                </p>
              </div>

              {/* Privacy Settings */}
              <div className="space-y-2">
                <Label>Privacy Settings</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="modal-is-private"
                    checked={isPrivate}
                    onCheckedChange={(checked) => {
                      setIsPrivate(!!checked)
                    }}
                  />
                  <Label htmlFor="modal-is-private" className="text-sm font-normal">
                    Private (accessible only via direct URL, hidden from event listings)
                  </Label>
                </div>
              </div>

              {/* Rich Text Content */}
              <div className="space-y-2">
                <Label htmlFor="rich_text">Event Description</Label>
                <PageRichTextEditorBlock
                  content={{
                    content: richTextContent,
                    hideHeader: true,
                    hideEditorHeader: true
                  }}
                  onContentChange={(content) => {
                    setRichTextContent(content.content)
                  }}
                  compact={true}
                />
                <p className="text-xs text-muted-foreground">
                  Rich text content for the event description (will be saved as an event block)
                </p>
              </div>

              {/* Meta Description */}
              <div className="space-y-2">
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
                <p className="text-xs text-muted-foreground">
                  Used for SEO. Keep it under 160 characters. Currently: {formData.meta_description.length}/160
                </p>
              </div>
                
            </CardContent>
          </Card>

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
                {saving ? 'Saving...' : event?.is_published ? 'Save' : 'Publish'}
              </Button>
            </div>
          </div>
        </form>

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
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  )
}