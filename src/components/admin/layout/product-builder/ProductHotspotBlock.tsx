"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon, Edit3 } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { trackImageUsageAction, removeImageUsageAction, getImageByUrlAction } from "@/lib/actions/image-actions"
import type { Hotspot } from "@/components/ui/product-hotspot-block"

interface ProductHotspotBlockProps {
  title: string
  subtitle: string
  backgroundImage: string
  hotspots: Hotspot[]
  showTooltipsAlways: boolean
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onBackgroundImageChange: (value: string) => void
  onHotspotsChange: (hotspots: Hotspot[]) => void
  onShowTooltipsAlwaysChange: (value: boolean) => void
  siteId: string
  blockId: string
}

export function ProductHotspotBlock({
  title,
  subtitle,
  backgroundImage,
  hotspots,
  showTooltipsAlways,
  onTitleChange,
  onSubtitleChange,
  onBackgroundImageChange,
  onHotspotsChange,
  onShowTooltipsAlwaysChange,
  siteId,
  blockId,
}: ProductHotspotBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [editingHotspot, setEditingHotspot] = useState<string | null>(null)
  const [hotspotForm, setHotspotForm] = useState({ text: "" })
  const [isAddingHotspot, setIsAddingHotspot] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  // Track background image usage on initial load
  useEffect(() => {
    const trackInitialImage = async () => {
      if (backgroundImage && siteId) {
        const { data: imageId } = await getImageByUrlAction(backgroundImage)
        if (imageId) {
          await trackImageUsageAction(imageId, siteId, "product-hotspot", "background-image")
        }
      }
    }
    trackInitialImage()
  }, []) // Only run on mount

  // Handle background image changes with usage tracking
  const handleBackgroundImageChange = async (newImageUrl: string) => {
    try {
      // Remove tracking for old image
      if (backgroundImage) {
        const { data: oldImageId } = await getImageByUrlAction(backgroundImage)
        if (oldImageId) {
          await removeImageUsageAction(oldImageId, siteId, "product-hotspot", "background-image")
        }
      }

      // Track usage for new image
      if (newImageUrl) {
        const { data: newImageId } = await getImageByUrlAction(newImageUrl)
        if (newImageId) {
          await trackImageUsageAction(newImageId, siteId, "product-hotspot", "background-image")
        }
      }

      // Update the actual image value
      onBackgroundImageChange(newImageUrl)
    } catch (error) {
      console.error('Error tracking background image usage:', error)
      // Still update the image even if tracking fails
      onBackgroundImageChange(newImageUrl)
    }
  }

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!isAddingHotspot) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100

    const newHotspot: Hotspot = {
      id: `hotspot-${Date.now()}-${Math.random()}`,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      text: "New hotspot"
    }

    onHotspotsChange([...hotspots, newHotspot])
    setEditingHotspot(newHotspot.id)
    setHotspotForm({ text: "New hotspot" })
    setIsAddingHotspot(false)
  }

  const handleEditHotspot = (hotspotId: string) => {
    const hotspot = hotspots.find(h => h.id === hotspotId)
    if (hotspot) {
      setEditingHotspot(hotspotId)
      setHotspotForm({ text: hotspot.text })
    }
  }

  const handleSaveHotspot = () => {
    if (!editingHotspot) return

    const updatedHotspots = hotspots.map(hotspot => 
      hotspot.id === editingHotspot 
        ? { ...hotspot, text: hotspotForm.text }
        : hotspot
    )
    
    onHotspotsChange(updatedHotspots)
    setEditingHotspot(null)
    setHotspotForm({ text: "" })
  }

  const handleDeleteHotspot = (hotspotId: string) => {
    const updatedHotspots = hotspots.filter(h => h.id !== hotspotId)
    onHotspotsChange(updatedHotspots)
    if (editingHotspot === hotspotId) {
      setEditingHotspot(null)
      setHotspotForm({ text: "" })
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
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Interactive Product Overview"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Textarea
              id="subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              placeholder="Hover over the blinking dots to discover more about our features"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Hotspot Management Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="text-base">Interactive Hotspots</CardTitle>
              <div className="flex items-center space-x-2">
                <input
                  id="showTooltipsAlways"
                  type="checkbox"
                  checked={showTooltipsAlways}
                  onChange={(e) => onShowTooltipsAlwaysChange(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="showTooltipsAlways" className="text-xs font-normal whitespace-nowrap">
                  Always show tooltips
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!backgroundImage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImagePicker(true)}
                  className="h-8"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Select Image
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImagePicker(true)}
                  className="h-8"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Change Image
                </Button>
              )}
              <Button
                type="button"
                variant={isAddingHotspot ? "default" : "outline"}
                size="sm"
                onClick={() => setIsAddingHotspot(!isAddingHotspot)}
                className="h-8"
                disabled={!backgroundImage}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isAddingHotspot ? "Click on image" : "Add Hotspot"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Interactive Image Preview */}
          {backgroundImage ? (
            <div className="relative">
              {isAddingHotspot && (
                <div className="text-sm text-muted-foreground mb-2">
                  Click on the image to add a new hotspot
                </div>
              )}
              <div className="relative rounded-lg overflow-hidden bg-muted">
                <img
                  ref={imageRef}
                  src={backgroundImage}
                  alt="Hotspot preview"
                  className={`w-full object-contain ${isAddingHotspot ? 'cursor-crosshair' : 'cursor-default'}`}
                  onClick={handleImageClick}
                />
                
                {/* Preview hotspots */}
                {hotspots.map((hotspot) => (
                  <button
                    key={hotspot.id}
                    className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      editingHotspot === hotspot.id 
                        ? 'bg-orange-500 focus:ring-orange-500' 
                        : 'bg-blue-500 focus:ring-blue-500'
                    }`}
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditHotspot(hotspot.id)
                    }}
                    title={`Edit: ${hotspot.text}`}
                  >
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div 
              className="flex items-center justify-center min-h-96 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
              onClick={() => setShowImagePicker(true)}
            >
              <div className="text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">Add Background Image</p>
                <p className="text-sm text-muted-foreground">Click to select an image for your interactive hotspots</p>
              </div>
            </div>
          )}

          {/* Hotspot List */}
          <div className="space-y-2">
            {hotspots.map((hotspot, index) => (
              <div key={hotspot.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Hotspot {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditHotspot(hotspot.id)}
                      className="h-8 w-8 p-0"
                      title="Edit hotspot"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteHotspot(hotspot.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Delete hotspot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {editingHotspot === hotspot.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={hotspotForm.text}
                      onChange={(e) => setHotspotForm({ ...hotspotForm, text: e.target.value })}
                      placeholder="Hotspot description"
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveHotspot}
                        className="h-8"
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingHotspot(null)}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <div>{hotspot.text}</div>
                  </div>
                )}
              </div>
            ))}
            
            {hotspots.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                No hotspots added yet. Click "Add Hotspot" to create interactive points on your image.
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Image Picker Modal */}
      <ImagePicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectImage={(imageUrl) => {
          handleBackgroundImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentImageUrl={backgroundImage}
      />
    </div>
  )
}