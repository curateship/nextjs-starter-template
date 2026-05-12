"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Dialog } from "@/components/ui/dialog"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { MediaInput } from "@/components/admin/media-library/MediaInput"
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

// Security utility functions for admin component
const sanitizeAdminInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .substring(0, 1000)
}

interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
  imageUrl?: string
}

interface OrderBumpsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderBumps: OrderBump[]
  onOrderBumpsChange: (bumps: OrderBump[]) => void
}

function SortableOrderBumpItem({
  bump,
  bumpIndex,
  updateBump,
  removeBump,
}: {
  bump: OrderBump
  bumpIndex: number
  updateBump: (index: number, field: keyof OrderBump, value: any) => void
  removeBump: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bump.id })

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-medium">Order Bump {bumpIndex + 1}</h4>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeBump(bumpIndex)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor={`bump-title-${bumpIndex}`}>Title</FieldLabel>
            <Input
              id={`bump-title-${bumpIndex}`}
              value={bump.title}
              onChange={(e) => updateBump(bumpIndex, 'title', sanitizeAdminInput(e.target.value))}
              placeholder="Priority Support"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`bump-price-${bumpIndex}`}>Price</FieldLabel>
            <Input
              id={`bump-price-${bumpIndex}`}
              type="number"
              value={bump.price}
              onChange={(e) => updateBump(bumpIndex, 'price', parseFloat(e.target.value) || 0)}
              placeholder="29.99"
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor={`bump-description-${bumpIndex}`}>Description</FieldLabel>
          <Textarea
            id={`bump-description-${bumpIndex}`}
            value={bump.description}
            onChange={(e) => updateBump(bumpIndex, 'description', sanitizeAdminInput(e.target.value))}
            placeholder="Get 24/7 live chat support"
            rows={2}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`bump-stripe-price-${bumpIndex}`}>Stripe Price ID</FieldLabel>
          <Input
            id={`bump-stripe-price-${bumpIndex}`}
            value={bump.stripePriceId}
            onChange={(e) => updateBump(bumpIndex, 'stripePriceId', sanitizeAdminInput(e.target.value))}
            placeholder="price_xxxxxxxxxxxxx"
          />
        </Field>

        <div>
          <MediaInput
            label="Order Bump Image"
            value={bump.imageUrl || ''}
            onChange={(value) => updateBump(bumpIndex, 'imageUrl', value)}
            placeholder="Select an image from media library"
            description="Optional image to display with the order bump"
            acceptVideo={false}
            hideUrlInput={true}
          />
        </div>

        <label htmlFor={`bump-preselected-${bumpIndex}`} className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            id={`bump-preselected-${bumpIndex}`}
            checked={bump.isPreSelected}
            onCheckedChange={(checked) => updateBump(bumpIndex, 'isPreSelected', checked)}
          />
          <span className="text-sm font-medium">Pre-select by default</span>
        </label>
      </div>
    </div>
  )
}

export function OrderBumpsModal({
  open,
  onOpenChange,
  orderBumps,
  onOrderBumpsChange,
}: OrderBumpsModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const addOrderBump = () => {
    const newBump: OrderBump = {
      id: `bump-${Date.now()}-${Math.random()}`,
      title: "Order Bump",
      description: "Add this to your order",
      price: 0,
      stripePriceId: "",
      isPreSelected: false,
    }
    onOrderBumpsChange([...orderBumps, newBump])
  }

  const removeBump = (index: number) => {
    onOrderBumpsChange(orderBumps.filter((_, i) => i !== index))
  }

  const updateBump = (index: number, field: keyof OrderBump, value: any) => {
    const newBumps = [...orderBumps]
    newBumps[index] = { ...newBumps[index], [field]: value }
    onOrderBumpsChange(newBumps)
  }

  const handleBumpDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = orderBumps.findIndex((bump) => bump.id === active.id)
      const newIndex = orderBumps.findIndex((bump) => bump.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onOrderBumpsChange(arrayMove(orderBumps, oldIndex, newIndex))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title="Manage Order Bumps"
        footer={
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        }
      >
        <CardGroup className="grid">
          <Card>
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <DashboardModalCardTitle>Order Bumps</DashboardModalCardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addOrderBump}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Order Bump
                </Button>
              </div>
              <CardDescription>
                Complementary products that customers can add before checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {orderBumps.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleBumpDragEnd}
                >
                  <SortableContext
                    items={orderBumps.map((b) => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {orderBumps.map((bump, index) => (
                        <SortableOrderBumpItem
                          key={bump.id}
                          bump={bump}
                          bumpIndex={index}
                          updateBump={updateBump}
                          removeBump={removeBump}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No order bumps yet. Click &quot;Add Order Bump&quot; to create one.
                </p>
              )}
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}
