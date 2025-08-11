"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ImagePicker } from "@/components/admin/modules/images/ImagePicker"
import { Plus, X, ImageIcon } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { trackImageUsageAction, removeImageUsageAction, getImageByUrlAction } from "@/lib/actions/image-actions"

interface HeroRuixenBlockProps {
  title: string
  subtitle: string
  primaryButton: string
  secondaryButton: string
  primaryButtonLink: string
  secondaryButtonLink: string
  backgroundColor: string
  showRainbowButton: boolean
  githubLink: string
  showParticles: boolean
  trustedByText: string
  trustedByCount: string
  trustedByAvatars: Array<{ src: string; alt: string; fallback: string }>
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onPrimaryButtonChange: (value: string) => void
  onSecondaryButtonChange: (value: string) => void
  onPrimaryButtonLinkChange: (value: string) => void
  onSecondaryButtonLinkChange: (value: string) => void
  onBackgroundColorChange: (value: string) => void
  onShowRainbowButtonChange: (value: boolean) => void
  onGithubLinkChange: (value: string) => void
  onShowParticlesChange: (value: boolean) => void
  onTrustedByTextChange: (value: string) => void
  onTrustedByCountChange: (value: string) => void
  onTrustedByAvatarsChange: (avatars: Array<{ src: string; alt: string; fallback: string }>) => void
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
  const previousAvatarsRef = useRef<Array<{ src: string; alt: string; fallback: string }>>(trustedByAvatars)

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
    const newAvatars = [...trustedByAvatars, { src: "", alt: `User ${trustedByAvatars.length + 1}`, fallback: `U${trustedByAvatars.length + 1}` }]
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


  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Hero Section</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
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

        {/* Background Color */}
        <div className="space-y-2 pt-2">
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

        {/* CTA Buttons */}
        <div className="space-y-4 pt-2">
          <h3 className="text-base font-semibold">Call-to-Action Buttons</h3>
          
          <div className="space-y-4">
            {/* Primary Button */}
            <div className="space-y-2">
              <Label>Primary Button</Label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={primaryButton}
                  onChange={(e) => onPrimaryButtonChange(e.target.value)}
                  className="px-3 py-2 border rounded-md"
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
                  className="px-3 py-2 border rounded-md"
                  placeholder="https://example.com or /page"
                />
              </div>
            </div>
            
            {/* Secondary Button */}
            <div className="space-y-2">
              <Label>Secondary Button</Label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={secondaryButton}
                  onChange={(e) => onSecondaryButtonChange(e.target.value)}
                  className="px-3 py-2 border rounded-md"
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
                  className="px-3 py-2 border rounded-md"
                  placeholder="https://example.com or /page"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rainbow Button Settings */}
        <div className="space-y-4 pt-2">
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
          
          {showRainbowButton && (
            <div className="space-y-2">
              <Label htmlFor="githubLink">GitHub Link</Label>
              <input
                id="githubLink"
                type="url"
                value={githubLink}
                onChange={(e) => onGithubLinkChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="https://github.com/ruixenui/ruixen-free-components"
              />
              <p className="text-xs text-muted-foreground">
                Link for the &ldquo;Get Access to Everything&rdquo; button
              </p>
            </div>
          )}
        </div>

        {/* Visual Effects */}
        <div className="space-y-4 pt-2">
          <h3 className="text-base font-semibold">Visual Effects</h3>
          
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
        </div>

        {/* Trusted By Section */}
        <div className="space-y-4 pt-2">
          <h3 className="text-base font-semibold">Trusted By Badge</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trustedByCount">Count</Label>
              <input
                id="trustedByCount"
                type="text"
                value={trustedByCount}
                onChange={(e) => onTrustedByCountChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="10k+"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trustedByText">Text</Label>
              <input
                id="trustedByText"
                type="text"
                value={trustedByText}
                onChange={(e) => onTrustedByTextChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="users"
              />
            </div>
          </div>

          {/* Avatar Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Avatar Images</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAvatar}
                className="h-8"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Avatar
              </Button>
            </div>
            <div className="space-y-2">
              {trustedByAvatars.map((avatar, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatar.src} alt={avatar.alt} />
                    <AvatarFallback>{avatar.fallback}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 flex gap-2">
                    <Input
                      value={avatar.src}
                      onChange={(e) => updateAvatar(index, e.target.value)}
                      placeholder={`Avatar ${index + 1} URL`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPicker(index)}
                      className="h-10 w-10 p-0"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAvatar(index)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {trustedByAvatars.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No avatars. Click "Add Avatar" to add one.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to show default gray circles with initials
            </p>
          </div>
        </div>

        {/* Image Picker Modal */}
        <ImagePicker
          open={showPicker !== null}
          onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
          onSelectImage={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
          currentImageUrl={showPicker !== null ? trustedByAvatars[showPicker]?.src : undefined}
        />
      </CardContent>
    </Card>
  )
}