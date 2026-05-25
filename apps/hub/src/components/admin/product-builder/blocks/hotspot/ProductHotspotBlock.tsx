"use client"

import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Plus, Trash2, ImageIcon } from "lucide-react"
import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import type { Hotspot } from "@/components/frontend/products/hotspot/ProductHotspotBlock"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"

interface ProductHotspotBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  backgroundImage: string
  productHotspots: Hotspot[]
  showTooltipsAlways: boolean
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onBackgroundImageChange: (value: string) => void
  onProductHotspotsChange: (productHotspots: Hotspot[]) => void
  onShowTooltipsAlwaysChange: (value: boolean) => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

const HOTSPOT_EDITOR_WIDTH = 320
const HOTSPOT_EDITOR_HEIGHT = 152
const HOTSPOT_EDITOR_MARGIN = 16
const HOTSPOT_EDITOR_OFFSET = 12
const HOTSPOT_EDITOR_X_ADJUST = -4

type HotspotEditorPosition = {
  left: number
  top: number
  arrowLeft: number
  showAbove: boolean
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

export function ProductHotspotBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  backgroundImage,
  productHotspots,
  showTooltipsAlways,
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onBackgroundImageChange,
  onProductHotspotsChange,
  onShowTooltipsAlwaysChange,
  visibility,
  onVisibilityChange,
  onBack,
}: ProductHotspotBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [editingHotspot, setEditingHotspot] = useState<string | null>(null)
  const [hotspotForm, setHotspotForm] = useState({ text: "" })
  const [isAddingHotspot, setIsAddingHotspot] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<HotspotEditorPosition>({
    left: HOTSPOT_EDITOR_MARGIN,
    top: HOTSPOT_EDITOR_MARGIN,
    arrowLeft: HOTSPOT_EDITOR_WIDTH / 2,
    showAbove: false,
  })
  const imageRef = useRef<HTMLImageElement>(null)

  const getEditorPosition = (screenX: number, screenY: number): HotspotEditorPosition => {
    const modal = imageRef.current?.closest("[data-slot='dialog-content']") as HTMLElement | null
    const modalRect = modal?.getBoundingClientRect()
    const modalStyle = modal ? window.getComputedStyle(modal) : null
    const borderLeft = Number.parseFloat(modalStyle?.borderLeftWidth ?? "0") || 0
    const borderTop = Number.parseFloat(modalStyle?.borderTopWidth ?? "0") || 0
    const borderRight = Number.parseFloat(modalStyle?.borderRightWidth ?? "0") || 0
    const borderBottom = Number.parseFloat(modalStyle?.borderBottomWidth ?? "0") || 0
    const width = modalRect ? modalRect.width - borderLeft - borderRight : window.innerWidth
    const height = modalRect ? modalRect.height - borderTop - borderBottom : window.innerHeight
    const localX = screenX - (modalRect?.left ?? 0) - borderLeft
    const localY = screenY - (modalRect?.top ?? 0) - borderTop
    const maxLeft = Math.max(HOTSPOT_EDITOR_MARGIN, width - HOTSPOT_EDITOR_MARGIN - HOTSPOT_EDITOR_WIDTH)
    const left = clamp(localX - HOTSPOT_EDITOR_WIDTH / 2 + HOTSPOT_EDITOR_X_ADJUST, HOTSPOT_EDITOR_MARGIN, maxLeft)
    const showAbove = localY > height / 2 && localY > HOTSPOT_EDITOR_HEIGHT + HOTSPOT_EDITOR_MARGIN
    const desiredTop = showAbove
      ? localY - HOTSPOT_EDITOR_HEIGHT - HOTSPOT_EDITOR_OFFSET
      : localY + HOTSPOT_EDITOR_OFFSET
    const maxTop = Math.max(HOTSPOT_EDITOR_MARGIN, height - HOTSPOT_EDITOR_MARGIN - HOTSPOT_EDITOR_HEIGHT)

    return {
      left,
      top: clamp(desiredTop, HOTSPOT_EDITOR_MARGIN, maxTop),
      arrowLeft: clamp(localX - left, HOTSPOT_EDITOR_MARGIN, HOTSPOT_EDITOR_WIDTH - HOTSPOT_EDITOR_MARGIN),
      showAbove,
    }
  }

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
      text: ""
    }

    onProductHotspotsChange([...productHotspots, newHotspot])
    setEditingHotspot(newHotspot.id)
    setHotspotForm({ text: "" })
    setIsAddingHotspot(false)
    
    // Calculate tooltip position for the new hotspot
    const imageRect = event.currentTarget.getBoundingClientRect()
    const hotspotScreenX = imageRect.left + (newHotspot.x / 100) * imageRect.width
    const hotspotScreenY = imageRect.top + (newHotspot.y / 100) * imageRect.height
    
    setTooltipPosition(getEditorPosition(hotspotScreenX, hotspotScreenY))
  }

  const handleEditHotspot = (hotspotId: string, event?: React.MouseEvent) => {
    const hotspot = productHotspots.find(h => h.id === hotspotId)
    if (hotspot) {
      setEditingHotspot(hotspotId)
      setHotspotForm({ text: hotspot.text })
      
      // Calculate tooltip position
      if (event && imageRef.current) {
        const button = event.currentTarget as HTMLElement
        const buttonRect = button.getBoundingClientRect()
        const centerX = buttonRect.left + buttonRect.width / 2
        const centerY = buttonRect.top + buttonRect.height / 2
        
        setTooltipPosition(getEditorPosition(centerX, centerY))
      }
    }
  }

  const handleSaveHotspot = () => {
    if (!editingHotspot) return

    const updatedHotspots = productHotspots.map(hotspot =>
      hotspot.id === editingHotspot
        ? { ...hotspot, text: hotspotForm.text }
        : hotspot
    )

    onProductHotspotsChange(updatedHotspots)
    setEditingHotspot(null)
    setHotspotForm({ text: "" })
  }

  const handleDeleteHotspot = (hotspotId: string) => {
    const updatedHotspots = productHotspots.filter(h => h.id !== hotspotId)
    onProductHotspotsChange(updatedHotspots)
    if (editingHotspot === hotspotId) {
      setEditingHotspot(null)
      setHotspotForm({ text: "" })
    }
  }


  return (
    <>
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
                <CardHeader>
                  <DashboardModalCardTitle>Header Content</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Header</Label>
                      <Input
                        id="title"
                        value={header}
                        onChange={(e) => onHeaderChange(e.target.value)}
                        placeholder="Interactive Product Overview"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subtitle">Sub Header</Label>
                      <Input
                        id="subtitle"
                        value={subheader}
                        onChange={(e) => onSubheaderChange(e.target.value)}
                        placeholder="Hover over the blinking dots to discover more about our features"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hotspot-align">Header Alignment</Label>
                      <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                        <SelectTrigger id="hotspot-align" size="button">
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

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Interactive Hotspots</DashboardModalCardTitle>
                  <CardDescription>Click on the image to place hotspot markers.</CardDescription>
                </CardHeader>
                <CardContent>
              <div className="space-y-4">
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
                    {productHotspots.map((hotspot) => (
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
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImagePicker(true)}
                    className="h-8"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {backgroundImage ? "Change Image" : "Select Image"}
                  </Button>
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
                    title="Header Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    includeHideBlock={false}
                    useCard
                    fields={[
                      { key: 'header', label: 'Header' },
                      { key: 'subheader', label: 'Sub Header' },
                    ]}
                  />
                )}
                {onVisibilityChange && (
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    useCard
                    fields={[]}
                  />
                )}

                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Tooltip Behavior</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showTooltipsAlways"
                        checked={showTooltipsAlways}
                        onCheckedChange={(checked) => onShowTooltipsAlwaysChange(!!checked)}
                      />
                      <Label htmlFor="showTooltipsAlways" className="cursor-pointer">
                        Always show tooltips
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              </CardGroup>
            ),
          },
        ]}
      />

      {/* Image Picker Modal */}
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(imageUrl) => {
          handleBackgroundImageChange(imageUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={backgroundImage}
      />

      {/* Hotspot editor is portaled to the modal shell to avoid scroll-area clipping. */}
      {editingHotspot && imageRef.current?.closest("[data-slot='dialog-content']") && createPortal(
        <div 
          className="absolute z-60 w-80 max-w-[calc(100%-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-2xl"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
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
                className="h-8 text-foreground hover:text-foreground hover:bg-accent"
                title="Delete hotspot"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Tooltip arrow */}
          <div 
            style={{ left: `${tooltipPosition.arrowLeft}px` }}
            className={`absolute transform -translate-x-1/2 ${
              tooltipPosition.showAbove 
                ? 'bottom-[-8px] w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white' 
                : 'top-[-8px] w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white'
            }`} 
          />
        </div>,
        imageRef.current.closest("[data-slot='dialog-content']")!
      )}
    </>
  )
}
