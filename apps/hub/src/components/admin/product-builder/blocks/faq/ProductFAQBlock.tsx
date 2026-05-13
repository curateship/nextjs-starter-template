"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockTabs } from "@/components/ui/tabs"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
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
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { BlockEditorEmptyState } from "@/components/ui/tabs"

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface ProductFAQBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  productFaqItems?: FaqItem[]
  onHeaderChange?: (value: string) => void
  onSubheaderChange?: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onProductFaqItemsChange?: (value: FaqItem[]) => void
  onBack?: () => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
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
        
        <div className="px-2 pt-2 space-y-3">
          <div>
            <Label className="font-medium">Question:</Label>
            <input
              type="text"
              value={item.question}
              onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
              className="w-full px-3 py-2 border rounded-md mt-1"
              placeholder="Enter question..."
            />
          </div>
          <div>
            <Label className="font-medium">Answer:</Label>
            <textarea
              value={item.answer}
              onChange={(e) => {
                updateFaqItem(index, 'answer', e.target.value)
                // Auto-resize the textarea
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = `${target.scrollHeight}px`
              }}
              className="w-full px-3 py-2 border rounded-md min-h-10 resize-none overflow-hidden mt-1"
              placeholder="Enter answer..."
              style={{ height: 'auto' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductFAQBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  productFaqItems = [],
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onProductFaqItemsChange,
  onBack,
  visibility,
  onVisibilityChange
}: ProductFAQBlockProps) {
  const [localFaqItems, setLocalFaqItems] = useState<FaqItem[]>(productFaqItems)

  const updateFaqItems = (newItems: FaqItem[]) => {
    setLocalFaqItems(newItems)
    onProductFaqItemsChange?.(newItems)
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
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
            label: "Content",
            content: (
            <CardGroup className="grid">
              <Card className="shadow-none">
                <CardHeader>
                  <DashboardModalCardTitle>Header settings</DashboardModalCardTitle>
                  <CardDescription>Set the FAQ heading and alignment.</CardDescription>
                </CardHeader>
                <CardContent className="lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                  <div className="space-y-2">
                    <Label htmlFor="product-faq-title">Header</Label>
                    <Input
                      id="product-faq-title"
                      value={header}
                      onChange={(e) => onHeaderChange?.(e.target.value)}
                      placeholder="Product FAQ"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-faq-subtitle">Sub Header</Label>
                    <Input
                      id="product-faq-subtitle"
                      value={subheader}
                      onChange={(e) => onSubheaderChange?.(e.target.value)}
                      placeholder="Get answers to common questions about this product..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-faq-align">Header Alignment</Label>
                    <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                      <SelectTrigger id="product-faq-align" size="button">
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

              <Card className="shadow-none">
                <CardHeader>
                  <DashboardModalCardTitle>FAQ items</DashboardModalCardTitle>
                  <CardDescription>Add, edit, and reorder questions.</CardDescription>
                </CardHeader>
                <CardContent>
                  {localFaqItems.length === 0 ? (
                    <BlockEditorEmptyState>
                      <p>No FAQ items yet. Click &quot;Add FAQ&quot; to create your first item.</p>
                    </BlockEditorEmptyState>
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
                  <div className="pt-4">
                    <Button onClick={addNewFaqItem} variant="outline">
                      <Plus className="w-4 h-4 mr-1" />
                      Add FAQ
                    </Button>
                  </div>
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
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  useCard
                  fields={[
                    { key: 'header', label: 'Header' },
                    { key: 'subheader', label: 'Sub Header' },
                  ]}
                />
              )}
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
