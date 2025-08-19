"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon, GripVertical } from "lucide-react"
import { Reorder } from "motion/react"

interface FooterLink {
  text: string
  url: string
  id?: string
}

interface SocialLink {
  platform: string
  url: string
  id?: string
}

interface FooterStyle {
  backgroundColor: string
  textColor: string
}

interface FooterBlockProps {
  logo: string
  logoUrl: string
  copyright: string
  links: FooterLink[]
  socialLinks: SocialLink[]
  style: FooterStyle
  onLogoChange: (value: string) => void
  onLogoUrlChange: (value: string) => void
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
  logoUrl,
  copyright,
  links,
  socialLinks,
  style,
  onLogoChange,
  onLogoUrlChange,
  onCopyrightChange,
  onLinksChange,
  onSocialLinksChange,
  onStyleChange,
  siteId,
  blockId,
}: FooterBlockProps) {
  const [showPicker, setShowPicker] = useState(false)
  
  // Ensure all links have unique IDs
  useEffect(() => {
    const linksNeedIds = links.some(link => !link.id)
    if (linksNeedIds) {
      const linksWithIds = links.map((link, index) => ({
        ...link,
        id: link.id || `footer-link-${Date.now()}-${index}-${Math.random()}`
      }))
      onLinksChange(linksWithIds)
    }
  }, [links, onLinksChange])

  // Ensure all social links have unique IDs
  useEffect(() => {
    const socialLinksNeedIds = socialLinks.some(link => !link.id)
    if (socialLinksNeedIds) {
      const socialLinksWithIds = socialLinks.map((link, index) => ({
        ...link,
        id: link.id || `social-link-${Date.now()}-${index}-${Math.random()}`
      }))
      onSocialLinksChange(socialLinksWithIds)
    }
  }, [socialLinks, onSocialLinksChange])
  
  const addLink = () => {
    const newLinks = [...links, { text: "", url: "", id: `footer-link-${Date.now()}-${Math.random()}` }]
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
    const newSocialLinks = [...socialLinks, { platform: "twitter", url: "", id: `social-link-${Date.now()}-${Math.random()}` }]
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

  const linksTimeoutRef = useRef<NodeJS.Timeout>()
  const handleReorderLinks = useCallback((reorderedLinks: FooterLink[]) => {
    // Clear previous timeout
    if (linksTimeoutRef.current) {
      clearTimeout(linksTimeoutRef.current)
    }
    
    // Set new timeout to debounce the save
    linksTimeoutRef.current = setTimeout(() => {
      // Ensure IDs are preserved in reordered links
      const reorderedWithIds = reorderedLinks.map(link => ({
        ...link,
        id: link.id || `footer-link-${Date.now()}-${Math.random()}`
      }))
      onLinksChange(reorderedWithIds)
    }, 300)
  }, [onLinksChange])

  const socialTimeoutRef = useRef<NodeJS.Timeout>()
  const handleReorderSocialLinks = useCallback((reorderedSocialLinks: SocialLink[]) => {
    // Clear previous timeout
    if (socialTimeoutRef.current) {
      clearTimeout(socialTimeoutRef.current)
    }
    
    // Set new timeout to debounce the save
    socialTimeoutRef.current = setTimeout(() => {
      // Ensure IDs are preserved in reordered social links
      const reorderedWithIds = reorderedSocialLinks.map(link => ({
        ...link,
        id: link.id || `social-link-${Date.now()}-${Math.random()}`
      }))
      onSocialLinksChange(reorderedWithIds)
    }, 300)
  }, [onSocialLinksChange])


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
                ) : (
                  <div 
                    className="h-12 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                    onClick={() => setShowPicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto w-4 h-4 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground mt-1">Click to select</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <input
                  id="footerLogoUrl"
                  type="text"
                  value={logoUrl || ''}
                  onChange={(e) => onLogoUrlChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="https://example.com (leave empty for site homepage)"
                />
              </div>
            </div>
            
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Footer Links</CardTitle>
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
                key={link.id || `footer-link-${index}`} 
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
              No footer links. Click + to add one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Social Media Links Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Social Media Links</CardTitle>
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
        </CardHeader>
        <CardContent>

          <Reorder.Group 
            axis="y" 
            values={socialLinks} 
            onReorder={handleReorderSocialLinks}
            className="space-y-3"
          >
            {socialLinks.map((socialLink, index) => (
              <Reorder.Item 
                key={socialLink.id || `footer-social-${index}`} 
                value={socialLink}
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
                      <Select
                        value={socialLink.platform}
                        onValueChange={(value) => updateSocialLink(index, 'platform', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {socialPlatforms.map(platform => (
                            <SelectItem key={platform} value={platform}>
                              {platform.charAt(0).toUpperCase() + platform.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <input
                        type="url"
                        value={socialLink.url}
                        onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Social Media URL"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSocialLink(index)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          {socialLinks.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No social links. Click + to add one.
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