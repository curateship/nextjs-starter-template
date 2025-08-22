"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
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

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface ProductFAQBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  faqItems?: FaqItem[]
  onTitleChange?: (value: string) => void
  onSubtitleChange?: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onFaqItemsChange?: (value: FaqItem[]) => void
}

// Sortable FAQ item component
function SortableFaqItem({
  item,
  index,
  updateFaqItem,
  deleteFaqItem
}: {
  item: FaqItem
  index: number
  updateFaqItem: (index: number, field: keyof FaqItem, value: string) => void
  deleteFaqItem: (index: number) => void
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
            <span className="text-sm font-medium">FAQ Item {index + 1}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => deleteFaqItem(index)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        
        <div>
          <input
            type="text"
            value={item.question}
            onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="Question"
          />
        </div>
        <div>
          <textarea
            value={item.answer}
            onChange={(e) => updateFaqItem(index, 'answer', e.target.value)}
            className="w-full px-3 py-1.5 border rounded-md text-sm"
            placeholder="Answer"
            rows={1}
          />
        </div>
      </div>
    </div>
  )
}

export function ProductFAQBlock({
  title = '',
  subtitle = '',
  headerAlign = 'left',
  faqItems = [],
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
  onFaqItemsChange
}: ProductFAQBlockProps) {
  const [localFaqItems, setLocalFaqItems] = useState<FaqItem[]>(faqItems)

  const updateFaqItems = (newItems: FaqItem[]) => {
    setLocalFaqItems(newItems)
    onFaqItemsChange?.(newItems)
  }

  const addNewFaqItem = () => {
    const newItem: FaqItem = {
      id: `item-${Date.now()}`,
      question: '',
      answer: ''
    }
    updateFaqItems([...localFaqItems, newItem])
  }

  const updateFaqItem = (index: number, field: keyof FaqItem, value: string) => {
    const updatedItems = [...localFaqItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    updateFaqItems(updatedItems)
  }

  const deleteFaqItem = (index: number) => {
    const updatedItems = localFaqItems.filter((_, i) => i !== index)
    updateFaqItems(updatedItems)
  }

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = localFaqItems.findIndex((item) => item.id === active.id)
      const newIndex = localFaqItems.findIndex((item) => item.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        updateFaqItems(arrayMove(localFaqItems, oldIndex, newIndex))
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-faq-title">Title</Label>
              <Input
                id="product-faq-title"
                value={title}
                onChange={(e) => onTitleChange?.(e.target.value)}
                placeholder="Product FAQ"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="product-faq-subtitle">Subtitle</Label>
              <Input
                id="product-faq-subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange?.(e.target.value)}
                placeholder="Get answers to common questions about this product..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="product-faq-align">Header Alignment</Label>
              <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                <SelectTrigger id="product-faq-align">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Items Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">FAQ Items</CardTitle>
            <Button
              onClick={addNewFaqItem}
              size="sm"
              className="h-8"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add FAQ
            </Button>
          </div>
        </CardHeader>
        <CardContent>

          {localFaqItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No FAQ items yet. Click "Add FAQ" to create your first item.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localFaqItems.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {localFaqItems.map((item, index) => (
                    <SortableFaqItem
                      key={item.id}
                      item={item}
                      index={index}
                      updateFaqItem={updateFaqItem}
                      deleteFaqItem={deleteFaqItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  )
}