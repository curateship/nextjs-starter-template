"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon } from "lucide-react"
import { useState, useRef } from "react"
import type { Hotspot } from "@/components/ui/product-hotspot-block"

interface ProductHotspotBlockProps {
  title: string
  subtitle: string
  headerAlign?: 'left' | 'center'
  backgroundImage: string
  hotspots: Hotspot[]
  showTooltipsAlways: boolean
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onBackgroundImageChange: (value: string) => void
  onHotspotsChange: (hotspots: Hotspot[]) => void
  onShowTooltipsAlwaysChange: (value: boolean) => void
  siteId: string
  blockId: string
}

export function ProductHotspotBlock({
  title,
  subtitle,
  headerAlign = 'left',
  backgroundImage,
  hotspots,
  showTooltipsAlways,
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
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
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, showAbove: false })
  const imageRef = useRef<HTMLImageElement>(null)


  // Handle background image changes
  const handleBackgroundImageChange = async (newImageUrl: string) => {
    onBackgroundImageChange(newImageUrl)
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
      text: "Click to edit this hotspot"
    }

    onHotspotsChange([...hotspots, newHotspot])
    setEditingHotspot(newHotspot.id)
    setHotspotForm({ text: "Click to edit this hotspot" })
    setIsAddingHotspot(false)
    
    // Calculate tooltip position for the new hotspot
    const imageRect = event.currentTarget.getBoundingClientRect()
    const hotspotScreenX = imageRect.left + (newHotspot.x / 100) * imageRect.width
    const hotspotScreenY = imageRect.top + (newHotspot.y / 100) * imageRect.height
    
    setTooltipPosition({
      x: hotspotScreenX,
      y: hotspotScreenY,
      showAbove: hotspotScreenY > window.innerHeight / 2
    })
  }

  const handleEditHotspot = (hotspotId: string, event?: React.MouseEvent) => {
    const hotspot = hotspots.find(h => h.id === hotspotId)
    if (hotspot) {
      setEditingHotspot(hotspotId)
      setHotspotForm({ text: hotspot.text })
      
      // Calculate tooltip position
      if (event && imageRef.current) {
        const button = event.currentTarget as HTMLElement
        const buttonRect = button.getBoundingClientRect()
        const centerX = buttonRect.left + buttonRect.width / 2
        const centerY = buttonRect.top + buttonRect.height / 2
        
        // Determine if tooltip should show above or below
        const showAbove = centerY > window.innerHeight / 2
        
        setTooltipPosition({
          x: centerX,
          y: centerY,
          showAbove
        })
      }
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
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
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
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange(e.target.value)}
                placeholder="Hover over the blinking dots to discover more about our features"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hotspot-align">Header Alignment</Label>
              <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                <SelectTrigger id="hotspot-align">
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
                  <div key={hotspot.id} className="absolute z-10" style={{
                    left: `${hotspot.x}%`,
                    top: `${hotspot.y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}>
                    <button
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        editingHotspot === hotspot.id 
                          ? 'bg-orange-500 focus:ring-orange-500' 
                          : 'bg-blue-500 focus:ring-blue-500'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditHotspot(hotspot.id, e)
                      }}
                      title={`Edit: ${hotspot.text}`}
                    >
                      <div className="h-2 w-2 rounded-full bg-white" />
                    </button>
                  </div>
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

      {/* Fixed position tooltip for editing hotspots */}
      {editingHotspot && (
        <div 
          className="fixed bg-white border border-gray-200 shadow-2xl rounded-lg p-3 min-w-64 max-w-80 z-[9999]"
          style={{
            left: `${tooltipPosition.x}px`,
            top: tooltipPosition.showAbove ? `${tooltipPosition.y - 120}px` : `${tooltipPosition.y + 20}px`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="space-y-2">
            <Textarea
              value={hotspotForm.text}
              onChange={(e) => setHotspotForm({ ...hotspotForm, text: e.target.value })}
              placeholder="Hotspot description"
              rows={3}
              className="text-sm"
              autoFocus
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDeleteHotspot(editingHotspot)}
                className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Delete hotspot"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Tooltip arrow */}
          <div 
            className={`absolute left-1/2 transform -translate-x-1/2 ${
              tooltipPosition.showAbove 
                ? 'bottom-[-8px] w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white' 
                : 'top-[-8px] w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white'
            }`} 
          />
        </div>
      )}
    </div>
  )
}