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

interface ProductFAQBlockProps {
  title?: string
  subtitle?: string
  faqItems?: FaqItem[]
  onTitleChange?: (value: string) => void
  onSubtitleChange?: (value: string) => void
  onFaqItemsChange?: (value: FaqItem[]) => void
}

export function ProductFAQBlock({
  title = '',
  subtitle = '',
  faqItems = [],
  onTitleChange,
  onSubtitleChange,
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
            <Label htmlFor="product-faq-title">Title</Label>
            <Input
              id="product-faq-title"
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Product FAQ"
            />
          </div>
          
          <div>
            <Label htmlFor="product-faq-subtitle">Subtitle</Label>
            <Textarea
              id="product-faq-subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange?.(e.target.value)}
              placeholder="Get answers to common questions about this product..."
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
                  className="border rounded-lg p-3 transition-colors hover:border-muted-foreground cursor-pointer"
                  whileDrag={{ 
                    scale: 1.02, 
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                    zIndex: 1000
                  }}
                  style={{ cursor: "grab" }}
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
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </CardContent>
      </Card>
    </div>
  )
}