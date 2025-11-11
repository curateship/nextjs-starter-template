"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import { Plus, Trash2, GripVertical, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
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
  // Remove potential XSS vectors and limit length for admin inputs
  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .substring(0, 1000) // Higher limit for admin but still prevent DoS
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

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`bump-title-${bumpIndex}`}>Title</Label>
            <Input
              id={`bump-title-${bumpIndex}`}
              value={bump.title}
              onChange={(e) => updateBump(bumpIndex, 'title', sanitizeAdminInput(e.target.value))}
              placeholder="Priority Support"
            />
          </div>
          <div>
            <Label htmlFor={`bump-price-${bumpIndex}`}>Price</Label>
            <Input
              id={`bump-price-${bumpIndex}`}
              type="number"
              value={bump.price}
              onChange={(e) => updateBump(bumpIndex, 'price', parseFloat(e.target.value) || 0)}
              placeholder="29.99"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`bump-description-${bumpIndex}`}>Description</Label>
          <Textarea
            id={`bump-description-${bumpIndex}`}
            value={bump.description}
            onChange={(e) => updateBump(bumpIndex, 'description', sanitizeAdminInput(e.target.value))}
            placeholder="Get 24/7 live chat support"
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor={`bump-stripe-price-${bumpIndex}`}>Stripe Price ID</Label>
          <Input
            id={`bump-stripe-price-${bumpIndex}`}
            value={bump.stripePriceId}
            onChange={(e) => updateBump(bumpIndex, 'stripePriceId', sanitizeAdminInput(e.target.value))}
            placeholder="price_xxxxxxxxxxxxx"
          />
        </div>

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

        <div className="flex items-center space-x-2">
          <Checkbox
            id={`bump-preselected-${bumpIndex}`}
            checked={bump.isPreSelected}
            onCheckedChange={(checked) => updateBump(bumpIndex, 'isPreSelected', checked)}
          />
          <Label htmlFor={`bump-preselected-${bumpIndex}`}>Pre-select by default</Label>
        </div>
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
      activationConstraint: {
        distance: 8,
      },
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
    const newBumps = orderBumps.filter((_, i) => i !== index)
    onOrderBumpsChange(newBumps)
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
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
             onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}>
          <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-6 relative my-8"
               style={{ width: '840px', maxWidth: '95vw' }}
               onClick={(e) => e.stopPropagation()}>
            <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            <DialogHeader className="mb-6">
              <DialogTitle>Manage Order Bumps</DialogTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Add complementary products that customers can add before checkout
              </p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {orderBumps.length === 0
                    ? "No order bumps yet. Add one to get started."
                    : `${orderBumps.length} order bump${orderBumps.length !== 1 ? 's' : ''}`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOrderBump}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Order Bump
                </Button>
              </div>

              {orderBumps.length > 0 && (
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
              )}
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  )
}
