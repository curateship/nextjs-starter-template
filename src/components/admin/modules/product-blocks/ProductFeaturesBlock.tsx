"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImageInput } from "@/components/admin/modules/images/ImageInput"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { useState, useRef, useCallback } from "react"
import { Reorder } from "motion/react"

interface Feature {
  id: string
  image: string
  title: string
  description: string
}

interface ProductFeaturesBlockProps {
  headerTitle: string
  headerSubtitle: string
  features: Feature[]
  onHeaderTitleChange: (value: string) => void
  onHeaderSubtitleChange: (value: string) => void
  onFeaturesChange: (features: Feature[]) => void
  siteId: string
  blockId: string
}

export function ProductFeaturesBlock({
  headerTitle,
  headerSubtitle,
  features,
  onHeaderTitleChange,
  onHeaderSubtitleChange,
  onFeaturesChange,
  siteId,
  blockId,
}: ProductFeaturesBlockProps) {
  const featuresTimeoutRef = useRef<NodeJS.Timeout>()

  const addFeature = () => {
    const newFeature: Feature = {
      id: `feature-${Date.now()}-${Math.random()}`,
      image: "",
      title: `Feature ${features.length + 1}`,
      description: "Describe this amazing feature and how it benefits your users."
    }
    const newFeatures = [...features, newFeature]
    onFeaturesChange(newFeatures)
  }

  const removeFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index)
    onFeaturesChange(newFeatures)
  }

  const updateFeature = (index: number, field: keyof Feature, value: string) => {
    const newFeatures = [...features]
    newFeatures[index] = { ...newFeatures[index], [field]: value }
    onFeaturesChange(newFeatures)
  }

  const handleReorderFeatures = useCallback((reorderedFeatures: Feature[]) => {
    if (featuresTimeoutRef.current) {
      clearTimeout(featuresTimeoutRef.current)
    }
    
    featuresTimeoutRef.current = setTimeout(() => {
      onFeaturesChange(reorderedFeatures)
    }, 300)
  }, [onFeaturesChange])

  return (
    <div className="space-y-4">
      {/* Header Content Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Header Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="headerTitle">Header Title</Label>
            <Input
              id="headerTitle"
              value={headerTitle}
              onChange={(e) => onHeaderTitleChange(e.target.value)}
              placeholder="Effortless Task Management"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="headerSubtitle">Header Subtitle</Label>
            <textarea
              id="headerSubtitle"
              value={headerSubtitle}
              onChange={(e) => onHeaderSubtitleChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Automate your tasks and workflows by connecting your favorite tools like Notion, Todoist, and more."
              rows={3}
              required
            />
          </div>
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Features</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFeature}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Reorder.Group 
            axis="y" 
            values={features} 
            onReorder={handleReorderFeatures}
            className="space-y-4"
          >
            {features.map((feature, index) => (
              <Reorder.Item 
                key={feature.id}
                value={feature}
                className="border rounded-lg p-4 transition-colors hover:border-muted-foreground cursor-pointer"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000
                }}
                style={{ cursor: "grab" }}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium">Feature {index + 1}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFeature(index)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <ImageInput
                    label="Feature Image"
                    value={feature.image}
                    onChange={(value) => updateFeature(index, 'image', value)}
                    placeholder="Enter image URL or select from library"
                    description="Image for this feature card"
                    siteId={siteId}
                    blockType="product-features"
                    usageContext={`feature-${index}`}
                  />

                  <div className="space-y-2">
                    <Label>Feature Title</Label>
                    <Input
                      value={feature.title}
                      onChange={(e) => updateFeature(index, 'title', e.target.value)}
                      placeholder="Marketing Campaigns"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Feature Description</Label>
                    <textarea
                      value={feature.description}
                      onChange={(e) => updateFeature(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="Effortlessly book and manage your meetings. Stay on top of your schedule."
                      rows={2}
                    />
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          
          {features.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
              No features added yet. Click + to add your first feature.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}