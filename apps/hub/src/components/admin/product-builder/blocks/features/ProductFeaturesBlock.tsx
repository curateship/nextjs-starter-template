"use client"

import { BlockTabs } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Plus, Trash2, GripVertical, ImageIcon, Play } from "lucide-react"
import { useState } from "react"
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
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockEditorEmptyState } from "@/components/ui/tabs"

// Helper function to detect media type from URL
const getMediaType = (url: string): 'image' | 'video' | 'unknown' => {
  if (!url) return 'unknown'
  const ext = url.split('.').pop()?.toLowerCase()
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  
  if (videoExts.includes(ext || '')) return 'video'
  if (imageExts.includes(ext || '')) return 'image'
  return 'unknown'
}

interface Feature {
  id: string
  image: string
  title: string
  description: string
  mediaType?: 'image' | 'video'
}

interface ProductFeaturesBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  featuresCollection: Feature[]
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onFeaturesCollectionChange: (features: Feature[]) => void
  siteId: string
  blockId: string
  onBack?: () => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
}

// Sortable feature item component
function SortableFeatureItem({
  feature,
  index,
  updateFeature,
  removeFeature,
  onOpenImagePicker
}: {
  feature: Feature
  index: number
  updateFeature: (index: number, field: keyof Feature, value: string) => void
  removeFeature: (index: number) => void
  onOpenImagePicker: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-background hover:border-muted-foreground/50 transition-colors"
    >
      <div className="flex gap-3">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 self-center"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onOpenImagePicker(index)}
            >
              {feature.image ? (
                getMediaType(feature.image) === 'video' ? (
                  <div className="relative w-12 h-12 rounded-lg border bg-black overflow-hidden">
                    <video 
                      src={`/api/media/proxy?url=${encodeURIComponent(feature.image)}`}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        e.currentTarget.currentTime = 0.1;
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/60 rounded-full p-1">
                        <Play className="w-2 h-2 text-white fill-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-12 h-12 object-cover rounded-lg border"
                  />
                )
              ) : (
                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center hover:bg-muted/70 hover:border-muted-foreground/40 transition-all">
                  <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                </div>
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <Input
                  id={`feature-title-${index}`}
                  value={feature.title}
                  onChange={(e) => updateFeature(index, 'title', e.target.value)}
                  placeholder="Feature title"
                  className="font-medium"
                />
              </div>
              <div>
                <Input
                  id={`feature-desc-${index}`}
                  value={feature.description}
                  onChange={(e) => updateFeature(index, 'description', e.target.value)}
                  placeholder="Describe this feature and its benefits..."
                />
              </div>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeFeature(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function ProductFeaturesBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  featuresCollection,
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onFeaturesCollectionChange,
  onBack,
  visibility,
  onVisibilityChange,
}: ProductFeaturesBlockProps) {
  const [showPicker, setShowPicker] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const addFeature = () => {
    const newFeature: Feature = {
      id: `feature-${Date.now()}-${Math.random()}`,
      image: "",
      title: `Feature ${featuresCollection.length + 1}`,
      description: "Describe this amazing feature and how it benefits your users."
    }
    const newFeatures = [...featuresCollection, newFeature]
    onFeaturesCollectionChange(newFeatures)
  }

  const removeFeature = (index: number) => {
    const newFeatures = featuresCollection.filter((_, i) => i !== index)
    onFeaturesCollectionChange(newFeatures)
  }

  const updateFeature = (index: number, field: keyof Feature, value: string) => {
    const newFeatures = [...featuresCollection]
    newFeatures[index] = { ...newFeatures[index], [field]: value }
    onFeaturesCollectionChange(newFeatures)
  }

  const handleFeatureDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = featuresCollection.findIndex((feature) => feature.id === active.id)
      const newIndex = featuresCollection.findIndex((feature) => feature.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onFeaturesCollectionChange(arrayMove(featuresCollection, oldIndex, newIndex))
      }
    }
  }

  const handleSelectMedia = (mediaUrl: string, index: number) => {
    updateFeature(index, 'image', mediaUrl)
    setShowPicker(null)
  }

  return (
    <div>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <CardGroup className="grid">
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Header settings</DashboardModalCardTitle>
                    <CardDescription>Set the features heading and alignment.</CardDescription>
                  </CardHeader>
                  <CardContent className="lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                    <div className="space-y-2">
                      <Label htmlFor="features-title">Header</Label>
                      <Input
                        id="features-title"
                        value={header}
                        onChange={(e) => onHeaderChange(e.target.value)}
                        placeholder="Features"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="features-subtitle">Sub Header</Label>
                      <Input
                        id="features-subtitle"
                        value={subheader}
                        onChange={(e) => onSubheaderChange(e.target.value)}
                        placeholder="Discover what makes our product special"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="features-align">Header Alignment</Label>
                      <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                        <SelectTrigger id="features-align" size="button">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Features</DashboardModalCardTitle>
                    <CardDescription>Add, edit, and reorder product features.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleFeatureDragEnd}
                    >
                      <SortableContext
                        items={featuresCollection.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {featuresCollection.map((feature, index) => (
                            <SortableFeatureItem
                              key={feature.id}
                              feature={feature}
                              index={index}
                              updateFeature={updateFeature}
                              removeFeature={removeFeature}
                              onOpenImagePicker={setShowPicker}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {featuresCollection.length === 0 && (
                      <BlockEditorEmptyState>
                        No features yet. Click Add Feature to create one.
                      </BlockEditorEmptyState>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addFeature}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Feature
                    </Button>
                  </CardContent>
                </Card>
              </CardGroup>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <CardGroup className="grid">
                {onVisibilityChange && (
                  <VisibilitySettings
                    title="Header Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    includeHideBlock={false}
                    useCard
                    fields={[
                      { key: 'header', label: 'Header' },
                      { key: 'subheader', label: 'Sub Header' },
                    ]}
                  />
                )}
                {onVisibilityChange && (
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    useCard
                    fields={[]}
                  />
                )}
              </CardGroup>
            ),
          },
        ]}
      />

      {/* Media Picker Modal - Outside Tabs */}
      <MediaPicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectMedia={(mediaUrl) => showPicker !== null && handleSelectMedia(mediaUrl, showPicker)}
        currentMediaUrl={showPicker !== null ? featuresCollection[showPicker]?.image : undefined}
        showVideos={true}
      />
    </div>
  )
}
