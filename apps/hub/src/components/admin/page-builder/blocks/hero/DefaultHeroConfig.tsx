"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Plus, Trash2, ImageIcon, GripVertical, X } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { getMutedHeroBackgroundColor } from "@/lib/utils/page-hero-background"
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

const HERO_BACKGROUND_COLOR_OPTIONS = [
  { value: "muted", label: "Muted" },
  { value: "custom", label: "Custom" },
] as const

function getMutedShade(value?: unknown) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return Math.min(10, Math.max(1, Math.round(value)))
  }
  return 1
}

function getSafeHexColor(value?: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value! : "#ffffff"
}

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
          className="h-8 w-8 p-0 text-foreground hover:text-foreground hover:bg-accent"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function TrustedByBadgeFields({
  config,
  onConfigChange,
}: {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
}) {
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const trustedByText = config.trustedByText || ''
  const trustedByAvatars: Array<{ src: string; alt: string; fallback: string; id?: string }> = useMemo(
    () => config.trustedByAvatars || [],
    [config.trustedByAvatars]
  )

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

      <MediaPicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectMedia={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
        currentMediaUrl={showPicker !== null ? trustedByAvatars[showPicker]?.src : undefined}
      />
    </div>
  )
}

export function DefaultHeroConfig({ config, onConfigChange }: HeroStyleAdminProps) {
  const [showHeroImagePicker, setShowHeroImagePicker] = useState(false)

  const heroImage = config.heroImage || ''
  const backgroundColor = config.backgroundColor === 'custom' ? 'custom' : 'muted'
  const backgroundCustomColor = getSafeHexColor(config.backgroundCustomColor)
  const backgroundMutedShade = getMutedShade(config.backgroundMutedShade)
  const backgroundPattern = config.backgroundPattern || 'none'
  const backgroundPatternSize = config.backgroundPatternSize || 'medium'
  const backgroundPatternOpacity = config.backgroundPatternOpacity ?? 80
  const handleNumberConfigChange = (field: string, rawValue: string) => {
    if (rawValue === '') {
      onConfigChange(field, undefined)
      return
    }

    const value = parseInt(rawValue, 10)
    if (!isNaN(value)) {
      onConfigChange(field, Math.max(0, value))
    }
  }

  return (
    <CardGroup className="grid">
      <Card>
        <CardContent>
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
                className="w-full h-full object-contain"
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

        {heroImage && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm">Image Alignment</Label>
              <div className="flex gap-4">
                {(['left', 'center', 'right'] as const).map((option) => (
                  <div key={option} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`heroImageAlign-${option}`}
                      checked={(config.heroImageAlign || 'center') === option}
                      onCheckedChange={() => onConfigChange('heroImageAlign', option)}
                    />
                    <Label htmlFor={`heroImageAlign-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Mobile Visibility</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="heroImageHideMobile"
                  checked={config.heroImageHideMobile === true}
                  onCheckedChange={(checked) => onConfigChange('heroImageHideMobile', !!checked)}
                />
                <Label htmlFor="heroImageHideMobile" className="text-sm cursor-pointer">Hide on mobile</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Image Size</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="heroImageCustomSize"
                  checked={config.heroImageSize != null}
                  onCheckedChange={(checked) => onConfigChange('heroImageSize', checked ? 600 : null)}
                />
                <Label htmlFor="heroImageCustomSize" className="text-sm cursor-pointer">Custom size</Label>
                {config.heroImageSize != null && (
                  <>
                    <Input
                      type="number"
                      min="100"
                      max="2000"
                      value={config.heroImageSize ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') return;
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
                      className="h-auto w-20 px-2 py-1 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Background Color</h3>
        </div>

        <div className="grid max-w-md gap-2 sm:grid-cols-2">
          {HERO_BACKGROUND_COLOR_OPTIONS.map((option) => {
            const isSelected = backgroundColor === option.value
            const swatch = option.value === 'custom'
              ? backgroundCustomColor
              : getMutedHeroBackgroundColor(backgroundMutedShade)

            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                data-state={isSelected ? 'checked' : 'unchecked'}
                onClick={() => {
                  onConfigChange('backgroundColor', option.value)
                }}
                className="justify-start data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:text-foreground"
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full border"
                  style={{ background: swatch }}
                />
                <span>{option.label}</span>
              </Button>
            )
          })}
        </div>

        {backgroundColor === 'muted' && (
          <Field className="max-w-xl rounded-lg border p-4">
            <FieldContent className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel className="text-sm">Muted shade</FieldLabel>
                <span className="text-sm text-muted-foreground">{backgroundMutedShade}/10</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[backgroundMutedShade]}
                onValueChange={(value) => {
                  onConfigChange('backgroundColor', 'muted')
                  onConfigChange('backgroundMutedShade', value[0])
                }}
              />
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, index) => {
                  const shade = index + 1
                  const isShadeSelected = backgroundMutedShade === shade
                  return (
                    <Button
                      key={shade}
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Muted shade ${shade}`}
                      data-state={isShadeSelected ? 'checked' : 'unchecked'}
                      onClick={() => {
                        onConfigChange('backgroundColor', 'muted')
                        onConfigChange('backgroundMutedShade', shade)
                      }}
                      className="h-6 w-full rounded-sm p-0 data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/20"
                      style={{ background: getMutedHeroBackgroundColor(shade) }}
                    />
                  )
                })}
              </div>
            </FieldContent>
          </Field>
        )}

        {backgroundColor === 'custom' && (
          <div className="flex max-w-xs items-center gap-2">
            <Input
              type="color"
              value={backgroundCustomColor}
              onChange={(event) => onConfigChange('backgroundCustomColor', event.target.value)}
              className="h-9 w-12 p-1"
              aria-label="Custom background color"
            />
            <Input
              value={config.backgroundCustomColor || ''}
              onChange={(event) => onConfigChange('backgroundCustomColor', event.target.value)}
              placeholder="#ffffff"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id="extendBackgroundUnderNavigation"
            checked={config.extendBackgroundUnderNavigation === true}
            onCheckedChange={(checked) => onConfigChange('extendBackgroundUnderNavigation', !!checked)}
          />
          <Label htmlFor="extendBackgroundUnderNavigation" className="text-sm cursor-pointer">
            Extend background under navigation
          </Label>
        </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Background Pattern</h3>
        </div>

        <div className="inline-flex items-center gap-3">
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
                    className="h-auto w-16 px-2 py-1 text-sm"
                    placeholder="80"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </Field>
            </>
          )}
        </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-medium">Content Padding</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contentPaddingTop">Above content (px)</Label>
                <Input
                  id="contentPaddingTop"
                  type="number"
                  min="0"
                  value={config.contentPaddingTop ?? ''}
                  onChange={(e) => handleNumberConfigChange('contentPaddingTop', e.target.value)}
                  placeholder="Default"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contentPaddingBottom">Below content (px)</Label>
                <Input
                  id="contentPaddingBottom"
                  type="number"
                  min="0"
                  value={config.contentPaddingBottom ?? ''}
                  onChange={(e) => handleNumberConfigChange('contentPaddingBottom', e.target.value)}
                  placeholder="Default"
                />
              </div>
            </div>
          </section>
        </CardContent>
      </Card>

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
    </CardGroup>
  )
}
