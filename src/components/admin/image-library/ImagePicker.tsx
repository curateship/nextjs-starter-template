"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { 
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { getImagesAction } from "@/lib/actions/image-actions"
import type { ImageData } from "@/lib/actions/image-actions"
import Image from "next/image"
import { Search, ImageIcon, Upload, X } from "lucide-react"
import { toast } from "sonner"

interface ImagePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectImage: (imageUrl: string, altText?: string) => void
  currentImageUrl?: string
}

export function ImagePicker({ open, onOpenChange, onSelectImage, currentImageUrl }: ImagePickerProps) {
  const [images, setImages] = useState<ImageData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)
  
  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Load images when dialog opens
  useEffect(() => {
    if (open) {
      loadImages()
    }
  }, [open])

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

  const filteredImages = images
    .filter(image => 
      image.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (image.alt_text && image.alt_text.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      // Move currently selected image to the front
      if (currentImageUrl && a.public_url === currentImageUrl) return -1
      if (currentImageUrl && b.public_url === currentImageUrl) return 1
      return 0
    })

  const handleSelectImage = () => {
    if (selectedImage) {
      onSelectImage(selectedImage.public_url, selectedImage.alt_text || undefined)
      onOpenChange(false)
      setSelectedImage(null)
      setSearchQuery('')
    }
  }

  const handleRemoveImage = () => {
    onSelectImage('', undefined)
    onOpenChange(false)
    setSelectedImage(null)
    setSearchQuery('')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploadFile(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setUploadPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    
    // File is ready for upload, we'll show upload UI inline
  }

  const handleUpload = async () => {
    if (!uploadFile) return

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (altText.trim()) {
        formData.append('altText', altText.trim())
      }

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Image uploaded successfully!")
      
      // Select the newly uploaded image immediately
      onSelectImage(result.data.public_url, result.data.alt_text || undefined)
      
      // Clean up upload state
      setUploadFile(null)
      setUploadPreview(null)
      setAltText('')
      
      // Close dialog
      onOpenChange(false)
      setSelectedImage(null)
      setSearchQuery('')

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClearUpload = () => {
    setUploadFile(null)
    setUploadPreview(null)
    setAltText('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[800px] !max-h-[85vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle>Select Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6">
            {/* Search and Upload */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search images by name or alt text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button asChild>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                    onChange={handleFileSelect}
                  />
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </label>
              </Button>
            </div>

            {/* Upload Preview (when file selected) */}
            {uploadFile && (
              <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-blue-900">Upload Preview</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearUpload}
                    className="text-blue-700 hover:text-blue-900"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex gap-4">
                  {uploadPreview && (
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-white border">
                      <Image
                        src={uploadPreview}
                        alt="Upload preview"
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="font-medium text-blue-900">{uploadFile.name}</p>
                      <p className="text-sm text-blue-700">
                        {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    
                    <div>
                      <Label htmlFor="alt-text" className="text-blue-900">Alt Text (Optional)</Label>
                      <Input
                        id="alt-text"
                        placeholder="Describe this image for accessibility..."
                        value={altText}
                        onChange={(e) => setAltText(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    
                    <Button
                      onClick={handleUpload}
                      disabled={isUploading}
                      className="w-full"
                    >
                      {isUploading ? 'Uploading...' : 'Upload & Select'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Image Grid */}
            <div className="border rounded-lg overflow-hidden">
              {isLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <div className="text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
                    <p className="text-muted-foreground">Loading images...</p>
                  </div>
                </div>
              ) : filteredImages.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">
                    {searchQuery ? 'No images found' : 'No images available'}
                  </p>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery 
                      ? 'Try adjusting your search terms'
                      : "You haven't uploaded any images yet."
                    }
                  </p>
                  <Button asChild>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                        onChange={handleFileSelect}
                      />
                      Upload Your First Image
                    </label>
                  </Button>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto p-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredImages.map((image) => (
                      <div
                        key={image.id}
                        className={`
                          relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all
                          ${selectedImage?.id === image.id 
                            ? 'border-primary ring-2 ring-primary/20' 
                            : 'border-transparent hover:border-muted-foreground/20'
                          }
                          ${currentImageUrl === image.public_url ? 'ring-2 ring-green-500/50' : ''}
                        `}
                        onClick={() => setSelectedImage(image)}
                      >
                        <Image
                          src={image.public_url}
                          alt={image.alt_text || image.original_name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        />
                        {currentImageUrl === image.public_url && (
                          <div className="absolute top-2 right-2">
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              Current
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                          {selectedImage?.id === image.id && (
                            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>


        <DialogFooter>
          {currentImageUrl && (
            <Button variant="outline" onClick={handleRemoveImage}>
              Remove Image
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectImage}
            disabled={!selectedImage}
          >
            Select Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}