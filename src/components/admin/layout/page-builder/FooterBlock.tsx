"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ImagePicker } from "@/components/admin/modules/images/ImagePicker"
import { Plus, Trash2, ChevronUp, ChevronDown, ImageIcon, X } from "lucide-react"

interface FooterLink {
  text: string
  url: string
}

interface SocialLink {
  platform: string
  url: string
}

interface FooterStyle {
  backgroundColor: string
  textColor: string
}

interface FooterBlockProps {
  logo: string
  copyright: string
  links: FooterLink[]
  socialLinks: SocialLink[]
  style: FooterStyle
  onLogoChange: (value: string) => void
  onCopyrightChange: (value: string) => void
  onLinksChange: (links: FooterLink[]) => void
  onSocialLinksChange: (socialLinks: SocialLink[]) => void
  onStyleChange: (style: FooterStyle) => void
  siteId: string
  blockId: string
}

const socialPlatforms = [
  'twitter', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'github'
]

export function FooterBlock({
  logo,
  copyright,
  links,
  socialLinks,
  style,
  onLogoChange,
  onCopyrightChange,
  onLinksChange,
  onSocialLinksChange,
  onStyleChange,
  siteId,
  blockId,
}: FooterBlockProps) {
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

  const addSocialLink = () => {
    const newSocialLinks = [...socialLinks, { platform: "twitter", url: "" }]
    onSocialLinksChange(newSocialLinks)
  }

  const removeSocialLink = (index: number) => {
    const newSocialLinks = socialLinks.filter((_, i) => i !== index)
    onSocialLinksChange(newSocialLinks)
  }

  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => {
    const newSocialLinks = [...socialLinks]
    newSocialLinks[index] = { ...newSocialLinks[index], [field]: value }
    onSocialLinksChange(newSocialLinks)
  }

  const updateStyle = (field: keyof FooterStyle, value: string) => {
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

  const moveSocialLink = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === socialLinks.length - 1)) {
      return
    }
    
    const newSocialLinks = [...socialLinks]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const temp = newSocialLinks[index]
    newSocialLinks[index] = newSocialLinks[targetIndex]
    newSocialLinks[targetIndex] = temp
    onSocialLinksChange(newSocialLinks)
  }

  return (
    <div className="space-y-4">
      {/* Brand Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Brand</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo Section */}
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

          {/* Copyright Text */}
          <div className="space-y-2">
            <Label htmlFor="footerCopyright">Copyright Text</Label>
            <input
              id="footerCopyright"
              type="text"
              value={copyright}
              onChange={(e) => onCopyrightChange(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder="© 2024 Your Company. All rights reserved."
            />
            <p className="text-xs text-muted-foreground">
              Copyright notice displayed in the footer
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer Links Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Footer Links</CardTitle>
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
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
                      placeholder="Privacy Policy"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) => updateLink(index, 'url', e.target.value)}
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
                      placeholder="/privacy"
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
              No footer links. Click + to add one.
            </p>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Social Media Links Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Social Media Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Social Links</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSocialLink}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {socialLinks.map((socialLink, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveSocialLink(index, 'up')}
                    disabled={index === 0}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveSocialLink(index, 'down')}
                    disabled={index === socialLinks.length - 1}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div>
                    <Label className="text-xs">Platform</Label>
                    <select
                      value={socialLink.platform}
                      onChange={(e) => updateSocialLink(index, 'platform', e.target.value)}
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
                    >
                      {socialPlatforms.map(platform => (
                        <option key={platform} value={platform}>
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <input
                      type="url"
                      value={socialLink.url}
                      onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
                      className="w-full mt-1 px-2 py-1 border rounded text-sm h-8"
                      placeholder="https://twitter.com/yourcompany"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSocialLink(index)}
                  className="h-8 w-8 p-0 hover:bg-transparent cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {socialLinks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No social links. Click + to add one.
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
              <Label htmlFor="footerBgColor">Background Color</Label>
              <div className="flex gap-2">
                <input
                  id="footerBgColor"
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#1f2937"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="footerTextColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  id="footerTextColor"
                  type="color"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={style.textColor}
                  onChange={(e) => updateStyle('textColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
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
    </div>
  )
}