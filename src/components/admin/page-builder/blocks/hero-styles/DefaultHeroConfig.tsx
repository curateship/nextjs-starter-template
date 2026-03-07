"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Plus, Trash2, ImageIcon, GripVertical, X } from "lucide-react"
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

  const alignment = config.alignment || 'center'
  const contentWidth = config.contentWidth || 'full'
  const contentMaxWidth = config.contentMaxWidth ?? 1152
  const heroImage = config.heroImage || ''
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
      {/* Alignment Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Content Alignment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {(['left', 'center', 'right'] as const).map((option) => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`alignment-${option}`}
                  checked={alignment === option}
                  onCheckedChange={() => onConfigChange('alignment', option)}
                />
                <Label htmlFor={`alignment-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Width Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Content Width</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Checkbox
              id="contentWidth"
              checked={contentWidth === 'fixed'}
              onCheckedChange={(checked) => onConfigChange('contentWidth', checked ? 'fixed' : 'full')}
            />
            <Label htmlFor="contentWidth" className="text-sm cursor-pointer">Constrain to fixed width</Label>
            {contentWidth === 'fixed' && (
              <>
                <input
                  type="number"
                  min="600"
                  max="2000"
                  value={config.contentMaxWidth ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      onConfigChange('contentMaxWidth', undefined);
                    } else {
                      const value = parseInt(raw);
                      if (!isNaN(value)) {
                        onConfigChange('contentMaxWidth', value);
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value);
                    if (isNaN(value)) return;
                    if (value < 600) onConfigChange('contentMaxWidth', 600);
                    else if (value > 2000) onConfigChange('contentMaxWidth', 2000);
                  }}
                  className="w-20 px-2 py-1 border rounded-md text-sm"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </>
            )}
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

      {/* Hero Background Image & Pattern Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Hero Background Image & Pattern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Image picker */}
          <div className="relative pb-2">
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

          {/* Image options */}
          {heroImage && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Image Alignment</Label>
                <div className="flex gap-4">
                  {(['left', 'center', 'right'] as const).map((option) => (
                    <div key={option} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`heroImageAlign-${option}`}
                        checked={(config.heroImageAlign || 'center') === option}
                        onCheckedChange={() => onConfigChange('heroImageAlign', option)}
                      />
                      <Label htmlFor={`heroImageAlign-${option}`} className="text-xs capitalize cursor-pointer">{option}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mobile Visibility</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="heroImageHideMobile"
                    checked={config.heroImageHideMobile === true}
                    onCheckedChange={(checked) => onConfigChange('heroImageHideMobile', !!checked)}
                  />
                  <Label htmlFor="heroImageHideMobile" className="text-xs cursor-pointer">Hide on mobile</Label>
                </div>
                {!config.heroImageHideMobile && (
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs whitespace-nowrap">Mobile Opacity</Label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={config.heroImageMobileOpacity ?? 100}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 0 && value <= 100) {
                          onConfigChange('heroImageMobileOpacity', value);
                        }
                      }}
                      className="w-16 px-2 py-1 border rounded-md text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Image Size</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="heroImageCustomSize"
                    checked={!!config.heroImageSize}
                    onCheckedChange={(checked) => onConfigChange('heroImageSize', checked ? 600 : null)}
                  />
                  <Label htmlFor="heroImageCustomSize" className="text-xs cursor-pointer">Custom size</Label>
                  {config.heroImageSize != null && (
                    <>
                      <input
                        type="number"
                        min="100"
                        max="2000"
                        value={config.heroImageSize ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            onConfigChange('heroImageSize', '');
                            return;
                          }
                          const value = parseInt(raw);
                          if (!isNaN(value)) {
                            onConfigChange('heroImageSize', value);
                          }
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          if (raw === '' || isNaN(parseInt(raw)) || parseInt(raw) < 100) {
                            onConfigChange('heroImageSize', 100);
                          } else if (parseInt(raw) > 2000) {
                            onConfigChange('heroImageSize', 2000);
                          }
                        }}
                        className="w-20 px-2 py-1 border rounded-md text-xs"
                      />
                      <span className="text-xs text-muted-foreground">px</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Background Pattern */}
          <div className="inline-flex items-center gap-3 pt-2">
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel>Pattern</FieldLabel>
              <Select
                value={backgroundPattern || 'none'}
                onValueChange={(v) => onConfigChange('backgroundPattern', v)}
              >
                <SelectTrigger className="bg-background w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="dots">Dots</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {backgroundPattern !== 'none' && (
              <>
                <Field orientation="horizontal" className="w-auto">
                  <FieldLabel>Size</FieldLabel>
                  <Select
                    value={backgroundPatternSize || 'medium'}
                    onValueChange={(v) => onConfigChange('backgroundPatternSize', v)}
                  >
                    <SelectTrigger className="bg-background w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field orientation="horizontal" className="w-auto">
                  <FieldLabel>Opacity</FieldLabel>
                  <div className="flex items-center gap-1">
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
                      className="w-16 px-2 py-1 border rounded-md text-sm"
                      placeholder="80"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </Field>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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
