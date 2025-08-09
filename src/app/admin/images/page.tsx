"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Grid, List, Image as ImageIcon, Trash2, Edit, MoreHorizontal } from "lucide-react"
import { getImagesAction, deleteImageAction, updateImageAction } from "@/lib/actions/image-actions"
import type { ImageData } from "@/lib/actions/image-actions"
import Image from "next/image"
import { toast } from "sonner"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
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
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [images, setImages] = useState<ImageData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [editingImage, setEditingImage] = useState<ImageData | null>(null)
  const [editAltText, setEditAltText] = useState('')

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
    if (image.usage_count > 0) {
      toast.error('Cannot delete image that is currently being used in sites')
      return
    }

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

  const filteredImages = images.filter(image => {
    switch (filter) {
      case 'used':
        return image.usage_count > 0
      case 'unused':
        return image.usage_count === 0
      default:
        return true
    }
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
          title="Image Library"
          subtitle="Manage images for all your sites"
          primaryAction={{
            label: "Add Image",
            href: "/admin/images/new"
          }}
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
                
                {/* Filter Toggle */}
                <div className="relative">
                  <Button 
                    variant="outline"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span>Filter</span>
                    <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <button 
                          onClick={() => {
                            setFilter('all')
                            setIsFilterOpen(false)
                          }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${filter === 'all' ? 'bg-muted' : ''}`}
                        >
                          All Images ({images.length})
                        </button>
                        <button 
                          onClick={() => {
                            setFilter('used')
                            setIsFilterOpen(false)
                          }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${filter === 'used' ? 'bg-muted' : ''}`}
                        >
                          Used Images ({images.filter(img => img.usage_count > 0).length})
                        </button>
                        <button 
                          onClick={() => {
                            setFilter('unused')
                            setIsFilterOpen(false)
                          }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${filter === 'unused' ? 'bg-muted' : ''}`}
                        >
                          Unused Images ({images.filter(img => img.usage_count === 0).length})
                        </button>
                      </div>
                    </div>
                  )}
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
                {filter === 'all' 
                  ? "You haven't uploaded any images yet."
                  : `No ${filter} images found.`
                }
              </p>
              {filter === 'all' && (
                <Button asChild>
                  <a href="/admin/images/new">Upload Your First Image</a>
                </Button>
              )}
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
                      <div className="text-white text-center text-sm p-2">
                        <p className="font-medium truncate">{image.original_name}</p>
                        <p className="text-xs">
                          {image.usage_count > 0 
                            ? `Used in ${image.sites_using} site${image.sites_using !== 1 ? 's' : ''}`
                            : 'Unused'
                          }
                        </p>
                        <div className="flex justify-center space-x-2 mt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEditImage(image)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteImage(image)}
                            disabled={image.usage_count > 0}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span 
                        className={`px-2 py-1 text-xs rounded-full ${
                          image.usage_count > 0 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {image.usage_count > 0 ? 'Used' : 'Unused'}
                      </span>
                    </div>
                    <div className="absolute top-2 left-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-8 h-8 p-0"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleEditImage(image)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteImage(image)}
                            disabled={image.usage_count > 0}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                        {image.filename} • {formatFileSize(image.file_size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-muted-foreground">
                      {image.usage_count > 0 
                        ? `Used in ${image.sites_using} site${image.sites_using !== 1 ? 's' : ''}`
                        : 'Not used'
                      }
                    </span>
                    <span 
                      className={`px-2 py-1 text-xs rounded-full ${
                        image.usage_count > 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {image.usage_count > 0 ? 'Used' : 'Unused'}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditImage(image)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteImage(image)}
                          disabled={image.usage_count > 0}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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