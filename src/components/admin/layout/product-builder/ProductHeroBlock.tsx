"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon, GripVertical } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Reorder } from "motion/react"

interface ProductHeroBlockProps {
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
  rainbowButtonText: string
  rainbowButtonIcon: string
  githubLink: string
  showParticles: boolean
  trustedByText: string
  trustedByTextColor: string
  trustedByCount: string
  trustedByAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }>
  backgroundPattern: string
  backgroundPatternSize: string
  backgroundPatternOpacity: number
  backgroundPatternColor: string
  heroImage: string
  showHeroImage: boolean
  showTrustedByBadge: boolean
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
  onRainbowButtonTextChange: (value: string) => void
  onRainbowButtonIconChange: (value: string) => void
  onGithubLinkChange: (value: string) => void
  onShowParticlesChange: (value: boolean) => void
  onTrustedByTextChange: (value: string) => void
  onTrustedByTextColorChange: (value: string) => void
  onTrustedByCountChange: (value: string) => void
  onTrustedByAvatarsChange: (avatars: Array<{ src: string; alt: string; fallback: string; id?: string }>) => void
  onBackgroundPatternChange: (value: string) => void
  onBackgroundPatternSizeChange: (value: string) => void
  onBackgroundPatternOpacityChange: (value: number) => void
  onBackgroundPatternColorChange: (value: string) => void
  onHeroImageChange: (value: string) => void
  onShowHeroImageChange: (value: boolean) => void
  onShowTrustedByBadgeChange: (value: boolean) => void
  siteId: string
  blockId: string
}

// Helper functions
const validateUrl = (value: string, onChange: (value: string) => void) => {
  const trimmed = value.trim()
  
  // Allow empty URLs
  if (trimmed === '') {
    onChange(trimmed)
    return
  }
  
  // Allow relative URLs starting with /
  if (trimmed.startsWith('/')) {
    onChange(trimmed)
    return
  }
  
  // Allow full HTTP/HTTPS URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    onChange(trimmed)
    return
  }
  
  // Block dangerous protocols immediately
  if (trimmed.toLowerCase().includes('javascript:') || 
      trimmed.toLowerCase().includes('data:') || 
      trimmed.toLowerCase().includes('vbscript:')) {
    return // Don't update - block dangerous input
  }
  
  // Allow partial typing for other cases (like "h", "ht", "htt", etc.)
  onChange(trimmed)
}

const validateHexColor = (value: string, onChange: (value: string) => void) => {
  const trimmed = value.trim()
  if (trimmed === '' || /^#[0-9A-Fa-f]{6}$/.test(trimmed) || /^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    onChange(trimmed)
  }
}

