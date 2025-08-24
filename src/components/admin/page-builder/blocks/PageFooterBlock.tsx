"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePicker } from "@/components/admin/image-library/ImagePicker"
import { Plus, Trash2, ImageIcon, GripVertical } from "lucide-react"
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

// Sortable footer link item component
function SortableFooterLinkItem({
  link,
  index,
  updateLink,
  removeLink
}: {
  link: FooterLink
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
  } = useSortable({ id: link.id || `footer-link-${index}` })

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

// Sortable social link item component
function SortableSocialLinkItem({
  socialLink,
  index,
  updateSocialLink,
  removeSocialLink
}: {
  socialLink: SocialLink
  index: number
  updateSocialLink: (index: number, field: 'platform' | 'url', value: string) => void
  removeSocialLink: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: socialLink.id || `social-link-${index}` })

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
          <Select
            value={socialLink.platform}
            onValueChange={(value) => updateSocialLink(index, 'platform', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              {socialPlatforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="text"
            value={socialLink.url}
            onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="Social URL"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeSocialLink(index)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function PageFooterBlock({
  logo,
  logoUrl,
  copyright,
  links = [],
  socialLinks = [],
  style = { backgroundColor: '#ffffff', textColor: '#000000' },
  onLogoChange,
  onLogoUrlChange,
  onCopyrightChange,
  onLinksChange,
  onSocialLinksChange,
  onStyleChange,
}: FooterBlockProps) {
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
  
  // Ensure all links have unique IDs
  useEffect(() => {
    const linksNeedIds = links.some(link => !link.id)
    if (linksNeedIds) {
      const linksWithIds = (links || []).map((link, index) => ({
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
      const socialLinksWithIds = (socialLinks || []).map((link, index) => ({
        ...link,
        id: link.id || `social-link-${Date.now()}-${index}-${Math.random()}`
      }))
      onSocialLinksChange(socialLinksWithIds)
    }
  }, [socialLinks, onSocialLinksChange])
  
  const addLink = () => {
    const currentLinks = links || []
    const newLinks = [...currentLinks, { text: "", url: "", id: `footer-link-${Date.now()}-${Math.random()}` }]
    onLinksChange(newLinks)
  }

  const removeLink = (index: number) => {
    const newLinks = (links || []).filter((_, i) => i !== index)
    onLinksChange(newLinks)
  }

  const updateLink = (index: number, field: 'text' | 'url', value: string) => {
    const currentLinks = links || []
    const newLinks = [...currentLinks]
    newLinks[index] = { ...newLinks[index], [field]: value }
    onLinksChange(newLinks)
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

  const addSocialLink = () => {
    const currentSocialLinks = socialLinks || []
    const newSocialLinks = [...currentSocialLinks, { platform: "twitter", url: "", id: `social-link-${Date.now()}-${Math.random()}` }]
    onSocialLinksChange(newSocialLinks)
  }

  const removeSocialLink = (index: number) => {
    const newSocialLinks = (socialLinks || []).filter((_, i) => i !== index)
    onSocialLinksChange(newSocialLinks)
  }

  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => {
    const currentSocialLinks = socialLinks || []
    const newSocialLinks = [...currentSocialLinks]
    newSocialLinks[index] = { ...newSocialLinks[index], [field]: value }
    onSocialLinksChange(newSocialLinks)
  }

  const handleSocialLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = socialLinks.findIndex((link) => link.id === active.id)
      const newIndex = socialLinks.findIndex((link) => link.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onSocialLinksChange(arrayMove(socialLinks, oldIndex, newIndex))
      }
    }
  }

  const updateStyle = (field: keyof FooterStyle, value: string) => {
    onStyleChange({ ...style, [field]: value })
  }

  return (
    <div className="space-y-4">
      {/* Logo & Copyright and Styling Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Logo Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Logo & Copyright</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Logo</Label>
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
              
              <div className="space-y-2">
                <Label htmlFor="copyright">Copyright Text</Label>
                <input
                  id="copyright"
                  type="text"
                  value={copyright}
                  onChange={(e) => onCopyrightChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="© 2024 Your Company. All rights reserved."
                />
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
                    className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                  />
                  <input
                    type="text"
                    value={style.backgroundColor}
                    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                    placeholder="#000000"
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
                    className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
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
      </div>

      {/* Footer Links & Social Links Cards */}
      <div className="grid grid-cols-2 gap-4">
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
                    <SortableFooterLinkItem
                      key={link.id || `footer-link-${index}`}
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
                No footer links. Click + to add one.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Social Links Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Social Links</CardTitle>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSocialLinkDragEnd}
            >
              <SortableContext
                items={(socialLinks || []).map(l => l.id || '')}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {(socialLinks || []).map((socialLink, index) => (
                    <SortableSocialLinkItem
                      key={socialLink.id || `social-link-${index}`}
                      socialLink={socialLink}
                      index={index}
                      updateSocialLink={updateSocialLink}
                      removeSocialLink={removeSocialLink}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {socialLinks.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No social links. Click + to add one.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}