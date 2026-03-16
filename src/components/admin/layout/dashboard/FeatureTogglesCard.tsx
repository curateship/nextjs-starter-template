'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { GripVertical } from 'lucide-react'
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

const FEATURES: Record<string, { label: string; description: string }> = {
  posts: { label: 'Posts', description: 'Blog posts and articles' },
  products: { label: 'Products', description: 'Products and purchases' },
  directory: { label: 'Directory', description: 'Directory listings' },
  newsletters: { label: 'Newsletters', description: 'Email newsletters and contacts' },
  events: { label: 'Events', description: 'Event management' },
}

const DEFAULT_ORDER = ['posts', 'products', 'directory', 'newsletters', 'events']

function SortableFeatureItem({
  featureKey,
  label,
  description,
  enabled,
  onToggle,
}: {
  featureKey: string
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: featureKey })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div>
          <Label className="font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  )
}

interface FeatureTogglesCardProps {
  enabledFeatures: Record<string, boolean>
  onEnabledFeaturesChange: (features: Record<string, boolean>) => void
  featureOrder: string[]
  onFeatureOrderChange: (order: string[]) => void
}

export function FeatureTogglesCard({
  enabledFeatures,
  onEnabledFeaturesChange,
  featureOrder,
  onFeatureOrderChange,
}: FeatureTogglesCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const order = featureOrder.length === DEFAULT_ORDER.length ? featureOrder : DEFAULT_ORDER

  const toggleFeature = (key: string) => {
    const current = enabledFeatures[key] !== false
    onEnabledFeaturesChange({ ...enabledFeatures, [key]: !current })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string)
      const newIndex = order.indexOf(over.id as string)
      if (oldIndex !== -1 && newIndex !== -1) {
        onFeatureOrderChange(arrayMove(order, oldIndex, newIndex))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enabled Features</CardTitle>
        <CardDescription>
          Choose which content types appear in the sidebar and drag to reorder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((key) => {
              const feature = FEATURES[key]
              if (!feature) return null
              return (
                <SortableFeatureItem
                  key={key}
                  featureKey={key}
                  label={feature.label}
                  description={feature.description}
                  enabled={enabledFeatures[key] !== false}
                  onToggle={() => toggleFeature(key)}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  )
}
