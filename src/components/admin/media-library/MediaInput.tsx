"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MediaPicker } from "./MediaPicker"
import { ImageIcon, VideoIcon, X, Play } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"

interface MediaInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  siteId?: string
  blockType?: string
  usageContext?: string
  acceptVideo?: boolean // Allow videos in addition to images
}

export function MediaInput({ 
  label, 
  value, 
  onChange, 
  placeholder = "Enter media URL or select from library",
  description,
  siteId,
  blockType,
  usageContext,
  acceptVideo = true
}: MediaInputProps) {
  const [showPicker, setShowPicker] = useState(false)

  const handleSelectMedia = (mediaUrl: string, altText?: string) => {
    onChange(mediaUrl)
  }

  const handleClearMedia = () => {
    onChange('')
  }

  const isValidMediaUrl = (url: string) => {
    return url && url.length > 0 && (url.startsWith('http') || url.startsWith('/'))
  }

  const getMediaType = (url: string): 'image' | 'video' | 'unknown' => {
    if (!url) return 'unknown'
    const ext = url.split('.').pop()?.toLowerCase()
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
    
    if (videoExts.includes(ext || '')) return 'video'
    if (imageExts.includes(ext || '')) return 'image'
    return 'unknown'
  }

  const shouldShowPreview = (url: string) => {
    if (!url || url.length === 0) return false
    
    // Don't show preview for default placeholder paths that might not exist
    if (url === '/images/logo.png') return false
    
    return isValidMediaUrl(url)
  }

  const mediaType = getMediaType(value)

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      
      {/* Current Media Preview */}
      {shouldShowPreview(value) && (
        <div className="relative group">
          <div className="relative aspect-video max-w-xs rounded-lg overflow-hidden bg-muted border">
            {mediaType === 'video' ? (
              <>
                <video
                  src={value}
                  className="w-full h-full object-cover"
                  controls={false}
                  muted
                  loop
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 rounded-full p-3">
                    <Play className="w-6 h-6 text-white fill-white" />
                  </div>
                </div>
              </>
            ) : (
              <Image
                src={value}
                alt={label}
                fill
                className="object-cover"
                sizes="(max-width: 384px) 100vw, 384px"
                onError={(e) => {
                  // Handle image load error by hiding the image
                  const imgElement = e.currentTarget
                  imgElement.style.display = 'none'
                  // Show fallback message
                  const parent = imgElement.parentElement
                  if (parent && !parent.querySelector('.media-error')) {
                    const errorDiv = document.createElement('div')
                    errorDiv.className = 'media-error flex items-center justify-center h-full text-muted-foreground text-sm'
                    errorDiv.innerHTML = '<div class="text-center"><svg class="w-8 h-8 mx-auto mb-2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><p>Media not found</p></div>'
                    parent.appendChild(errorDiv)
                  }
                }}
              />
            )}
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleClearMedia}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* URL Input */}
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2"
        >
          <ImageIcon className="w-4 h-4" />
          Library
        </Button>
      </div>

      {/* Empty State */}
      {!shouldShowPreview(value) && (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
          <div className="flex justify-center gap-2 mb-3">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
            {acceptVideo && <VideoIcon className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              No {acceptVideo ? 'media' : 'image'} selected
            </p>
            <div className="flex justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPicker(true)}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Choose from Library
              </Button>
            </div>
          </div>
        </div>
      )}

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Media Picker Dialog */}
      <MediaPicker
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelectMedia={handleSelectMedia}
        currentMediaUrl={value}
        showVideos={acceptVideo}
      />
    </div>
  )
}

// Legacy export for backward compatibility
export const ImageInput = MediaInput