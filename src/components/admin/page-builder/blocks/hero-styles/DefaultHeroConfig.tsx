"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Plus, Trash2, ImageIcon, GripVertical } from "lucide-react"
import { useState, useEffect } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { HeroStyleAdminProps } from "./index"

// Helper
const validateUrl = (value: string, onChange: (value: string) => void) => {
  const trimmed = value.trim()
  if (trimmed === '') { onChange(trimmed); return }
  if (trimmed.startsWith('/')) { onChange(trimmed); return }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) { onChange(trimmed); return }
  if (trimmed.toLowerCase().includes('javascript:') ||
      trimmed.toLowerCase().includes('data:') ||
      trimmed.toLowerCase().includes('vbscript:')) { return }
  onChange(trimmed)
}

// Sortable avatar item component
function SortableAvatarItem({
  avatar,
  index,
  updateAvatar,
  removeAvatar,
  onOpenImagePicker
}: {
  avatar: { src: string; alt: string; fallback: string; id?: string }
  index: number
  updateAvatar: (index: number, src: string) => void
  removeAvatar: (index: number) => void
  onOpenImagePicker: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: avatar.id || `avatar-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 bg-background hover:border-muted-foreground/50 transition-colors"
    >
      <div className="flex gap-2 items-center">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onOpenImagePicker(index)}
        >
          {avatar.src ? (
            <Avatar className="h-10 w-10">
              <AvatarImage src={avatar.src} alt={avatar.alt} />
              <AvatarFallback>{avatar.fallback}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center hover:bg-muted/70 hover:border-muted-foreground/40 transition-all">
              <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeAvatar(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function DefaultHeroConfig({ config, onConfigChange, siteId, blockId }: HeroStyleAdminProps) {
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const [showHeroImagePicker, setShowHeroImagePicker] = useState(false)

  const heroImage = config.heroImage || ''
  const rainbowButtonText = config.rainbowButtonText || ''
  const rainbowButtonIcon = config.rainbowButtonIcon || 'star'
  const githubLink = config.githubLink || ''
  const trustedByText = config.trustedByText || ''
  const trustedByAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }> = config.trustedByAvatars || []
  const backgroundPattern = config.backgroundPattern || 'none'
  const backgroundPatternSize = config.backgroundPatternSize || 'medium'
  const backgroundPatternOpacity = config.backgroundPatternOpacity ?? 80

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Ensure all avatars have unique IDs
  useEffect(() => {
    const avatarsNeedIds = trustedByAvatars.some(avatar => !avatar.id)
    if (avatarsNeedIds) {
      const avatarsWithIds = trustedByAvatars.map((avatar, index) => ({
        ...avatar,
        id: avatar.id || `avatar-${Date.now()}-${index}-${Math.random()}`
      }))
      onConfigChange('trustedByAvatars', avatarsWithIds)
    }
  }, [trustedByAvatars, onConfigChange])

  const addAvatar = () => {
    const newAvatars = [...trustedByAvatars, {
      src: "",
      alt: `User ${trustedByAvatars.length + 1}`,
      fallback: `U${trustedByAvatars.length + 1}`,
      id: `avatar-${Date.now()}-${Math.random()}`
    }]
    onConfigChange('trustedByAvatars', newAvatars)
  }

  const removeAvatar = (index: number) => {
    const newAvatars = trustedByAvatars.filter((_, i) => i !== index)
    onConfigChange('trustedByAvatars', newAvatars)
  }

  const updateAvatar = (index: number, src: string) => {
    const newAvatars = [...trustedByAvatars]
    newAvatars[index] = { ...newAvatars[index], src }
    onConfigChange('trustedByAvatars', newAvatars)
  }

  const handleSelectImage = (imageUrl: string, index: number) => {
    updateAvatar(index, imageUrl)
    setShowPicker(null)
  }

  const handleAvatarDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = trustedByAvatars.findIndex((avatar) => avatar.id === active.id)
      const newIndex = trustedByAvatars.findIndex((avatar) => avatar.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onConfigChange('trustedByAvatars', arrayMove(trustedByAvatars, oldIndex, newIndex))
      }
    }
  }

  return (
    <div className="">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleAvatarDragEnd}
          >
            <SortableContext
              items={trustedByAvatars.map(a => a.id || '')}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-wrap gap-2">
                {trustedByAvatars.map((avatar, index) => (
                  <SortableAvatarItem
                    key={avatar.id || `avatar-${index}`}
                    avatar={avatar}
                    index={index}
                    updateAvatar={updateAvatar}
                    removeAvatar={removeAvatar}
                    onOpenImagePicker={setShowPicker}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

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
                  onChange={(e) => onConfigChange('trustedByText', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md mt-1"
                  placeholder="Badge text (e.g., 'Trusted by developers')"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero Image, Rainbow Button & Background Pattern Cards */}
      <div className="grid grid-cols-3">
        {/* Hero Image Card */}
        <Card className="shadow-sm mr-0">
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
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                      <div className="text-white text-center">
                        <ImageIcon className="mx-auto h-6 w-6 mb-1" />
                        <p className="text-xs font-medium">Click to change image</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                    onClick={() => setShowHeroImagePicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/50" />
                      <p className="mt-1 text-xs text-muted-foreground">Click to select image</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rainbow Button Card */}
        <Card className="shadow-sm mr-0">
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
                  onChange={(e) => onConfigChange('rainbowButtonText', e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                  placeholder="Button text"
                />
                <Select
                  value={rainbowButtonIcon}
                  onValueChange={(v) => onConfigChange('rainbowButtonIcon', v)}
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
                  onChange={(e) => validateUrl(e.target.value, (v) => onConfigChange('githubLink', v))}
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Pattern Type</Label>
                <Select
                  value={backgroundPattern || 'none'}
                  onValueChange={(v) => onConfigChange('backgroundPattern', v)}
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
                      onValueChange={(v) => onConfigChange('backgroundPatternSize', v)}
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
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={backgroundPatternOpacity}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value >= 0 && value <= 100) {
                            onConfigChange('backgroundPatternOpacity', value);
                          }
                        }}
                        className="w-20 px-2 py-1 border rounded-md text-sm"
                        placeholder="80"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Image Picker Modal for Avatars */}
      <MediaPicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectMedia={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
        currentMediaUrl={showPicker !== null ? trustedByAvatars[showPicker]?.src : undefined}
      />

      {/* Image Picker Modal for Hero Image */}
      <MediaPicker
        open={showHeroImagePicker}
        onOpenChange={setShowHeroImagePicker}
        onSelectMedia={(imageUrl) => {
          onConfigChange('heroImage', imageUrl)
          setShowHeroImagePicker(false)
        }}
        currentMediaUrl={heroImage}
      />
    </div>
  )
}
