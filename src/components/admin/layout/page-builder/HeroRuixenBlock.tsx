"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/modules/images/ImagePicker"
import { Plus, Trash2, ImageIcon, GripVertical } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Reorder } from "motion/react"
import { trackImageUsageAction, removeImageUsageAction, getImageByUrlAction } from "@/lib/actions/image-actions"

interface HeroRuixenBlockProps {
  title: string
  subtitle: string
  primaryButton: string
  secondaryButton: string
  primaryButtonLink: string
  secondaryButtonLink: string
  primaryButtonStyle: 'primary' | 'outline' | 'ghost'
  secondaryButtonStyle: 'primary' | 'outline' | 'ghost'
  backgroundColor: string
  showRainbowButton: boolean
  githubLink: string
  showParticles: boolean
  trustedByText: string
  trustedByCount: string
  trustedByAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }>
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onPrimaryButtonChange: (value: string) => void
  onSecondaryButtonChange: (value: string) => void
  onPrimaryButtonLinkChange: (value: string) => void
  onSecondaryButtonLinkChange: (value: string) => void
  onPrimaryButtonStyleChange: (value: 'primary' | 'outline' | 'ghost') => void
  onSecondaryButtonStyleChange: (value: 'primary' | 'outline' | 'ghost') => void
  onBackgroundColorChange: (value: string) => void
  onShowRainbowButtonChange: (value: boolean) => void
  onGithubLinkChange: (value: string) => void
  onShowParticlesChange: (value: boolean) => void
  onTrustedByTextChange: (value: string) => void
  onTrustedByCountChange: (value: string) => void
  onTrustedByAvatarsChange: (avatars: Array<{ src: string; alt: string; fallback: string; id?: string }>) => void
  siteId: string
  blockId: string
}

