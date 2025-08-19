"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { Reorder } from "motion/react"

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface SharedFaqBlockProps {
  title?: string
  subtitle?: string
  faqItems?: FaqItem[]
  onTitleChange?: (value: string) => void
  onSubtitleChange?: (value: string) => void
  onFaqItemsChange?: (value: FaqItem[]) => void
}

export function SharedFaqBlock({
  title = '',
  subtitle = '',
  faqItems = [],
  onTitleChange,
  onSubtitleChange,
  onFaqItemsChange
}: SharedFaqBlockProps) {
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

  const handleReorder = (newItems: FaqItem[]) => {
    updateFaqItems(newItems)
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
            <Label htmlFor="faq-title">Title</Label>
            <input
              type="text"
              id="faq-title"
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder="Frequently Asked Questions"
            />
          </div>
          
          <div>
            <Label htmlFor="faq-subtitle">Subtitle</Label>
            <textarea
              id="faq-subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange?.(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md resize-none"
              placeholder="Discover quick and comprehensive answers to common questions..."
              rows={2}
            />
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
            <Reorder.Group
              axis="y"
              values={localFaqItems}
              onReorder={handleReorder}
              className="space-y-3"
            >
              {localFaqItems.map((item, index) => (
                <Reorder.Item 
                  key={item.id || `faq-${index}`} 
                  value={item}
                  className="border rounded-lg p-3 transition-colors hover:border-muted-foreground cursor-pointer"
                  whileDrag={{ 
                    scale: 1.02, 
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                    zIndex: 1000
                  }}
                  style={{ cursor: "grab" }}
                >
                  <div className="flex gap-2 items-start">
                    <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-2">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">FAQ Item {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteFaqItem(index)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
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
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="Answer"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </CardContent>
      </Card>
    </div>
  )
}