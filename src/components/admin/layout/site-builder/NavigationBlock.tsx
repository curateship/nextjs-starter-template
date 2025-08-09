"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react"

interface NavigationLink {
  text: string
  url: string
}

interface NavigationStyle {
  backgroundColor: string
  textColor: string
}

interface NavigationBlockProps {
  logo: string
  links: NavigationLink[]
  style: NavigationStyle
  onLogoChange: (value: string) => void
  onLinksChange: (links: NavigationLink[]) => void
  onStyleChange: (style: NavigationStyle) => void
}

export function NavigationBlock({
  logo,
  links,
  style,
  onLogoChange,
  onLinksChange,
  onStyleChange,
}: NavigationBlockProps) {
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

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Navigation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label htmlFor="navLogo">Logo URL</Label>
          <input
            id="navLogo"
            type="url"
            value={logo}
            onChange={(e) => onLogoChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md"
            placeholder="/images/logo.png"
          />
          <p className="text-xs text-muted-foreground">
            Path or URL to your site logo image
          </p>
        </div>

        {/* Navigation Links */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Navigation Links</h3>
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
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
                      placeholder="Home"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) => updateLink(index, 'url', e.target.value)}
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
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

        {/* Style Settings */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Styling</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="navBgColor">Background Color</Label>
              <div className="flex gap-2">
                <input
                  id="navBgColor"
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="w-12 h-8 border rounded cursor-pointer"
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
              <Label htmlFor="navTextColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  id="navTextColor"
                  type="color"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="w-12 h-8 border rounded cursor-pointer"
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
        </div>
      </CardContent>
    </Card>
  )
}