export function HeroRuixenBlock({
  title,
  subtitle,
  primaryButton,
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  primaryButtonStyle,
  secondaryButtonStyle,
  backgroundColor,
  showRainbowButton,
  githubLink,
  showParticles,
  trustedByText,
  trustedByCount,
  trustedByAvatars,
  onTitleChange,
  onSubtitleChange,
  onPrimaryButtonChange,
  onSecondaryButtonChange,
  onPrimaryButtonLinkChange,
  onSecondaryButtonLinkChange,
  onPrimaryButtonStyleChange,
  onSecondaryButtonStyleChange,
  onBackgroundColorChange,
  onShowRainbowButtonChange,
  onGithubLinkChange,
  onShowParticlesChange,
  onTrustedByTextChange,
  onTrustedByCountChange,
  onTrustedByAvatarsChange,
  siteId,
  blockId,
}: HeroRuixenBlockProps) {
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const previousAvatarsRef = useRef<Array<{ src: string; alt: string; fallback: string; id?: string }>>(trustedByAvatars)

  // Ensure all avatars have unique IDs
  useEffect(() => {
    const avatarsNeedIds = trustedByAvatars.some(avatar => !avatar.id)
    if (avatarsNeedIds) {
      const avatarsWithIds = trustedByAvatars.map((avatar, index) => ({
        ...avatar,
        id: avatar.id || `avatar-${Date.now()}-${index}-${Math.random()}`
      }))
      onTrustedByAvatarsChange(avatarsWithIds)
    }
  }, [trustedByAvatars, onTrustedByAvatarsChange])

  // Track avatar usage when avatars change
  useEffect(() => {
    const trackAvatarUsage = async () => {
      if (!siteId) return

      const previousAvatars = previousAvatarsRef.current

      try {
        console.log('Tracking avatar usage:', { 
          current: trustedByAvatars.map(a => ({ src: a.src, hasUrl: !!a.src })), 
          previous: previousAvatars.map(a => ({ src: a.src, hasUrl: !!a.src }))
        })

        // Track changes for each avatar position
        for (let i = 0; i < Math.max(trustedByAvatars.length, previousAvatars.length); i++) {
          const currentAvatar = trustedByAvatars[i]
          const previousAvatar = previousAvatars[i]

          // If previous avatar exists but current doesn't, remove tracking
          if (previousAvatar?.src && !currentAvatar) {
            console.log(`Removing tracking for avatar ${i}: ${previousAvatar.src}`)
            const { data: imageId } = await getImageByUrlAction(previousAvatar.src)
            if (imageId) {
              const result = await removeImageUsageAction(imageId, siteId, "hero-ruixen", `avatar-${i}`)
              console.log(`Remove result:`, result)
            }
          }
          // If both exist but URLs changed, remove old and add new
          else if (previousAvatar?.src && currentAvatar?.src && previousAvatar.src !== currentAvatar.src) {
            console.log(`Updating tracking for avatar ${i}: ${previousAvatar.src} -> ${currentAvatar.src}`)
            const { data: oldImageId } = await getImageByUrlAction(previousAvatar.src)
            if (oldImageId) {
              await removeImageUsageAction(oldImageId, siteId, "hero-ruixen", `avatar-${i}`)
            }
            const { data: newImageId } = await getImageByUrlAction(currentAvatar.src)
            if (newImageId) {
              const result = await trackImageUsageAction(newImageId, siteId, "hero-ruixen", `avatar-${i}`)
              console.log(`Track result:`, result)
              // Force refresh image library data
              if (typeof window !== 'undefined') {
                fetch('/admin/images', { method: 'POST', body: '' }).catch(() => {})
              }
            }
          }
          // If only current exists (new avatar), add tracking
          else if (!previousAvatar?.src && currentAvatar?.src) {
            console.log(`Adding tracking for new avatar ${i}: ${currentAvatar.src}`)
            const { data: imageId } = await getImageByUrlAction(currentAvatar.src)
            if (imageId) {
              const result = await trackImageUsageAction(imageId, siteId, "hero-ruixen", `avatar-${i}`)
              console.log(`Track result:`, result)
              // Force refresh image library data
              if (typeof window !== 'undefined') {
                fetch('/admin/images', { method: 'POST', body: '' }).catch(() => {})
              }
            } else {
              console.log(`No image ID found for: ${currentAvatar.src}`)
            }
          }
          // If current has a src and previous didn't have one OR it's the initial load with existing avatars
          else if (currentAvatar?.src && (!previousAvatar || !previousAvatar.src)) {
            console.log(`Adding tracking for avatar ${i} (initial or empty->filled): ${currentAvatar.src}`)
            const { data: imageId } = await getImageByUrlAction(currentAvatar.src)
            if (imageId) {
              const result = await trackImageUsageAction(imageId, siteId, "hero-ruixen", `avatar-${i}`)
              console.log(`Track result:`, result)
              // Force refresh image library data
              if (typeof window !== 'undefined') {
                fetch('/admin/images', { method: 'POST', body: '' }).catch(() => {})
              }
            }
          }
        }

        // Update the ref with current avatars
        previousAvatarsRef.current = [...trustedByAvatars]
      } catch (error) {
        console.error('Error tracking avatar usage:', error)
      }
    }

    trackAvatarUsage()
  }, [trustedByAvatars, siteId])

  const addAvatar = () => {
    const newAvatars = [...trustedByAvatars, { 
      src: "", 
      alt: `User ${trustedByAvatars.length + 1}`, 
      fallback: `U${trustedByAvatars.length + 1}`,
      id: `avatar-${Date.now()}-${Math.random()}`
    }]
    onTrustedByAvatarsChange(newAvatars)
  }

  const removeAvatar = (index: number) => {
    const newAvatars = trustedByAvatars.filter((_, i) => i !== index)
    onTrustedByAvatarsChange(newAvatars)
  }

  const updateAvatar = (index: number, src: string) => {
    const newAvatars = [...trustedByAvatars]
    newAvatars[index] = { ...newAvatars[index], src }
    onTrustedByAvatarsChange(newAvatars)
  }

  const handleSelectImage = (imageUrl: string, index: number) => {
    updateAvatar(index, imageUrl)
    setShowPicker(null)
  }

  const avatarsTimeoutRef = useRef<NodeJS.Timeout>()
  const handleReorderAvatars = useCallback((reorderedAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }>) => {
    // Clear previous timeout
    if (avatarsTimeoutRef.current) {
      clearTimeout(avatarsTimeoutRef.current)
    }
    
    // Set new timeout to debounce the save
    avatarsTimeoutRef.current = setTimeout(() => {
      // Ensure IDs are preserved in reordered avatars
      const reorderedWithIds = reorderedAvatars.map(avatar => ({
        ...avatar,
        id: avatar.id || `avatar-${Date.now()}-${Math.random()}`
      }))
      onTrustedByAvatarsChange(reorderedWithIds)
    }, 300)
  }, [onTrustedByAvatarsChange])


  return (
    <div className="space-y-4">
      {/* Text Content Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Text Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hero Title */}
          <div className="space-y-2">
            <Label htmlFor="heroTitle">Hero Title</Label>
            <input
              id="heroTitle"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Build Exceptional Interfaces with Ease"
              required
            />
            <p className="text-xs text-muted-foreground">
              Main heading displayed in large text
            </p>
          </div>

          {/* Hero Subtitle */}
          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
            <textarea
              id="heroSubtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              Description text below the main heading
            </p>
          </div>

          {/* Primary Button */}
          <div className="space-y-2">
            <Label>Primary Button</Label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={primaryButton}
                onChange={(e) => onPrimaryButtonChange(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="Get Started"
                required
              />
              <input
                type="url"
                value={primaryButtonLink}
                onChange={(e) => {
                  const value = e.target.value.trim()
                  // Basic URL validation - allow relative paths and http/https URLs
                  if (value === '' || value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://')) {
                    onPrimaryButtonLinkChange(value)
                  }
                }}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="https://example.com or /page"
              />
              <Select
                value={primaryButtonStyle}
                onValueChange={(value) => onPrimaryButtonStyleChange(value as 'primary' | 'outline' | 'ghost')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                  <SelectItem value="ghost">Ghost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Secondary Button */}
          <div className="space-y-2">
            <Label>Secondary Button</Label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={secondaryButton}
                onChange={(e) => onSecondaryButtonChange(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="Browse Components"
                required
              />
              <input
                type="url"
                value={secondaryButtonLink}
                onChange={(e) => {
                  const value = e.target.value.trim()
                  // Basic URL validation - allow relative paths and http/https URLs
                  if (value === '' || value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://')) {
                    onSecondaryButtonLinkChange(value)
                  }
                }}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="https://example.com or /page"
              />
              <Select
                value={secondaryButtonStyle}
                onValueChange={(value) => onSecondaryButtonStyleChange(value as 'primary' | 'outline' | 'ghost')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                  <SelectItem value="ghost">Ghost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Trusted By Section Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Trusted By Badge</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAvatar}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Avatar Management */}
          <Reorder.Group 
            axis="y" 
            values={trustedByAvatars} 
            onReorder={handleReorderAvatars}
            className="space-y-2"
          >
            {trustedByAvatars.map((avatar, index) => (
              <Reorder.Item 
                key={avatar.id || `avatar-${index}`}
                value={avatar}
                className="border rounded-lg p-3 transition-colors hover:border-muted-foreground cursor-pointer"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000
                }}
                style={{ cursor: "grab" }}
              >
                <div className="flex items-center gap-3">
                  <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatar.src} alt={avatar.alt} />
                    <AvatarFallback>{avatar.fallback}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Input
                      value={avatar.src}
                      onChange={(e) => updateAvatar(index, e.target.value)}
                      placeholder={`Avatar ${index + 1} URL`}
                      className="w-full"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPicker(index)}
                    className="h-8 w-8 p-0 flex items-center justify-center"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAvatar(index)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          
          {trustedByAvatars.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              No avatars. Click + to add one.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="badgeText">Badge Text</Label>
            <input
              id="badgeText"
              type="text"
              value={trustedByText}
              onChange={(e) => onTrustedByTextChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Badge text (e.g., 'Trusted by developers')"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Leave empty to show default gray circles with initials
          </p>
        </CardContent>
      </Card>

      {/* Style Settings Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Style Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Background Color */}
          <div className="space-y-2">
            <Label htmlFor="backgroundColor">Avatar Group Background</Label>
            <div className="flex gap-2 items-center">
              <input
                id="backgroundColor"
                type="color"
                value={backgroundColor}
                onChange={(e) => onBackgroundColorChange(e.target.value)}
                className="w-12 h-10 rounded cursor-pointer shadow-sm border-0 p-1"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => {
                  const value = e.target.value.trim()
                  // Validate hex color format
                  if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value)) {
                    onBackgroundColorChange(value)
                  }
                }}
                className="flex-1 px-3 py-2 border rounded-md font-mono text-sm"
                placeholder="#ffffff"
                pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Background color for the trusted by avatars section
            </p>
          </div>

          {/* Rainbow Button */}
          <div className="flex items-center space-x-2">
            <input
              id="showRainbowButton"
              type="checkbox"
              checked={showRainbowButton}
              onChange={(e) => onShowRainbowButtonChange(e.target.checked)}
              className="mr-2"
            />
            <Label htmlFor="showRainbowButton">Show Rainbow Button</Label>
          </div>

          {/* Floating Particles */}
          <div className="flex items-center space-x-2">
            <input
              id="showParticles"
              type="checkbox"
              checked={showParticles}
              onChange={(e) => onShowParticlesChange(e.target.checked)}
              className="mr-2"
            />
            <Label htmlFor="showParticles">Show Floating Particles</Label>
          </div>

          {/* GitHub Link (conditional) */}
          {showRainbowButton && (
            <div className="space-y-2">
              <Label htmlFor="githubLink">GitHub Link</Label>
              <input
                id="githubLink"
                type="url"
                value={githubLink}
                onChange={(e) => onGithubLinkChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="https://github.com/ruixenui/ruixen-free-components"
              />
              <p className="text-xs text-muted-foreground">
                Link for the &ldquo;Get Access to Everything&rdquo; button
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Picker Modal */}
      <ImagePicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectImage={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
        currentImageUrl={showPicker !== null ? trustedByAvatars[showPicker]?.src : undefined}
      />
    </div>
  )
}