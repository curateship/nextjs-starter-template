"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
    // Security: Sanitize and validate input
    const sanitizedValue = value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim()
    
    // Security: Enforce length limits to prevent DoS
    const maxLength = field === 'question' ? 500 : 2000
    const truncatedValue = sanitizedValue.length > maxLength 
      ? sanitizedValue.substring(0, maxLength) 
      : sanitizedValue
    
    const updatedItems = [...localFaqItems]
    updatedItems[index] = { ...updatedItems[index], [field]: truncatedValue }
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
            <Input
              id="faq-title"
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Frequently Asked Questions"
            />
          </div>
          
          <div>
            <Label htmlFor="faq-subtitle">Subtitle</Label>
            <Textarea
              id="faq-subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange?.(e.target.value)}
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
                  key={item.id}
                  value={item}
                  className="group border rounded-lg p-4 bg-muted/30"
                  whileDrag={{ 
                    scale: 1.02, 
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                    zIndex: 1000
                  }}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest('input') || target.closest('textarea') || target.closest('button')) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                  drag
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="opacity-60 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
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
                      <Label htmlFor={`question-${item.id}`} className="text-xs">Question</Label>
                      <Input
                        id={`question-${item.id}`}
                        value={item.question}
                        onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
                        placeholder="Enter your question here..."
                        maxLength={500}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor={`answer-${item.id}`} className="text-xs">Answer</Label>
                      <Textarea
                        id={`answer-${item.id}`}
                        value={item.answer}
                        onChange={(e) => updateFaqItem(index, 'answer', e.target.value)}
                        placeholder="Enter the answer here..."
                        rows={3}
                        maxLength={2000}
                      />
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