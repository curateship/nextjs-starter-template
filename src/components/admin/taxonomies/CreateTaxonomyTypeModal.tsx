"use client"

import { useState } from "react"
import { createTaxonomyTypeAction, type TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface CreateTaxonomyTypeModalProps {
  siteId: string
  onClose: () => void
  onCreated: (taxonomyType: TaxonomyType) => void
}

export function CreateTaxonomyTypeModal({
  siteId,
  onClose,
  onCreated
}: CreateTaxonomyTypeModalProps) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [isHierarchical, setIsHierarchical] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = (value: string) => {
    setName(value)
    // Auto-generate slug if user hasn't manually edited it
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { data, error: createError } = await createTaxonomyTypeAction(siteId, {
        name,
        slug,
        description: description || undefined,
        is_hierarchical: isHierarchical
      })

      if (createError) {
        setError(createError)
        setIsSubmitting(false)
        return
      }

      if (data) {
        onCreated(data)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create taxonomy type')
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Taxonomy Type</DialogTitle>
            <DialogDescription>
              Create a new taxonomy type to organize your content. Examples: Location, Business Category, Features.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Location, Business Category"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for this taxonomy type
              </p>
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="location, business-category"
                value={slug}
                onChange={(e) => setSlug(generateSlug(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (auto-generated from name)
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this taxonomy is used for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Hierarchical */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hierarchical"
                checked={isHierarchical}
                onCheckedChange={(checked) => setIsHierarchical(checked as boolean)}
              />
              <Label
                htmlFor="hierarchical"
                className="text-sm font-normal cursor-pointer"
              >
                Hierarchical (supports parent/child relationships)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Enable this for nested categories like Country &gt; City or Category &gt; Subcategory
            </p>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Taxonomy Type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
