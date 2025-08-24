"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon, GripVertical, Globe } from "lucide-react"
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

interface NavigationLink {
  text: string
  url: string
  id?: string
}

interface NavigationButton {
  text: string
  url: string
  style: 'primary' | 'outline' | 'ghost'
  id?: string
}

interface NavigationStyle {
  backgroundColor: string
  textColor: string
  blurEffect: 'none' | 'light' | 'medium' | 'heavy'
}

interface NavigationBlockProps {
  logo: string
  logoUrl: string
  links: NavigationLink[]
  buttons: NavigationButton[]
  style: NavigationStyle
  onLogoChange: (value: string) => void
  onLogoUrlChange: (value: string) => void
  onLinksChange: (links: NavigationLink[]) => void
  onButtonsChange: (buttons: NavigationButton[]) => void
  onStyleChange: (style: NavigationStyle) => void
  siteId: string
  blockId: string
  siteFavicon?: string
}

// Sortable button item component
function SortableButtonItem({
  button,
  index,
  updateButton,
  removeButton
}: {
  button: NavigationButton
  index: number
  updateButton: (index: number, field: keyof NavigationButton, value: string) => void
  removeButton: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: button.id || `button-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 bg-background hover:border-muted-foreground/50 transition-colors"
    >
      <div className="flex gap-2 items-center">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0 p-1 -m-1"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={button.text}
            onChange={(e) => updateButton(index, 'text', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="Button Text"
          />
          <input
            type="text"
            value={button.url}
            onChange={(e) => updateButton(index, 'url', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="URL"
          />
          <Select
            value={button.style}
            onValueChange={(value) => updateButton(index, 'style', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primary</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="ghost">Ghost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeButton(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// Sortable link item component
function SortableLinkItem({
  link,
  index,
  updateLink,
  removeLink
}: {
  link: NavigationLink
  index: number
  updateLink: (index: number, field: 'text' | 'url', value: string) => void
  removeLink: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id || `link-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 bg-background hover:border-muted-foreground/50 transition-colors"
    >
      <div className="flex gap-2 items-center">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0 p-1 -m-1"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={link.text}
            onChange={(e) => updateLink(index, 'text', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="Link Text"
          />
          <input
            type="text"
            value={link.url}
            onChange={(e) => updateLink(index, 'url', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="URL"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeLink(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function PageNavigationBlock({
  logo,
  logoUrl,
  links = [],
  buttons = [],
  style = { backgroundColor: '#ffffff', textColor: '#000000', blurEffect: 'none' },
  onLogoChange,
  onLogoUrlChange,
  onLinksChange,
  onButtonsChange,
  onStyleChange,
  siteFavicon,
}: NavigationBlockProps) {
  const [showPicker, setShowPicker] = useState(false)
  
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

  // Ensure all links and buttons have unique IDs
  useEffect(() => {
    if (!links || !Array.isArray(links)) return
    const linksNeedIds = links.some(link => !link.id)
    if (linksNeedIds) {
      const linksWithIds = (links || []).map((link, index) => ({
        ...link,
        id: link.id || `link-${Date.now()}-${index}-${Math.random()}`
      }))
      onLinksChange(linksWithIds)
    }
  }, [links, onLinksChange])

  useEffect(() => {
    if (!buttons || !Array.isArray(buttons)) return
    const buttonsNeedIds = buttons.some(button => !button.id)
    if (buttonsNeedIds) {
      const buttonsWithIds = (buttons || []).map((button, index) => ({
        ...button,
        id: button.id || `button-${Date.now()}-${index}-${Math.random()}`
      }))
      onButtonsChange(buttonsWithIds)
    }
  }, [buttons, onButtonsChange])
  
  const addLink = () => {
    const currentLinks = links || []
    const newLinks = [...currentLinks, { text: "", url: "", id: `link-${Date.now()}-${Math.random()}` }]
    onLinksChange(newLinks)
  }

  const removeLink = (index: number) => {
    const newLinks = (links || []).filter((_, i) => i !== index)
    onLinksChange(newLinks)
  }

  const updateLink = (index: number, field: 'text' | 'url', value: string) => {
    const newLinks = [...links]
    newLinks[index] = { ...newLinks[index], [field]: value }
    onLinksChange(newLinks)
  }

  const updateStyle = (field: keyof NavigationStyle, value: string) => {
    onStyleChange({ ...style, [field]: value })
  }

  const handleLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((link) => link.id === active.id)
      const newIndex = links.findIndex((link) => link.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onLinksChange(arrayMove(links, oldIndex, newIndex))
      }
    }
  }

  const addButton = () => {
    const newButtons = [...buttons, { text: "", url: "", style: "primary" as const, id: `button-${Date.now()}-${Math.random()}` }]
    onButtonsChange(newButtons)
  }

  const removeButton = (index: number) => {
    const newButtons = (buttons || []).filter((_, i) => i !== index)
    onButtonsChange(newButtons)
  }

  const updateButton = (index: number, field: keyof NavigationButton, value: string) => {
    const newButtons = [...buttons]
    newButtons[index] = { ...newButtons[index], [field]: value }
    onButtonsChange(newButtons)
  }

  const handleButtonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = buttons.findIndex((button) => button.id === active.id)
      const newIndex = buttons.findIndex((button) => button.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onButtonsChange(arrayMove(buttons, oldIndex, newIndex))
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Logo Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {logo && logo !== '/images/logo.png' ? (
                  <div 
                    className="relative h-12 w-32 rounded-lg overflow-hidden bg-muted border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setShowPicker(true)}
                  >
                    <img
                      src={logo}
                      alt="Logo"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                      <div className="text-white text-center">
                        <ImageIcon className="mx-auto h-4 w-4 mb-1" />
                        <p className="text-xs font-medium">Click to change</p>
                      </div>
                    </div>
                  </div>
                ) : siteFavicon ? (
                  <div 
                    className="relative h-12 w-32 rounded-lg overflow-hidden bg-muted border cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center"
                    onClick={() => setShowPicker(true)}
                  >
                    <img
                      src={siteFavicon}
                      alt="Site favicon (used as logo)"
                      className="h-10 w-10 object-contain p-0.5"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                      <div className="text-white text-center">
                        <ImageIcon className="mx-auto h-4 w-4 mb-1" />
                        <p className="text-xs font-medium">Using favicon - Click to add logo</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="h-12 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                    onClick={() => setShowPicker(true)}
                  >
                    <div className="text-center">
                      <Globe className="mx-auto w-4 h-4 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground mt-1">Click to select</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <input
                  id="logoUrl"
                  type="text"
                  value={logoUrl || ''}
                  onChange={(e) => onLogoUrlChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="https://example.com (leave empty for site homepage)"
                />
              </div>
            </div>
            
          </div>
          
          {/* Image Picker Modal */}
          <ImagePicker
            open={showPicker}
            onOpenChange={setShowPicker}
            onSelectImage={(imageUrl) => {
              onLogoChange(imageUrl)
              setShowPicker(false)
            }}
            currentImageUrl={logo}
          />
        </CardContent>
      </Card>

      {/* Navigation Links Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Navigation Links</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLink}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleLinkDragEnd}
          >
            <SortableContext
              items={(links || []).map(l => l.id || '')}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {(links || []).map((link, index) => (
                  <SortableLinkItem
                    key={link.id || `nav-link-${index}`}
                    link={link}
                    index={index}
                    updateLink={updateLink}
                    removeLink={removeLink}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {links.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No navigation links. Click + to add one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Action Buttons</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addButton}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleButtonDragEnd}
          >
            <SortableContext
              items={(buttons || []).map(b => b.id || '')}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {(buttons || []).map((button, index) => (
                  <SortableButtonItem
                    key={button.id || `nav-button-${index}`}
                    button={button}
                    index={index}
                    updateButton={updateButton}
                    removeButton={removeButton}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {buttons.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No action buttons. Click + to add one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Style Settings Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Styling</CardTitle>
        </CardHeader>
        <CardContent>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="navBgColor">Background Color</Label>
              <div className="flex gap-2">
                <input
                  id="navBgColor"
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="navBlurEffect">Glass Blur Effect</Label>
              <Select 
                value={style.blurEffect || 'medium'} 
                onValueChange={(value) => updateStyle('blurEffect', value as 'none' | 'light' | 'medium' | 'heavy')}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="heavy">Heavy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="navTextColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  id="navTextColor"
                  type="color"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}