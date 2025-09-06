"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Grid, List, Image as ImageIcon, Trash2, Edit, Play, VideoIcon, Filter } from "lucide-react"
import { getMediaAction, deleteImageAction, updateImageAction } from "@/lib/actions/media/media-actions"
import type { MediaData } from "@/lib/actions/media/media-actions"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


export default function ImagesPage() {
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('gallery')
  const [images, setImages] = useState<MediaData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')
  const [editingImage, setEditingImage] = useState<MediaData | null>(null)
  const [editAltText, setEditAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Load images on mount
  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await getMediaAction()
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

  const handleDeleteImage = async (image: MediaData) => {
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

  const handleEditImage = (image: MediaData) => {
    setEditingImage(image)
    setEditAltText(image.alt_text || '')
  }

  const handleSaveEdit = async () => {
    if (!editingImage) return

    try {
      const { data, error } = await updateImageAction(editingImage.id, {
        alt_text: editAltText.trim() || undefined
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
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.')
      return
    }
    
    const fileType = imageTypes.includes(file.type) ? 'image' : 'video'

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      toast.error(`File size too large. Maximum size is ${maxSizeLabel}.`)
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

  const filteredImages = images.filter((media) => {
    if (filterType === 'all') return true
    return media.file_type === filterType
  })

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
          title="Media Library"
          subtitle="Manage images and videos for all your sites"
          primaryAction={{
            label: isUploading ? "Uploading..." : "Upload Media",
            onClick: isUploading ? undefined : () => document.getElementById('image-upload-input')?.click()
          }}
        />
        
        {/* Hidden file input */}
        <input
          id="image-upload-input"
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
          onChange={handleImageUpload}
          className="hidden"
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              {isLoading ? (
                <div className="h-6 bg-muted rounded animate-pulse w-48"></div>
              ) : (
                <h3 className="text-lg font-semibold">Media Library ({filteredImages.length})</h3>
              )}
              <div className="flex items-center space-x-4">
                {/* Filter Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="w-4 h-4 mr-2" />
                      {filterType === 'all' ? 'All Media' : filterType === 'image' ? 'Images' : 'Videos'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setFilterType('all')}>
                      All Media
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('image')}>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Images Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('video')}>
                      <VideoIcon className="w-4 h-4 mr-2" />
                      Videos Only
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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
            // Skeleton loading states
            viewMode === 'gallery' ? (
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="relative bg-muted rounded-lg overflow-hidden aspect-square animate-pulse">
                      <div className="absolute inset-0 bg-muted"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="p-6 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-muted rounded-lg animate-pulse"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-32"></div>
                        <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="h-8 w-16 bg-muted rounded animate-pulse"></div>
                      <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredImages.length === 0 ? (
            <div className="p-6 text-center">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">No media found</p>
              <p className="text-muted-foreground mb-4">
                You haven&apos;t uploaded any images or videos yet.
              </p>
              <Button onClick={() => document.getElementById('image-upload-input')?.click()}>
                Upload Your First Media File
              </Button>
            </div>
          ) : viewMode === 'gallery' ? (
            // Gallery View
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredImages.map((media) => (
                  <div key={media.id} className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                    {media.file_type === 'video' ? (
                      <div className="relative w-full h-full bg-black">
                        <video 
                          key={media.id}
                          src={`/api/media/proxy?url=${encodeURIComponent(media.public_url)}`}
                          className="w-full h-full object-contain"
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = 0.1;
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <VideoIcon className="w-4 h-4 text-white drop-shadow-lg" />
                        </div>
                      </div>
                    ) : (
                      <Image
                        src={media.public_url}
                        alt={media.alt_text || media.original_name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEditImage(media)}
                          className="cursor-pointer"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteImage(media)}
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
              {filteredImages.map((media) => (
                <div key={media.id} className="p-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden relative">
                      {media.file_type === 'video' ? (
                        <video 
                          src={`/api/media/proxy?url=${encodeURIComponent(media.public_url)}`}
                          className="w-full h-full object-contain"
                          muted
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = 0.1;
                          }}
                        />
                      ) : (
                        <Image
                          src={media.public_url}
                          alt={media.alt_text || media.original_name}
                          fill
                          className="object-contain"
                          sizes="64px"
                        />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium">{media.original_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(media.file_size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditImage(media)}
                      className="cursor-pointer"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteImage(media)}
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
              <DialogTitle>{editingImage?.file_type === 'video' ? 'Edit Video' : 'Edit Image'}</DialogTitle>
            </DialogHeader>
            {editingImage && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  {editingImage.file_type === 'video' ? (
                    <video
                      src={`/api/media/proxy?url=${encodeURIComponent(editingImage.public_url)}`}
                      className="w-full h-full object-contain"
                      controls
                      muted
                    />
                  ) : (
                    <Image
                      src={editingImage.public_url}
                      alt={editingImage.alt_text || editingImage.original_name}
                      fill
                      className="object-contain"
                    />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-alt-text">
                    {editingImage.file_type === 'video' ? 'Description' : 'Alt Text'}
                  </Label>
                  <Input
                    id="edit-alt-text"
                    value={editAltText}
                    onChange={(e) => setEditAltText(e.target.value)}
                    placeholder={editingImage.file_type === 'video' ? 'Describe this video...' : 'Describe this image for accessibility'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editingImage.file_type === 'video' 
                      ? 'Description helps with organization and accessibility'
                      : 'Alt text helps screen readers and improves SEO'
                    }
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