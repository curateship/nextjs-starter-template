"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getPaginatedMediaAction } from "@/lib/actions/media/media-actions"
import type { MediaData, PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import Image from "@/components/app-image"
import { resolveMediaPlaybackUrl } from "@/lib/utils/media-url"
import Search from "lucide-react/dist/esm/icons/search.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import VideoIcon from "lucide-react/dist/esm/icons/video.js"
import Upload from "lucide-react/dist/esm/icons/upload.js"
import X from "lucide-react/dist/esm/icons/x.js"
import Play from "lucide-react/dist/esm/icons/play.js"
import Filter from "lucide-react/dist/esm/icons/funnel.js"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface MediaPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMedia: (mediaUrl: string, altText?: string) => void
  currentMediaUrl?: string
  showVideos?: boolean
  site_id?: string
  siteId?: string
  onUploadDeferred?: (file: File, altText?: string) => void
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
  showVideos = true,
  site_id,
  siteId,
  onUploadDeferred
}: MediaPickerProps) {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [paginatedData, setPaginatedData] = useState<PaginatedMediaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<MediaData | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'svg'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(12) // Smaller page size for modal
  const requestedSiteId = site_id || siteId || currentSite?.id
  const scopedSiteId = requestedSiteId && UUID_REGEX.test(requestedSiteId) ? requestedSiteId : undefined

  // Support legacy props
  const actualCurrentUrl = currentMediaUrl || currentImageUrl
  const actualOnSelect = onSelectMedia || onSelectImage

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const loadImages = useCallback(async () => {
    try {
      setIsLoading(true)
      if (!scopedSiteId) {
        setPaginatedData({ data: [], total: 0, page: currentPage, pageSize, totalPages: 0 })
        return
      }

      const fileType = filterType === 'all' || filterType === 'svg' ? undefined : filterType as 'image' | 'video'
      const mimeType = filterType === 'svg' ? 'image/svg+xml' : undefined
      const { data, error } = await getPaginatedMediaAction(currentPage, pageSize, fileType, scopedSiteId, mimeType)

      if (error) {
        showActionError(`Failed to load media: ${error}`)
      } else {
        setPaginatedData(data)
      }
    } catch (error) {
      showActionError('Failed to load media')
    } finally {
      setIsLoading(false)
    }
  }, [scopedSiteId, currentPage, pageSize, filterType])

  // Load images when dialog opens or pagination/filter changes
  useEffect(() => {
    if (open && !siteLoading) {
      loadImages()
      return
    }

    // Reset state when dialog closes
    setCurrentPage(1)
    setSearchQuery('')
    setSelectedMedia(null)
  }, [open, siteLoading, loadImages])

  // Get current media from paginated data and apply search filtering
  const mediaFiles = paginatedData?.data || []
  const filteredMedia = mediaFiles
    .filter(media => {
      // Filter by video support
      if (!showVideos && media.file_type === 'video') return false

      // Filter by search query (client-side for now)
      if (!searchQuery) return true
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
    }
  }

  const handleRemoveMedia = () => {
    if (actualOnSelect) {
      actualOnSelect('', undefined)
      onOpenChange(false)
    }
  }

  // Handle filter change - reset to page 1
  const handleFilterChange = (newFilter: 'all' | 'image' | 'video' | 'svg') => {
    setFilterType(newFilter)
    setCurrentPage(1)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
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
      showActionError(message)
      return
    }

    const fileType = imageTypes.includes(file.type) ? 'image' : 'video'

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      showActionError(`File size too large. Maximum size is ${maxSizeLabel}.`)
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
    if (!scopedSiteId) {
      if (onUploadDeferred) {
        onUploadDeferred(uploadFile, altText.trim() || undefined)
        setUploadFile(null)
        setUploadPreview(null)
        setAltText('')
        onOpenChange(false)
        return
      }

      showActionError('Select a site before uploading media')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (altText.trim()) {
        formData.append('altText', altText.trim())
      }
      formData.append('siteId', scopedSiteId)

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      showActionSuccess("Media uploaded successfully!")

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

    } catch (error) {
      showActionError(error instanceof Error ? error.message : 'Upload failed')
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
      <DialogContent
        data-media-picker-dialog="true"
        className="max-w-[800px]! max-h-[85vh]! w-[90vw] max-sm:!inset-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-screen max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!border-0 max-sm:!p-4 max-sm:flex max-sm:flex-col max-sm:overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{showVideos ? 'Select Media' : 'Select Image'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:overflow-hidden">
            {/* Search, Filter and Upload */}
            <div className="flex gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={showVideos ? "Search media by name or alt text..." : "Search images by name or alt text..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter Dropdown */}
              {showVideos && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      className="shrink-0 px-3 sm:px-4"
                      aria-label="Filter media"
                    >
                      <Filter className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {filterType === 'all' ? 'All' : filterType === 'image' ? 'Images' : filterType === 'video' ? 'Videos' : 'SVG'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleFilterChange('all')}>
                      All Media
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('image')}>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Images Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('video')}>
                      <VideoIcon className="w-4 h-4 mr-2" />
                      Videos Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('svg')}>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      SVG Only
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button asChild className="shrink-0 px-3 sm:px-4">
                <label className="cursor-pointer" aria-label="Upload media">
                  <input
                    type="file"
                    className="hidden"
                    accept={showVideos ? "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska" : "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"}
                    onChange={handleFileSelect}
                  />
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Upload</span>
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
                      ) : uploadFile?.type === 'image/svg+xml' ? (
                        <img
                          src={uploadPreview}
                          alt="Upload preview"
                          className="h-full w-full object-contain"
                        />
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
                      {isUploading
                        ? 'Uploading...'
                        : !scopedSiteId && onUploadDeferred
                          ? 'Use This File'
                          : 'Upload & Select'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Image Grid */}
            <div className="overflow-hidden rounded-lg border max-sm:min-h-0 max-sm:flex-1 max-sm:rounded-none max-sm:border-0">
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
                <ScrollArea className="h-[60vh] max-sm:h-full">
                  <div className="p-3 sm:p-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {filteredMedia.map((media) => (
                        <div
                          key={media.id}
                          className={`
                            relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all bg-muted
                            ${selectedMedia?.id === media.id
                              ? 'border-green-500 ring-2 ring-green-500/20'
                              : 'border-transparent hover:border-muted-foreground/20'
                            }
                            ${actualCurrentUrl === media.public_url ? 'ring-2 ring-green-500/50' : ''}
                          `}
                          onClick={() => setSelectedMedia(media)}
                        >
                          {media.file_type === 'video' ? (
                            <div className="relative w-full h-full bg-black">
                              <video
                                src={resolveMediaPlaybackUrl(media.public_url)}
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
                          ) : media.mime_type === 'image/svg+xml' ? (
                            <img
                              src={media.public_url}
                              alt={media.alt_text || media.original_name}
                              className="h-full w-full object-contain"
                            />
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
                </ScrollArea>
              )}
            </div>

            {/* Pagination Controls */}
            {paginatedData && paginatedData.totalPages > 1 && (
              <div className="mt-4 flex shrink-0 flex-col items-center justify-between gap-3 sm:flex-row">
                <PaginationInfo
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={paginatedData.total}
                  className="text-center text-sm sm:text-left"
                />
                <Pagination
                  currentPage={currentPage}
                  totalPages={paginatedData.totalPages}
                  onPageChange={handlePageChange}
                  showFirstLast={false}
                  maxVisiblePages={3}
                  className="max-w-full gap-1 space-x-0"
                />
              </div>
            )}
        </div>


        <DialogFooter className="shrink-0">
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
