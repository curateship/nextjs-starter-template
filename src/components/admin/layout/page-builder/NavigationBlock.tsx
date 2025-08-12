"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/modules/images/ImagePicker"
import { Plus, Trash2, ImageIcon, X, GripVertical } from "lucide-react"
import { Reorder } from "motion/react"

interface NavigationLink {
  text: string
  url: string
  id?: string
}

interface NavigationButton {
  text: string
  url: string
  style: 'primary' | 'outline' | 'ghost'
}

interface NavigationStyle {
  backgroundColor: string
  textColor: string
  blurEffect: 'none' | 'light' | 'medium' | 'heavy'
}

interface NavigationBlockProps {
  logo: string
  links: NavigationLink[]
  buttons: NavigationButton[]
  style: NavigationStyle
  onLogoChange: (value: string) => void
  onLinksChange: (links: NavigationLink[]) => void
  onButtonsChange: (buttons: NavigationButton[]) => void
  onStyleChange: (style: NavigationStyle) => void
  siteId: string
  blockId: string
}

export function NavigationBlock({
  logo,
  links,
  buttons,
  style,
  onLogoChange,
  onLinksChange,
  onButtonsChange,
  onStyleChange,
  siteId,
  blockId,
}: NavigationBlockProps) {
  const [showPicker, setShowPicker] = useState(false)
  
  // Ensure all links have unique IDs
  useEffect(() => {
    const linksNeedIds = links.some(link => !link.id)
    if (linksNeedIds) {
      const linksWithIds = links.map((link, index) => ({
        ...link,
        id: link.id || `link-${Date.now()}-${index}-${Math.random()}`
      }))
      onLinksChange(linksWithIds)
    }
  }, [links, onLinksChange])
  
  const addLink = () => {
    const newLinks = [...links, { text: "", url: "", id: `link-${Date.now()}-${Math.random()}` }]
    onLinksChange(newLinks)
  }

  const removeLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index)
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

  const linksTimeoutRef = useRef<NodeJS.Timeout>()
  const handleReorderLinks = useCallback((reorderedLinks: NavigationLink[]) => {
    // Clear previous timeout
    if (linksTimeoutRef.current) {
      clearTimeout(linksTimeoutRef.current)
    }
    
    // Set new timeout to debounce the save
    linksTimeoutRef.current = setTimeout(() => {
      // Ensure IDs are preserved in reordered links
      const reorderedWithIds = reorderedLinks.map(link => ({
        ...link,
        id: link.id || `link-${Date.now()}-${Math.random()}`
      }))
      onLinksChange(reorderedWithIds)
    }, 300)
  }, [onLinksChange])

  const addButton = () => {
    const newButtons = [...buttons, { text: "", url: "", style: "primary" as const }]
    onButtonsChange(newButtons)
  }

  const removeButton = (index: number) => {
    const newButtons = buttons.filter((_, i) => i !== index)
    onButtonsChange(newButtons)
  }

  const updateButton = (index: number, field: keyof NavigationButton, value: string) => {
    const newButtons = [...buttons]
    newButtons[index] = { ...newButtons[index], [field]: value }
    onButtonsChange(newButtons)
  }

  const buttonsTimeoutRef = useRef<NodeJS.Timeout>()
  const handleReorderButtons = useCallback((reorderedButtons: NavigationButton[]) => {
    // Clear previous timeout
    if (buttonsTimeoutRef.current) {
      clearTimeout(buttonsTimeoutRef.current)
    }
    
    // Set new timeout to debounce the save
    buttonsTimeoutRef.current = setTimeout(() => {
      onButtonsChange(reorderedButtons)
    }, 300)
  }, [onButtonsChange])

  return (
    <div className="space-y-4">
      {/* Logo Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {/* Logo Preview */}
              {logo && logo !== '/images/logo.png' ? (
                <div className="relative group" style={{ padding: '8px' }}>
                  <div className="relative h-12 w-32 rounded-lg overflow-hidden bg-muted border">
                    <img
                      src={logo}
                      alt="Logo"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onLogoChange('')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="h-12 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                </div>
              )}
              
              {/* Image Library Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPicker(true)}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Select from Library
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Recommended: 200x50px or similar ratio
            </p>
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
          <Reorder.Group 
            axis="y" 
            values={links} 
            onReorder={handleReorderLinks}
            className="space-y-3"
          >
            {links.map((link, index) => (
              <Reorder.Item 
                key={link.id || `nav-link-${index}`}
                value={link}
                className="border rounded-lg p-3 transition-colors hover:border-muted-foreground cursor-pointer"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000
                }}
                style={{ cursor: "grab" }}
              >
                <div className="flex gap-2 items-center">
                  <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <div>
                      <input
                        type="text"
                        value={link.text}
                        onChange={(e) => updateLink(index, 'text', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Link Text"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => updateLink(index, 'url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="URL"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLink(index)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

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
          <Reorder.Group 
            axis="y" 
            values={buttons} 
            onReorder={handleReorderButtons}
            className="space-y-3"
          >
            {buttons.map((button, index) => (
              <Reorder.Item 
                key={`nav-button-${index}`} 
                value={button}
                className="border rounded-lg p-3 transition-colors hover:border-muted-foreground cursor-pointer"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000
                }}
                style={{ cursor: "grab" }}
              >
                <div className="flex gap-2 items-center">
                  <div className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 flex-1">
                    <div>
                      <input
                        type="text"
                        value={button.text}
                        onChange={(e) => updateButton(index, 'text', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Button Text"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={button.url}
                        onChange={(e) => updateButton(index, 'url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="URL"
                      />
                    </div>
                    <div>
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
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeButton(index)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

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