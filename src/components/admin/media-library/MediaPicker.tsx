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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getMediaAction } from "@/lib/actions/media/media-actions"
import type { MediaData } from "@/lib/actions/media/media-actions"
import Image from "next/image"
import { Search, ImageIcon, VideoIcon, Upload, X, Play, Filter } from "lucide-react"
import { toast } from "sonner"

interface MediaPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMedia: (mediaUrl: string, altText?: string) => void
  currentMediaUrl?: string
  showVideos?: boolean
  // Legacy props for backward compatibility
  onSelectImage?: (imageUrl: string, altText?: string) => void
  currentImageUrl?: string
}

export function MediaPicker({ 
  open, 
  onOpenChange, 
  onSelectMedia, 
  onSelectImage, 
  currentMediaUrl, 
  currentImageUrl, 
  showVideos = true 
}: MediaPickerProps) {
  const [mediaFiles, setMediaFiles] = useState<MediaData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<MediaData | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')
  
  // Support legacy props
  const actualCurrentUrl = currentMediaUrl || currentImageUrl
  const actualOnSelect = onSelectMedia || onSelectImage
  
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
      const { data, error } = await getMediaAction()
      if (error) {
        toast.error(`Failed to load media: ${error}`)
      } else {
        setMediaFiles(data || [])
      }
    } catch (error) {
      toast.error('Failed to load media')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMedia = mediaFiles
    .filter(media => {
      // Filter by type
      if (!showVideos && media.file_type === 'video') return false
      if (filterType !== 'all' && media.file_type !== filterType) return false
      
      // Filter by search query
      return media.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (media.alt_text && media.alt_text.toLowerCase().includes(searchQuery.toLowerCase()))
    })
    .sort((a, b) => {
      // Move currently selected media to the front
      if (actualCurrentUrl && a.public_url === actualCurrentUrl) return -1
      if (actualCurrentUrl && b.public_url === actualCurrentUrl) return 1
      return 0
    })

  const handleSelectMedia = () => {
    if (selectedMedia && actualOnSelect) {
      actualOnSelect(selectedMedia.public_url, selectedMedia.alt_text || undefined)
      onOpenChange(false)
      setSelectedMedia(null)
      setSearchQuery('')
    }
  }

  const handleRemoveMedia = () => {
    if (actualOnSelect) {
      actualOnSelect('', undefined)
      onOpenChange(false)
      setSelectedMedia(null)
      setSearchQuery('')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type 
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = showVideos ? [...imageTypes, ...videoTypes] : imageTypes
    
    if (!allowedTypes.includes(file.type)) {
      const message = showVideos 
        ? 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.'
        : 'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG images are allowed.'
      toast.error(message)
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

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Media uploaded successfully!")
      
      // Select the newly uploaded media immediately
      if (actualOnSelect) {
        actualOnSelect(result.data.public_url, result.data.alt_text || undefined)
      }
      
      // Clean up upload state
      setUploadFile(null)
      setUploadPreview(null)
      setAltText('')
      
      // Close dialog
      onOpenChange(false)
      setSelectedMedia(null)
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
          <DialogTitle>{showVideos ? 'Select Media' : 'Select Image'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6">
            {/* Search, Filter and Upload */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={showVideos ? "Search media by name or alt text..." : "Search images by name or alt text..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="default">
                    <Filter className="w-4 h-4 mr-2" />
                    {filterType === 'all' ? 'All' : filterType === 'image' ? 'Images' : 'Videos'}
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

              <Button asChild>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept={showVideos ? "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska" : "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"}
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
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-muted border">
                      {uploadFile && uploadFile.type.startsWith('video/') ? (
                        <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                          <video 
                            src={uploadPreview} 
                            className="max-w-full max-h-full object-contain"
                            muted
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/50 rounded-full p-2">
                              <Play className="w-4 h-4 text-white fill-white" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Image
                          src={uploadPreview}
                          alt="Upload preview"
                          fill
                          className="object-contain"
                          sizes="96px"
                        />
                      )}
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
                      <Label htmlFor="alt-text" className="text-blue-900">
                        {uploadFile?.type.startsWith('video/') ? 'Description (Optional)' : 'Alt Text (Optional)'}
                      </Label>
                      <Input
                        id="alt-text"
                        placeholder={uploadFile?.type.startsWith('video/') 
                          ? "Describe this video..." 
                          : "Describe this image for accessibility..."
                        }
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
              ) : filteredMedia.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">
                    {searchQuery 
                      ? (showVideos ? 'No media found' : 'No images found')
                      : (showVideos ? 'No media available' : 'No images available')
                    }
                  </p>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery 
                      ? 'Try adjusting your search terms'
                      : (showVideos ? "You haven't uploaded any media yet." : "You haven't uploaded any images yet.")
                    }
                  </p>
                  <Button asChild>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept={showVideos ? "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska" : "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"}
                        onChange={handleFileSelect}
                      />
                      {showVideos ? 'Upload Your First Media File' : 'Upload Your First Image'}
                    </label>
                  </Button>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto p-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredMedia.map((media) => (
                      <div
                        key={media.id}
                        className={`
                          relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all bg-muted
                          ${selectedMedia?.id === media.id 
                            ? 'border-primary ring-2 ring-primary/20' 
                            : 'border-transparent hover:border-muted-foreground/20'
                          }
                          ${actualCurrentUrl === media.public_url ? 'ring-2 ring-green-500/50' : ''}
                        `}
                        onClick={() => setSelectedMedia(media)}
                      >
                        {media.file_type === 'video' ? (
                          <div className="relative w-full h-full bg-black">
                            <video 
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
                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                          />
                        )}
                        {actualCurrentUrl === media.public_url && (
                          <div className="absolute top-2 right-2">
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              Current
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                          {selectedMedia?.id === media.id && (
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
          {actualCurrentUrl && (
            <Button variant="outline" onClick={handleRemoveMedia}>
              {showVideos ? 'Remove Media' : 'Remove Image'}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectMedia}
            disabled={!selectedMedia}
          >
            {showVideos ? 'Select Media' : 'Select Image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Legacy export for backward compatibility
export const ImagePicker = MediaPicker