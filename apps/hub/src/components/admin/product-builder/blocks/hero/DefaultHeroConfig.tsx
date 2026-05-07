"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Plus, Trash2, ImageIcon, GripVertical, X } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
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
import type { HeroStyleAdminProps } from "."

// Sortable avatar item component
function SortableAvatarItem({
  avatar,
  index,
  removeAvatar,
  onOpenImagePicker
}: {
  avatar: { src: string; alt: string; fallback: string; id?: string }
  index: number
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
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
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

export function DefaultHeroConfig({ config, onConfigChange }: HeroStyleAdminProps) {
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const [showHeroImagePicker, setShowHeroImagePicker] = useState(false)

  const heroImage = config.heroImage || ''
  const trustedByText = config.trustedByText || ''
  const trustedByAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }> = useMemo(
    () => config.trustedByAvatars || [],
    [config.trustedByAvatars]
  )
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
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Trusted By Badge</h3>
        </div>

        {trustedByAvatars.length === 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">
              No avatars.
            </div>
            <button
              type="button"
              onClick={addAvatar}
              className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
              aria-label="Add trusted by avatar"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleAvatarDragEnd}
          >
            <SortableContext
              items={trustedByAvatars.map(a => a.id || '')}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-wrap items-center gap-2">
                {trustedByAvatars.map((avatar, index) => (
                  <SortableAvatarItem
                    key={avatar.id || `avatar-${index}`}
                    avatar={avatar}
                    index={index}
                    removeAvatar={removeAvatar}
                    onOpenImagePicker={setShowPicker}
                  />
                ))}
                <button
                  type="button"
                  onClick={addAvatar}
                  className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                  aria-label="Add trusted by avatar"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Field>
          <FieldLabel htmlFor="badgeText">Badge Text</FieldLabel>
          <Input
            id="badgeText"
            type="text"
            value={trustedByText}
            onChange={(e) => onConfigChange('trustedByText', e.target.value)}
            placeholder="Badge text (e.g., 'Trusted by developers')"
          />
        </Field>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Hero Image</h3>
        </div>

        <div className="relative">
          {heroImage ? (
            <div
              className="relative w-[100px] h-[100px] rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setShowHeroImagePicker(true)}
            >
              <img
                src={heroImage}
                alt="Hero preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                <div className="text-white text-center">
                  <ImageIcon className="mx-auto h-6 w-6 mb-1" />
                  <p className="text-xs font-medium">Click to change image</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigChange('heroImage', '');
                }}
                className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-sm transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center justify-center w-[100px] h-[100px] rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
              onClick={() => setShowHeroImagePicker(true)}
            >
              <div className="text-center">
                <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-1 text-xs text-muted-foreground">Click to select image</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Background Pattern</h3>
        </div>

        <div className="inline-flex items-end gap-3">
          <Field className="w-[180px]">
            <FieldLabel className="text-xs">Pattern Type</FieldLabel>
            <Select
              value={backgroundPattern || 'none'}
              onValueChange={(v) => onConfigChange('backgroundPattern', v)}
            >
              <SelectTrigger size="button">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Background</SelectItem>
                <SelectItem value="dots">Dots</SelectItem>
                <SelectItem value="grid">Grid</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {backgroundPattern !== 'none' && (
            <>
              <Field className="w-[140px]">
                <FieldLabel className="text-xs">Size</FieldLabel>
                <Select
                  value={backgroundPatternSize || 'medium'}
                  onValueChange={(v) => onConfigChange('backgroundPatternSize', v)}
                >
                  <SelectTrigger size="button">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field className="w-[112px]">
                <FieldLabel className="text-xs">Opacity</FieldLabel>
                <div className="flex items-center space-x-2">
                  <Input
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
                    className="h-10 w-20 text-sm"
                    placeholder="80"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </Field>
            </>
          )}
        </div>
      </section>

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
