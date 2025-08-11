"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ImagePicker } from "@/components/admin/modules/images/ImagePicker"
import { Plus, Trash2, ChevronUp, ChevronDown, ImageIcon, X } from "lucide-react"

interface NavigationLink {
  text: string
  url: string
}

interface NavigationButton {
  text: string
  url: string
  style: 'primary' | 'outline' | 'ghost'
}

interface NavigationStyle {
  backgroundColor: string
  textColor: string
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
  
  const addLink = () => {
    const newLinks = [...links, { text: "", url: "" }]
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

  const moveLink = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === links.length - 1)) {
      return
    }
    
    const newLinks = [...links]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const temp = newLinks[index]
    newLinks[index] = newLinks[targetIndex]
    newLinks[targetIndex] = temp
    onLinksChange(newLinks)
  }

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

  const moveButton = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === buttons.length - 1)) {
      return
    }
    
    const newButtons = [...buttons]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const temp = newButtons[index]
    newButtons[index] = newButtons[targetIndex]
    newButtons[targetIndex] = temp
    onButtonsChange(newButtons)
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
          <CardTitle className="text-base">Navigation Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
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

          <div className="space-y-3">
            {links.map((link, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveLink(index, 'up')}
                    disabled={index === 0}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveLink(index, 'down')}
                    disabled={index === links.length - 1}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div>
                    <Label className="text-xs">Link Text</Label>
                    <input
                      type="text"
                      value={link.text}
                      onChange={(e) => updateLink(index, 'text', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      placeholder="Home"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) => updateLink(index, 'url', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      placeholder="/"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLink(index)}
                  className="h-8 w-8 p-0 hover:bg-transparent cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {links.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No navigation links. Click + to add one.
            </p>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Action Buttons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Buttons</Label>
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

          <div className="space-y-3">
            {buttons.map((button, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveButton(index, 'up')}
                    disabled={index === 0}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveButton(index, 'down')}
                    disabled={index === buttons.length - 1}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <div>
                    <Label className="text-xs">Button Text</Label>
                    <input
                      type="text"
                      value={button.text}
                      onChange={(e) => updateButton(index, 'text', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      placeholder="Sign Up"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <input
                      type="text"
                      value={button.url}
                      onChange={(e) => updateButton(index, 'url', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      placeholder="/signup"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Style</Label>
                    <select
                      value={button.style}
                      onChange={(e) => updateButton(index, 'style', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="primary">Primary</option>
                      <option value="outline">Outline</option>
                      <option value="ghost">Ghost</option>
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeButton(index)}
                  className="h-8 w-8 p-0 hover:bg-transparent cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {buttons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No action buttons. Click + to add one.
            </p>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Style Settings Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Styling</CardTitle>
        </CardHeader>
        <CardContent>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="navBgColor">Background Color</Label>
              <div className="flex gap-2">
                <input
                  id="navBgColor"
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="navTextColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  id="navTextColor"
                  type="color"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm font-mono"
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