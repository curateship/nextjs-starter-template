"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { BlockEditorEmptyState, BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
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
  visibility?: Record<string, boolean>
  onVisibilityChange?: (value: Record<string, boolean>) => void
  onTitleChange?: (value: string) => void
  onSubtitleChange?: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onFaqItemsChange?: (value: FaqItem[]) => void
  onBack?: () => void
}

function normalizeFaqItems(faqItems: FaqItem[]): FaqItem[] {
  const seenIds = new Set<string>()

  return faqItems.map((item, index) => {
    const rawId = typeof item.id === 'string' ? item.id.trim() : ''
    const id = rawId && !seenIds.has(rawId) ? rawId : `faq-item-${index}`

    seenIds.add(id)

    return {
      id,
      question: item.question ?? '',
      answer: item.answer ?? '',
    }
  })
}

function hasInvalidFaqIds(faqItems: FaqItem[]) {
  const seenIds = new Set<string>()

  return faqItems.some((item) => {
    const id = typeof item.id === 'string' ? item.id.trim() : ''

    if (!id || seenIds.has(id)) {
      return true
    }

    seenIds.add(id)
    return false
  })
}

function areFaqItemsEqual(left: FaqItem[], right: FaqItem[]) {
  if (left.length !== right.length) return false

  return left.every((item, index) => {
    const other = right[index]

    return (
      item.id === other?.id &&
      item.question === other?.question &&
      item.answer === other?.answer
    )
  })
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
            <span className="font-medium">FAQ Item {index + 1}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-foreground hover:text-foreground hover:bg-accent"
            onClick={() => deleteFaqItem(index)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        
        <div className="px-2 pt-2 space-y-3">
          <div>
            <Label className="font-medium">Question:</Label>
            <Input
              type="text"
              id={`question-${index}`}
              value={item.question}
              onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
              className="mt-1"
              placeholder="Enter question..."
            />
          </div>
          <div>
            <Label className="font-medium">Answer:</Label>
            <Textarea
              id={`answer-${index}`}
              value={item.answer}
              onChange={(e) => {
                updateFaqItem(index, 'answer', e.target.value)
                // Auto-resize the textarea
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = `${target.scrollHeight}px`
              }}
              className="mt-1 min-h-[2.5rem] resize-none overflow-hidden"
              placeholder="Enter answer..."
              style={{ height: 'auto' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PageFaqBlock({
  title = '',
  subtitle = '',
  headerAlign = 'left',
  faqItems = [],
  visibility,
  onVisibilityChange,
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
  onFaqItemsChange,
  onBack
}: SharedFaqBlockProps) {
  const [localFaqItems, setLocalFaqItems] = useState<FaqItem[]>(() => normalizeFaqItems(faqItems))

  useEffect(() => {
    const normalizedItems = normalizeFaqItems(faqItems)
    setLocalFaqItems((currentItems) => (
      areFaqItemsEqual(currentItems, normalizedItems) ? currentItems : normalizedItems
    ))

    if (hasInvalidFaqIds(faqItems)) {
      onFaqItemsChange?.(normalizedItems)
    }
    // Intentionally sync only from faqItems. The parent callback is recreated per render.
    // Including it here causes the effect to loop while normalizing local FAQ state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faqItems])

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
                <CardContent>
                  <BlockEditorSection heading="Header Settings">
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
                        <SelectTrigger id="faq-align" size="button">
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
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="FAQ Items">
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
                    <BlockEditorEmptyState>
                      <p>No FAQ items yet. Click &quot;Add Item&quot; to create one.</p>
                    </BlockEditorEmptyState>
                  )}

                  <div className="pt-2">
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
                  </BlockEditorSection>
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
                <>
                  <VisibilitySettings
                    title="Elements Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    includeHideBlock={false}
                    useCard
                    fields={[
                      { key: 'title', label: 'Title' },
                      { key: 'subtitle', label: 'Subtitle' },
                    ]}
                  />
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    useCard
                    fields={[]}
                  />
                </>
              )}
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
