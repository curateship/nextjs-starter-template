"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, GripVertical, ImageIcon } from "lucide-react"
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Feature {
  id: string
  image: string
  title: string
  description: string
}

interface ProductFeaturesBlockProps {
  headerTitle: string
  headerSubtitle: string
  features: Feature[]
  onHeaderTitleChange: (value: string) => void
  onHeaderSubtitleChange: (value: string) => void
  onFeaturesChange: (features: Feature[]) => void
  siteId: string
  blockId: string
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
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0 pt-1"
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
                <img
                  src={feature.image}
                  alt={feature.title}
                  className="w-12 h-12 object-cover rounded-lg border"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center hover:bg-muted/70 hover:border-muted-foreground/40 transition-all">
                  <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <Input
                value={feature.title}
                onChange={(e) => updateFeature(index, 'title', e.target.value)}
                placeholder="Feature title"
                className="font-medium"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor={`feature-desc-${index}`}>Description</Label>
            <textarea
              id={`feature-desc-${index}`}
              value={feature.description}
              onChange={(e) => updateFeature(index, 'description', e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md min-h-[80px] text-sm"
              placeholder="Describe this feature and its benefits..."
            />
          </div>
          
          <div>
            <Label htmlFor={`feature-img-${index}`}>Image URL</Label>
            <Input
              id={`feature-img-${index}`}
              value={feature.image}
              onChange={(e) => updateFeature(index, 'image', e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeFeature(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function ProductFeaturesBlock({
  headerTitle,
  headerSubtitle,
  features,
  onHeaderTitleChange,
  onHeaderSubtitleChange,
  onFeaturesChange,
  siteId,
  blockId,
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
      title: `Feature ${features.length + 1}`,
      description: "Describe this amazing feature and how it benefits your users."
    }
    const newFeatures = [...features, newFeature]
    onFeaturesChange(newFeatures)
  }

  const removeFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index)
    onFeaturesChange(newFeatures)
  }

  const updateFeature = (index: number, field: keyof Feature, value: string) => {
    const newFeatures = [...features]
    newFeatures[index] = { ...newFeatures[index], [field]: value }
    onFeaturesChange(newFeatures)
  }

  const handleFeatureDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = features.findIndex((feature) => feature.id === active.id)
      const newIndex = features.findIndex((feature) => feature.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onFeaturesChange(arrayMove(features, oldIndex, newIndex))
      }
    }
  }

  const handleSelectImage = (imageUrl: string, index: number) => {
    updateFeature(index, 'image', imageUrl)
    setShowPicker(null)
  }

  return (
    <div className="space-y-6">
      {/* Header Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="features-title">Title</Label>
            <Input
              id="features-title"
              value={headerTitle}
              onChange={(e) => onHeaderTitleChange(e.target.value)}
              placeholder="Features"
            />
          </div>
          <div>
            <Label htmlFor="features-subtitle">Subtitle</Label>
            <Input
              id="features-subtitle"
              value={headerSubtitle}
              onChange={(e) => onHeaderSubtitleChange(e.target.value)}
              placeholder="Discover what makes our product special"
            />
          </div>
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Features</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFeature}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Feature
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFeatureDragEnd}
          >
            <SortableContext
              items={features.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {features.map((feature, index) => (
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

          {features.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No features yet. Click "Add Feature" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Picker Modal */}
      <ImagePicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectImage={(imageUrl) => showPicker !== null && handleSelectImage(imageUrl, showPicker)}
        currentImageUrl={showPicker !== null ? features[showPicker]?.image : undefined}
      />
    </div>
  )
}