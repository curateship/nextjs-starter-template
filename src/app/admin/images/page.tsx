"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Grid, List, Image as ImageIcon, Trash2, Edit } from "lucide-react"
import { getImagesAction, deleteImageAction, updateImageAction } from "@/lib/actions/image-actions"
import type { ImageData } from "@/lib/actions/image-actions"
import Image from "next/image"
import { toast } from "sonner"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ImagesPage() {
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('gallery')
  const [images, setImages] = useState<ImageData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Removed usage-based filtering
  const [editingImage, setEditingImage] = useState<ImageData | null>(null)
  const [editAltText, setEditAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Load images on mount
  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await getImagesAction()
      if (error) {
        toast.error(`Failed to load images: ${error}`)
      } else {
        setImages(data || [])
      }
    } catch (error) {
      toast.error('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteImage = async (image: ImageData) => {
    if (!confirm(`Are you sure you want to delete "${image.original_name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const { success, error } = await deleteImageAction(image.id)
      if (error) {
        toast.error(`Failed to delete image: ${error}`)
      } else {
        toast.success('Image deleted successfully')
        setImages(images.filter(img => img.id !== image.id))
      }
    } catch (error) {
      toast.error('Failed to delete image')
    }
  }

  const handleEditImage = (image: ImageData) => {
    setEditingImage(image)
    setEditAltText(image.alt_text || '')
  }

  const handleSaveEdit = async () => {
    if (!editingImage) return

    try {
      const { data, error } = await updateImageAction(editingImage.id, {
        alt_text: editAltText.trim() || null
      })
      
      if (error) {
        toast.error(`Failed to update image: ${error}`)
      } else {
        toast.success('Image updated successfully')
        setImages(images.map(img => img.id === editingImage.id ? data! : img))
        setEditingImage(null)
        setEditAltText('')
      }
    } catch (error) {
      toast.error('Failed to update image')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG images are allowed.')
      return
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      toast.error('File size too large. Maximum size is 10MB.')
      return
    }

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Image uploaded successfully!")
      
      // Refresh the images list
      loadImages()

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      // Clear the input
      if (e.target) {
        e.target.value = ''
      }
    }
  }

  const filteredImages = images

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Image Library"
          subtitle="Manage images for all your sites"
          primaryAction={{
            label: isUploading ? "Uploading..." : "Upload Image",
            onClick: () => document.getElementById('image-upload-input')?.click(),
            disabled: isUploading
          }}
        />
        
        {/* Hidden file input */}
        <input
          id="image-upload-input"
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleImageUpload}
          className="hidden"
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Images Library ({filteredImages.length})</h3>
              <div className="flex items-center space-x-4">
                {/* View Mode Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-r-none"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'gallery' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('gallery')}
                    className="rounded-l-none"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {isLoading ? (
            <div className="p-6 flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
                <p className="text-muted-foreground">Loading images...</p>
              </div>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="p-6 text-center">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">No images found</p>
              <p className="text-muted-foreground mb-4">
                You haven&apos;t uploaded any images yet.
              </p>
              <Button onClick={() => document.getElementById('image-upload-input')?.click()}>
                Upload Your First Image
              </Button>
            </div>
          ) : viewMode === 'gallery' ? (
            // Gallery View
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredImages.map((image) => (
                  <div key={image.id} className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                    <Image
                      src={image.public_url}
                      alt={image.alt_text || image.original_name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEditImage(image)}
                          className="cursor-pointer"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteImage(image)}
                          className="cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // List View
            <div className="divide-y">
              {filteredImages.map((image) => (
                <div key={image.id} className="p-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden relative">
                      <Image
                        src={image.public_url}
                        alt={image.alt_text || image.original_name}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                    <div>
                      <h4 className="font-medium">{image.original_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(image.file_size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditImage(image)}
                      className="cursor-pointer"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteImage(image)}
                      className="cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        {/* Edit Image Dialog */}
        <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Image</DialogTitle>
            </DialogHeader>
            {editingImage && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  <Image
                    src={editingImage.public_url}
                    alt={editingImage.alt_text || editingImage.original_name}
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-alt-text">Alt Text</Label>
                  <Input
                    id="edit-alt-text"
                    value={editAltText}
                    onChange={(e) => setEditAltText(e.target.value)}
                    placeholder="Describe this image for accessibility"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alt text helps screen readers and improves SEO
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingImage(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}