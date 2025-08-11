"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ImageInput } from "@/components/admin/modules/images/ImageInput"
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react"

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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Footer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Logo */}
        <ImageInput
          label="Logo"
          value={logo}
          onChange={onLogoChange}
          placeholder="Enter logo URL or select from library"
          description="Choose your footer logo image. Recommended size: 200x50px or similar aspect ratio."
          siteId={siteId}
          blockType="footer"
          usageContext={`${blockId}-logo`}
        />

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

        {/* Footer Links */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Footer Links</h3>
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

        {/* Social Links */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Social Media Links</h3>
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

        {/* Style Settings */}
        <div className="space-y-4 pt-2">
          <h3 className="text-base font-semibold">Styling</h3>
          
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
        </div>
      </CardContent>
    </Card>
  )
}