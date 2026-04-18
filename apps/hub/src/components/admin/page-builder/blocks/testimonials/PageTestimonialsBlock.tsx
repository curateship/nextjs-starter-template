"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical, Check } from "lucide-react"
import { BlockEditorEmptyState, BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { TESTIMONIAL_STYLES } from "."
import { cn } from "@/lib/utils/tailwind"
import { VisibilitySettings } from "../shared/VisibilitySettings"
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TestimonialItem {
  id: string
  name: string
  role: string
  avatar: string
  content: string
}

interface PageTestimonialsBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

function SortableTestimonialItem({
  item,
  index,
  updateItem,
  deleteItem,
  onPickAvatar,
}: {
  item: TestimonialItem
  index: number
  updateItem: (index: number, field: keyof TestimonialItem, value: string) => void
  deleteItem: (index: number) => void
  onPickAvatar: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 transition-colors hover:border-muted-foreground bg-background"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              {...attributes}
              {...listeners}
              className="grip-handle opacity-60 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <span className="font-medium">Testimonial {index + 1}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => deleteItem(index)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        <div className="px-2 pt-2">
          <div className="grid grid-cols-[auto_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,3fr)] items-start gap-3">
            <div className="shrink-0">
              <Label htmlFor={`testimonial-avatar-${item.id}`} className="sr-only">
                Avatar
              </Label>
              <button
                id={`testimonial-avatar-${item.id}`}
                type="button"
                onClick={() => onPickAvatar(index)}
                aria-label={item.avatar ? "Change testimonial avatar" : "Select testimonial avatar"}
                className="rounded-full transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Avatar className="size-11 rounded-full border border-input bg-muted">
                  {item.avatar ? (
                    <AvatarImage src={item.avatar} alt={item.name || `Testimonial ${index + 1}`} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-[9px] font-medium lowercase text-muted-foreground">
                    no icon
                  </AvatarFallback>
                </Avatar>
              </button>
            </div>
            <div>
              <Label htmlFor={`testimonial-name-${item.id}`} className="sr-only">
                Name
              </Label>
              <Input
                id={`testimonial-name-${item.id}`}
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                placeholder="Name"
              />
            </div>
            <div>
              <Label htmlFor={`testimonial-role-${item.id}`} className="sr-only">
                Role
              </Label>
              <Input
                id={`testimonial-role-${item.id}`}
                value={item.role}
                onChange={(e) => updateItem(index, 'role', e.target.value)}
                placeholder="Role"
              />
            </div>
            <div>
              <Label htmlFor={`testimonial-quote-${item.id}`} className="sr-only">
                Quote
              </Label>
              <Input
                id={`testimonial-quote-${item.id}`}
                value={item.content}
                onChange={(e) => updateItem(index, 'content', e.target.value)}
                placeholder="Quote"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PageTestimonialsBlock({ content, onContentChange, siteId, blockId, onBack }: PageTestimonialsBlockProps) {
  const [avatarPickerIndex, setAvatarPickerIndex] = useState<number | null>(null)

  const testimonialStyle = content.testimonialStyle || 'default'
  const styleConfig = content.styleConfig || { default: { speed: 0.7, showSecondRow: true } }
  const currentStyleConfig = styleConfig[testimonialStyle] || {}

  const [localItems, setLocalItems] = useState<TestimonialItem[]>(content.testimonialItems || [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const updateItems = (newItems: TestimonialItem[]) => {
    setLocalItems(newItems)
    onContentChange('testimonialItems', newItems)
  }

  const addItem = () => {
    const newItem: TestimonialItem = {
      id: `item-${Date.now()}`,
      name: '',
      role: '',
      avatar: '',
      content: '',
    }
    updateItems([...localItems, newItem])
  }

  const updateItem = (index: number, field: keyof TestimonialItem, value: string) => {
    const updated = [...localItems]
    updated[index] = { ...updated[index], [field]: value }
    updateItems(updated)
  }

  const deleteItem = (index: number) => {
    updateItems(localItems.filter((_, i) => i !== index))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = localItems.findIndex((item) => item.id === active.id)
      const newIndex = localItems.findIndex((item) => item.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        updateItems(arrayMove(localItems, oldIndex, newIndex))
      }
    }
  }

  const handleStyleConfigChange = (field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [testimonialStyle]: { ...currentStyleConfig, [field]: value },
    })
  }

  const ActiveAdminPanel = TESTIMONIAL_STYLES[testimonialStyle]?.AdminPanel

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <>
                <BlockEditorSection heading="Header Settings">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] gap-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={content.title ?? ''}
                        onChange={(e) => onContentChange('title', e.target.value)}
                        placeholder="Meet Our Happy Clients"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subtitle</Label>
                      <Input
                        value={content.subtitle ?? ''}
                        onChange={(e) => onContentChange('subtitle', e.target.value)}
                        placeholder="Hear from the teams who have transformed their workflow."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Alignment</Label>
                      <Select
                        value={content.headerAlign ?? 'center'}
                        onValueChange={(v) => onContentChange('headerAlign', v)}
                      >
                        <SelectTrigger size="button" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </BlockEditorSection>

                <BlockEditorSection heading="Testimonial Items">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={localItems.map(item => item.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {localItems.map((item, index) => (
                            <SortableTestimonialItem
                              key={item.id}
                              item={item}
                              index={index}
                              updateItem={updateItem}
                              deleteItem={deleteItem}
                              onPickAvatar={setAvatarPickerIndex}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {localItems.length === 0 && (
                      <BlockEditorEmptyState>
                        <p>No testimonials yet. Click &quot;Add Item&quot; to create one.</p>
                      </BlockEditorEmptyState>
                    )}

                    <div className="pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={addItem}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add Item
                      </Button>
                    </div>
                </BlockEditorSection>
              </>
            ),
          },
          {
            value: "styling",
            label: "Styling",
            content: (
              <BlockEditorSection
                heading={
                  <>
                    {TESTIMONIAL_STYLES[testimonialStyle]?.label ?? 'Default'} Settings
                  </>
                }
              >
                {ActiveAdminPanel ? (
                  <ActiveAdminPanel
                    config={currentStyleConfig}
                    onConfigChange={handleStyleConfigChange}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">No settings for this style.</p>
                )}
              </BlockEditorSection>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <div className="space-y-6">
                <BlockEditorSection heading="Testimonial Style">
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {Object.entries(TESTIMONIAL_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onContentChange('testimonialStyle', key)}
                        className={cn(
                          "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          testimonialStyle === key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          testimonialStyle === key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        )}>
                          {testimonialStyle === key && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{style.label}</div>
                          {style.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </BlockEditorSection>
                <VisibilitySettings
                  title="Element Visibility"
                  visibility={content.visibility}
                  onChange={(v) => onContentChange('visibility', v)}
                  includeHideBlock={false}
                  fields={[
                    { key: 'title', label: 'Title' },
                    { key: 'subtitle', label: 'Subtitle' },
                  ]}
                />
                <VisibilitySettings
                  title="Block Visibility"
                  visibility={content.visibility}
                  onChange={(v) => onContentChange('visibility', v)}
                  fields={[]}
                />
              </div>
            ),
          },
        ]}
      />

      <MediaPicker
        open={avatarPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setAvatarPickerIndex(null) }}
        onSelectMedia={(imageUrl) => {
          if (avatarPickerIndex !== null) {
            updateItem(avatarPickerIndex, 'avatar', imageUrl)
            setAvatarPickerIndex(null)
          }
        }}
        currentMediaUrl={avatarPickerIndex !== null ? localItems[avatarPickerIndex]?.avatar : undefined}
        site_id={siteId}
      />
    </>
  )
}
