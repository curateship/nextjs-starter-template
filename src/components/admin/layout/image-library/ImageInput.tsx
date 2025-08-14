"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImagePicker } from "./ImagePicker"
import { ImageIcon, X } from "lucide-react"
import Image from "next/image"
import { trackImageUsageAction, removeImageUsageAction, getImageByUrlAction } from "@/lib/actions/image-actions"
import { toast } from "sonner"

interface ImageInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  siteId?: string
  blockType?: string
  usageContext?: string
}

export function ImageInput({ 
  label, 
  value, 
  onChange, 
  placeholder = "Enter image URL or select from library",
  description,
  siteId,
  blockType,
  usageContext
}: ImageInputProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [previousImageUrl, setPreviousImageUrl] = useState(value)

  // Track/untrack image usage when value changes
  useEffect(() => {
    if (!siteId || !blockType || !usageContext) return
    
    const trackUsage = async () => {
      try {
        // Remove old usage if there was a previous image
        if (previousImageUrl && previousImageUrl !== value) {
          const { data: oldImageId } = await getImageByUrlAction(previousImageUrl)
          if (oldImageId) {
            await removeImageUsageAction(oldImageId, siteId, blockType, usageContext)
          }
        }

        // Track new usage if there's a new image  
        if (value && value !== previousImageUrl) {
          const { data: newImageId, error } = await getImageByUrlAction(value)
          if (newImageId) {
            const result = await trackImageUsageAction(newImageId, siteId, blockType, usageContext)
            if (result.error) {
              console.warn('Failed to track image usage:', result.error)
            }
          } else if (error && !error.includes('Image not found')) {
            // Only log errors that aren't "image not found" (which is normal for external URLs)
            console.warn('Failed to find image for tracking:', error)
          }
        }
        
        setPreviousImageUrl(value)
      } catch (error) {
        console.error('Error updating image usage:', error)
      }
    }

    trackUsage()
  }, [value, siteId, blockType, usageContext, previousImageUrl])

  const handleSelectImage = (imageUrl: string, altText?: string) => {
    onChange(imageUrl)
  }

  const handleClearImage = () => {
    onChange('')
  }

  const isValidImageUrl = (url: string) => {
    return url && url.length > 0 && (url.startsWith('http') || url.startsWith('/'))
  }

  const shouldShowPreview = (url: string) => {
    if (!url || url.length === 0) return false
    
    // Don't show preview for default placeholder paths that might not exist
    if (url === '/images/logo.png') return false
    
    return isValidImageUrl(url)
  }

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      
      {/* Current Image Preview */}
      {shouldShowPreview(value) && (
        <div className="relative group">
          <div className="relative aspect-video max-w-xs rounded-lg overflow-hidden bg-muted border">
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
                if (parent && !parent.querySelector('.image-error')) {
                  const errorDiv = document.createElement('div')
                  errorDiv.className = 'image-error flex items-center justify-center h-full text-muted-foreground text-sm'
                  errorDiv.innerHTML = '<div class="text-center"><svg class="w-8 h-8 mx-auto mb-2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><p>Image not found</p></div>'
                  parent.appendChild(errorDiv)
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleClearImage}
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
          <ImageIcon className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">No image selected</p>
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

      {/* Image Picker Dialog */}
      <ImagePicker
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelectImage={handleSelectImage}
        currentImageUrl={value}
      />
    </div>
  )
}