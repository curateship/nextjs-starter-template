import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Post } from "@/lib/actions/post-actions"

interface PostSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: Post | null
  site: any
  onSuccess?: (post: Post) => void
}

export function PostSettingsModal({
  open,
  onOpenChange,
  post,
  site,
  onSuccess
}: PostSettingsModalProps) {
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

  useEffect(() => {
    if (post) {
      setFormData({
        title: post.title || '',
        slug: post.slug || '',
        meta_description: post.meta_description || '',
        featured_image: post.featured_image || '',
        excerpt: post.excerpt || '',
        is_published: post.is_published || false
      })
    }
  }, [post])

  const handleSave = async () => {
    if (!post) return
    
    setLoading(true)
    setError(null)
    
    try {
      // Mock save for UI testing
      const updatedPost: Post = {
        ...post,
        ...formData
      }
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      if (onSuccess) {
        onSuccess(updatedPost)
      }
      onOpenChange(false)
    } catch (err) {
      setError('Failed to update post')
    } finally {
      setLoading(false)
    }
  }

  if (!post) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post Settings</DialogTitle>
          <DialogDescription>
            Update your post settings and metadata.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Post Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter post title"
            />
          </div>

          <div>
            <Label htmlFor="slug">Post Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
              placeholder="post-url-slug"
            />
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
            <Label htmlFor="is_published">Published</Label>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}