"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, GripVertical, ImageIcon, X } from "lucide-react"
import { useState, useRef, useCallback, useEffect } from "react"
import { trackImageUsageAction, removeImageUsageAction, getImageByUrlAction } from "@/lib/actions/image-actions"
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
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const previousFeaturesRef = useRef<Feature[]>(features)

  // Track image usage when features change
  useEffect(() => {
    if (!siteId || !blockId) return
    
    const trackUsage = async () => {
      try {
        const previousFeatures = previousFeaturesRef.current

        // Track changes for each feature position
        for (let i = 0; i < Math.max(features.length, previousFeatures.length); i++) {
          const currentFeature = features[i]
          const previousFeature = previousFeatures[i]

          // If previous feature exists but current doesn't, remove tracking
          if (previousFeature?.image && !currentFeature) {
            const { data: imageId } = await getImageByUrlAction(previousFeature.image)
            if (imageId) {
              await removeImageUsageAction(imageId, siteId, "product-features", `feature-${i}`)
            }
          }
          // If both exist but URLs changed, remove old and add new
          else if (previousFeature?.image && currentFeature?.image && previousFeature.image !== currentFeature.image) {
            const { data: oldImageId } = await getImageByUrlAction(previousFeature.image)
            if (oldImageId) {
              await removeImageUsageAction(oldImageId, siteId, "product-features", `feature-${i}`)
            }
            const { data: newImageId } = await getImageByUrlAction(currentFeature.image)
            if (newImageId) {
              await trackImageUsageAction(newImageId, siteId, "product-features", `feature-${i}`)
            }
          }
          // If only current exists (new feature), add tracking
          else if (!previousFeature?.image && currentFeature?.image) {
            const { data: imageId } = await getImageByUrlAction(currentFeature.image)
            if (imageId) {
              await trackImageUsageAction(imageId, siteId, "product-features", `feature-${i}`)
            }
          }
        }

        // Update the ref with current features
        previousFeaturesRef.current = [...features]
      } catch (error) {
        console.error('Error tracking feature image usage:', error)
      }
    }

    trackUsage()
  }, [features, siteId, blockId])

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

  const handleSelectImage = (imageUrl: string) => {
    if (showPicker !== null) {
      updateFeature(showPicker, 'image', imageUrl)
      setShowPicker(null)
    }
  }

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
                <div className="space-y-3">
                  {/* Feature Title Row */}
                  <div className="flex items-center gap-3">
                    <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    {feature.image ? (
                      <div className="relative w-8 h-8 rounded overflow-hidden border">
                        <img 
                          src={feature.image} 
                          alt={feature.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded border border-dashed border-muted-foreground/25 bg-muted/50 flex items-center justify-center">
                        <ImageIcon className="w-3 h-3 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="w-52">
                      <Input
                        value={feature.title}
                        onChange={(e) => updateFeature(index, 'title', e.target.value)}
                        placeholder="Feature Title"
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={feature.description}
                        onChange={(e) => updateFeature(index, 'description', e.target.value)}
                        placeholder="Feature description..."
                        className="w-full"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPicker(index)}
                      className="h-8 w-8 p-0 flex items-center justify-center"
                      title="Select image"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFeature(index)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center justify-center"
                      title="Remove feature"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

      {/* Image Picker Dialog */}
      <ImagePicker
        open={showPicker !== null}
        onOpenChange={(open) => setShowPicker(open ? showPicker : null)}
        onSelectImage={handleSelectImage}
        currentImageUrl={showPicker !== null ? features[showPicker]?.image : undefined}
      />
    </div>
  )
}