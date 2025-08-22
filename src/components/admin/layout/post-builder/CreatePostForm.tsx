import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { Post } from "@/lib/actions/post-actions"

interface CreatePostFormProps {
  siteId: string
  onSuccess: (post: Post) => void
  onCancel: () => void
}

export function CreatePostForm({ siteId, onSuccess, onCancel }: CreatePostFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    meta_description: '',
    featured_image: '',
    excerpt: '',
    is_published: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      setError('Post title is required')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      // Mock creation for UI testing
      const newPost: Post = {
        id: `post-${Date.now()}`,
        site_id: siteId,
        title: formData.title,
        slug: formData.slug || generateSlug(formData.title),
        meta_description: formData.meta_description || null,
        featured_image: formData.featured_image || null,
        excerpt: formData.excerpt || null,
        content: null,
        is_published: formData.is_published,
        display_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      onSuccess(newPost)
    } catch (err) {
      setError('Failed to create post')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="title">Post Title *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Enter post title"
          required
        />
      </div>

      <div>
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
      </div>

      <div>
        <Label htmlFor="excerpt">Post Excerpt</Label>
        <Textarea
          id="excerpt"
          value={formData.excerpt}
          onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
          placeholder="Brief summary of your post"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="featured_image">Featured Image URL</Label>
        <Input
          id="featured_image"
          value={formData.featured_image}
          onChange={(e) => setFormData(prev => ({ ...prev, featured_image: e.target.value }))}
          placeholder="Enter image URL"
        />
      </div>

      <div>
        <Label htmlFor="meta_description">Meta Description</Label>
        <Textarea
          id="meta_description"
          value={formData.meta_description}
          onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
          placeholder="SEO description for search engines"
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_published"
          checked={formData.is_published}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_published: checked }))}
        />
        <Label htmlFor="is_published">Publish immediately</Label>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Post'}
        </Button>
      </div>
    </form>
  )
}