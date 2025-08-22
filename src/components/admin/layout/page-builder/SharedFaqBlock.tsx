"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface SharedFaqBlockProps {
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
          <div>
            <Label htmlFor={`question-${index}`}>Question</Label>
            <input
              type="text"
              id={`question-${index}`}
              value={item.question}
              onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder="Enter question..."
            />
          </div>
          <div>
            <Label htmlFor={`answer-${index}`}>Answer</Label>
            <textarea
              id={`answer-${index}`}
              value={item.answer}
              onChange={(e) => updateFaqItem(index, 'answer', e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md min-h-[80px]"
              placeholder="Enter answer..."
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deleteFaqItem(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function SharedFaqBlock({
  title = '',
  subtitle = '',
  headerAlign = 'left',
  faqItems = [],
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
  onFaqItemsChange
}: SharedFaqBlockProps) {
  const [localFaqItems, setLocalFaqItems] = useState<FaqItem[]>(faqItems)

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
              <Label htmlFor="faq-title">Title</Label>
              <Input
                id="faq-title"
                value={title}
                onChange={(e) => onTitleChange?.(e.target.value)}
                placeholder="Frequently Asked Questions"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="faq-subtitle">Subtitle</Label>
              <Input
                id="faq-subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange?.(e.target.value)}
                placeholder="Find answers to common questions"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="faq-align">Header Alignment</Label>
              <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                <SelectTrigger id="faq-align">
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
              type="button"
              variant="outline"
              size="sm"
              onClick={addNewFaqItem}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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

          {localFaqItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No FAQ items yet. Click "Add Item" to create one.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}