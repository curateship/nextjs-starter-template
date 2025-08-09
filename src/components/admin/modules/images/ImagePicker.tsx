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
  const [activeTab, setActiveTab] = useState('library')
  
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

  const filteredImages = images.filter(image => 
    image.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (image.alt_text && image.alt_text.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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

    // Validate file type (SVG removed due to XSS risks)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.')
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
    
    // Switch to upload tab
    setActiveTab('upload')
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
    setActiveTab('library')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Select Image</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search images by name or alt text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

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
                  <Button onClick={() => setActiveTab('upload')}>
                    Upload Your First Image
                  </Button>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto p-4">
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
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            {/* File Upload Area */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
              {!uploadFile ? (
                <div className="text-center">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <div className="space-y-2">
                    <p className="text-lg font-medium">Upload a new image</p>
                    <p className="text-sm text-muted-foreground">
                      Choose a file to upload to your image library
                    </p>
                    <div className="pt-2">
                      <Button asChild>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            onChange={handleFileSelect}
                          />
                          Choose File
                        </label>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JPEG, PNG, GIF, WebP up to 10MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preview */}
                  {uploadPreview && (
                    <div className="relative aspect-video max-w-sm mx-auto rounded-lg overflow-hidden bg-muted">
                      <Image
                        src={uploadPreview}
                        alt="Upload preview"
                        fill
                        className="object-cover"
                        sizes="(max-width: 400px) 100vw, 400px"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleClearUpload}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* File info */}
                  <div className="text-center space-y-2">
                    <p className="font-medium">{uploadFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>

                  {/* Alt text input */}
                  <div className="space-y-2">
                    <Label htmlFor="alt-text">Alt Text (Optional)</Label>
                    <Input
                      id="alt-text"
                      placeholder="Describe this image for accessibility..."
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                    />
                  </div>

                  {/* Upload actions */}
                  <div className="flex gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearUpload}
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleUpload}
                      disabled={isUploading}
                    >
                      {isUploading ? 'Uploading...' : 'Upload & Select'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Selected image info */}
        {selectedImage && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-16 h-16 relative rounded overflow-hidden bg-background">
                <Image
                  src={selectedImage.public_url}
                  alt={selectedImage.alt_text || selectedImage.original_name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedImage.original_name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedImage.file_size / (1024 * 1024)).toFixed(2)} MB
                </p>
                {selectedImage.alt_text && (
                  <p className="text-sm text-muted-foreground truncate">
                    Alt: {selectedImage.alt_text}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
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
        )}
      </DialogContent>
    </Dialog>
  )
}