// Reusable button style selector
const ButtonStyleSelect = ({ value, onChange }: { value: string; onChange: (value: 'primary' | 'outline' | 'ghost') => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="primary">Primary</SelectItem>
      <SelectItem value="outline">Outline</SelectItem>
      <SelectItem value="ghost">Ghost</SelectItem>
    </SelectContent>
  </Select>
)

export function ProductHeroBlock({
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
  rainbowButtonText,
  rainbowButtonIcon,
  githubLink,
  showParticles,
  trustedByText,
  trustedByTextColor,
  trustedByCount,
  trustedByAvatars,
  backgroundPattern,
  backgroundPatternSize,
  backgroundPatternOpacity,
  backgroundPatternColor,
  heroImage,
  showHeroImage,
  showTrustedByBadge,
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
  onRainbowButtonTextChange,
  onRainbowButtonIconChange,
  onGithubLinkChange,
  onShowParticlesChange,
  onTrustedByTextChange,
  onTrustedByTextColorChange,
  onTrustedByCountChange,
  onTrustedByAvatarsChange,
  onBackgroundPatternChange,
  onBackgroundPatternSizeChange,
  onBackgroundPatternOpacityChange,
  onBackgroundPatternColorChange,
  onHeroImageChange,
  onShowHeroImageChange,
  onShowTrustedByBadgeChange,
  siteId,
  blockId,
}: ProductHeroBlockProps) {
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const [showHeroImagePicker, setShowHeroImagePicker] = useState(false)
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

  // Update the ref with current avatars when they change
  useEffect(() => {
    previousAvatarsRef.current = [...trustedByAvatars]
  }, [trustedByAvatars])

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

  // Handle hero image changes
  const handleHeroImageChange = async (newImageUrl: string) => {
    onHeroImageChange(newImageUrl)
  }


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
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Build Exceptional Interfaces with Ease"
              required
            />
          </div>

          {/* Hero Subtitle */}
          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
            <textarea
              id="heroSubtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
              rows={3}
              required
            />
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
                onChange={(e) => validateUrl(e.target.value, onPrimaryButtonLinkChange)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="https://example.com or /page"
              />
              <ButtonStyleSelect value={primaryButtonStyle} onChange={onPrimaryButtonStyleChange} />
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
                onChange={(e) => validateUrl(e.target.value, onSecondaryButtonLinkChange)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="https://example.com or /page"
              />
              <ButtonStyleSelect value={secondaryButtonStyle} onChange={onSecondaryButtonStyleChange} />
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
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="badgeText">Badge Text</Label>
                <input
                  id="badgeText"
                  type="text"
                  value={trustedByText}
                  onChange={(e) => onTrustedByTextChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md mt-1"
                  placeholder="Badge text (e.g., 'Trusted by developers')"
                />
              </div>
              <div className="flex flex-col items-center">
                <Label className="text-xs">Text Color</Label>
                <input
                  type="color"
                  value={trustedByTextColor}
                  onChange={(e) => onTrustedByTextColorChange(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer shadow-sm border-0 p-1 mt-1"
                />
              </div>
              <div className="flex flex-col items-center">
                <Label className="text-xs">BG Color</Label>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => onBackgroundColorChange(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer shadow-sm border-0 p-1 mt-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero Image Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Hero Image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="relative">
              {heroImage ? (
                <div 
                  className="relative rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowHeroImagePicker(true)}
                >
                  <img 
                    src={heroImage} 
                    alt="Hero preview" 
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                    <div className="text-white text-center">
                      <ImageIcon className="mx-auto h-8 w-8 mb-2" />
                      <p className="text-sm font-medium">Click to change image</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                  onClick={() => setShowHeroImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to select image</p>
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              Display a hero image below the hero content with animated reveal effect
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Rainbow Button Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Rainbow Button</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Rainbow Button Settings</Label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={rainbowButtonText}
                onChange={(e) => onRainbowButtonTextChange(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="Button text"
              />
              <Select
                value={rainbowButtonIcon}
                onValueChange={onRainbowButtonIconChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Icon</SelectItem>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="arrow-right">Arrow Right</SelectItem>
                  <SelectItem value="download">Download</SelectItem>
                  <SelectItem value="external-link">External Link</SelectItem>
                  <SelectItem value="star">Star</SelectItem>
                  <SelectItem value="rocket">Rocket</SelectItem>
                  <SelectItem value="zap">Zap</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="url"
                value={githubLink}
                onChange={(e) => validateUrl(e.target.value, onGithubLinkChange)}
                className="px-3 py-2 border rounded-md text-sm"
                placeholder="Button link URL"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Add text to display a rainbow call-to-action button
          </p>
        </CardContent>
      </Card>

      {/* Background Pattern Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Background Pattern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Pattern Type</Label>
              <Select
                value={backgroundPattern || 'none'}
                onValueChange={onBackgroundPatternChange}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Background</SelectItem>
                  <SelectItem value="dots">Dots</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {backgroundPattern !== 'none' && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Size</Label>
                  <Select
                    value={backgroundPatternSize || 'medium'}
                    onValueChange={onBackgroundPatternSizeChange}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Opacity</Label>
                  <div className="flex items-center space-x-1 h-9">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={backgroundPatternOpacity || 80}
                      onChange={(e) => onBackgroundPatternOpacityChange(parseInt(e.target.value))}
                      className="flex-1 h-2"
                    />
                    <span className="text-xs text-muted-foreground w-8 text-right">
                      {backgroundPatternOpacity || 80}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="color"
                      value={backgroundPatternColor || '#a3a3a3'}
                      onChange={(e) => onBackgroundPatternColorChange(e.target.value)}
                      className="w-9 h-9 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={backgroundPatternColor || '#a3a3a3'}
                      onChange={(e) => onBackgroundPatternColorChange(e.target.value)}
                      className="px-2 py-1 border rounded text-xs flex-1"
                      placeholder="#a3a3a3"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground">
            Choose a background pattern or select "No Background" for a clean look
          </p>
        </CardContent>
      </Card>

      {/* Image Picker Modal for Avatars */}
      <ImagePicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectImage={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
        currentImageUrl={showPicker !== null ? trustedByAvatars[showPicker]?.src : undefined}
      />
      
      {/* Image Picker Modal for Hero Image */}
      <ImagePicker
        open={showHeroImagePicker}
        onOpenChange={setShowHeroImagePicker}
        onSelectImage={(imageUrl) => {
          handleHeroImageChange(imageUrl)
          setShowHeroImagePicker(false)
        }}
        currentImageUrl={heroImage}
      />
    </div>
  )
}