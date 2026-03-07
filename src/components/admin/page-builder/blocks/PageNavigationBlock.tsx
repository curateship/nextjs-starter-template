"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Plus, Trash2, ImageIcon, GripVertical, Globe, Check, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Checkbox } from "@/components/ui/checkbox"
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
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NAVIGATION_STYLES } from "./navigation-styles"

interface NavigationLink {
  text: string
  url: string
  id?: string
}

interface NavigationButton {
  text: string
  url: string
  style: 'primary' | 'outline' | 'ghost'
  showOnMobile?: boolean
  id?: string
}

interface PageNavigationBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  siteFavicon?: string
  onBack?: () => void
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
  updateButton: (index: number, field: keyof NavigationButton, value: string | boolean) => void
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
      className="border rounded-lg p-2 bg-background hover:border-muted-foreground/50 transition-colors w-fit"
    >
      <div className="flex gap-1 items-center">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={button.text}
            onChange={(e) => updateButton(index, 'text', e.target.value)}
            className="w-24 px-3 py-2 rounded-md text-sm"
            placeholder="Button Text"
          />
          <input
            type="text"
            value={button.url}
            onChange={(e) => updateButton(index, 'url', e.target.value)}
            className="w-28 px-3 py-2 rounded-md text-sm"
            placeholder="URL"
          />
          <Select
            value={button.style}
            onValueChange={(value) => updateButton(index, 'style', value)}
          >
            <SelectTrigger className="w-fit border-0 shadow-none gap-1 [&>svg]:ml-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primary</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="ghost">Ghost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={button.showOnMobile || false}
              onCheckedChange={(checked) => updateButton(index, 'showOnMobile', checked === true)}
              className="h-4 w-4"
              title="Show on mobile"
            />
            <span className="text-xs text-muted-foreground">Mobile</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeButton(index)}
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
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
      className="border rounded-lg p-2 bg-background hover:border-muted-foreground/50 transition-colors w-fit"
    >
      <div className="flex gap-1 items-center">
        <div
          {...attributes}
          {...listeners}
          className="grip-handle text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={link.text}
            onChange={(e) => updateLink(index, 'text', e.target.value)}
            className="w-24 px-3 py-2 rounded-md text-sm"
            placeholder="Link Text"
          />
          <input
            type="text"
            value={link.url}
            onChange={(e) => updateLink(index, 'url', e.target.value)}
            className="w-32 px-3 py-2 rounded-md text-sm"
            placeholder="URL"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeLink(index)}
          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  )
}

export function PageNavigationBlock({ content, onContentChange, siteId, blockId, siteFavicon, onBack }: PageNavigationBlockProps) {
  const [activeTab, setActiveTab] = useState('content')
  const [showPicker, setShowPicker] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const logo = content.logo || ''
  const logoUrl = content.logoUrl || ''
  const links: NavigationLink[] = content.links || []
  const buttons: NavigationButton[] = content.buttons || []
  const navigationStyle = content.navigationStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[navigationStyle] || {}

  // Lazy migration: move legacy flat `style` object into styleConfig.default
  useEffect(() => {
    if (content.style && !content.styleConfig) {
      onContentChange('styleConfig', {
        default: { ...content.style },
      })
      onContentChange('style', undefined)
      if (!content.navigationStyle) {
        onContentChange('navigationStyle', 'default')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    const updated = {
      ...styleConfig,
      [navigationStyle]: {
        ...currentStyleConfig,
        [field]: value,
      },
    }
    onContentChange('styleConfig', updated)
  }, [styleConfig, navigationStyle, currentStyleConfig, onContentChange])

  // Ensure all links and buttons have unique IDs
  useEffect(() => {
    if (!links || !Array.isArray(links)) return
    const linksNeedIds = links.some(link => !link.id)
    if (linksNeedIds) {
      const linksWithIds = links.map((link, index) => ({
        ...link,
        id: link.id || `link-${Date.now()}-${index}-${Math.random()}`
      }))
      onContentChange('links', linksWithIds)
    }
  }, [links, onContentChange])

  useEffect(() => {
    if (!buttons || !Array.isArray(buttons)) return
    const buttonsNeedIds = buttons.some(button => !button.id)
    if (buttonsNeedIds) {
      const buttonsWithIds = buttons.map((button, index) => ({
        ...button,
        id: button.id || `button-${Date.now()}-${index}-${Math.random()}`
      }))
      onContentChange('buttons', buttonsWithIds)
    }
  }, [buttons, onContentChange])

  const addLink = () => {
    onContentChange('links', [...links, { text: "", url: "", id: `link-${Date.now()}-${Math.random()}` }])
  }

  const removeLink = (index: number) => {
    onContentChange('links', links.filter((_, i) => i !== index))
  }

  const updateLink = (index: number, field: 'text' | 'url', value: string) => {
    const newLinks = [...links]
    newLinks[index] = { ...newLinks[index], [field]: value }
    onContentChange('links', newLinks)
  }

  const handleLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((link) => link.id === active.id)
      const newIndex = links.findIndex((link) => link.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onContentChange('links', arrayMove(links, oldIndex, newIndex))
      }
    }
  }

  const addButton = () => {
    onContentChange('buttons', [...buttons, { text: "", url: "", style: "primary" as const, id: `button-${Date.now()}-${Math.random()}` }])
  }

  const removeButton = (index: number) => {
    onContentChange('buttons', buttons.filter((_, i) => i !== index))
  }

  const updateButton = (index: number, field: keyof NavigationButton, value: string | boolean) => {
    const newButtons = [...buttons]
    newButtons[index] = { ...newButtons[index], [field]: value }
    onContentChange('buttons', newButtons)
  }

  const handleButtonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = buttons.findIndex((button) => button.id === active.id)
      const newIndex = buttons.findIndex((button) => button.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onContentChange('buttons', arrayMove(buttons, oldIndex, newIndex))
      }
    }
  }

  const ActivePanel = NAVIGATION_STYLES[navigationStyle]?.AdminPanel

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted rounded-md"
          >
            <ArrowLeft className="w-3.5 h-4 mr-1.5" />
            Back
          </button>
        )}
        <TabsList className="gap-1">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="styling">Styling</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        {/* Logo Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start">
                <div className="flex-shrink-0 pr-4">
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
                      className="cursor-pointer"
                      onClick={() => setShowPicker(true)}
                    >
                      <img
                        src={siteFavicon}
                        alt="Site favicon (used as logo)"
                        className="h-10 w-10 object-contain cursor-pointer"
                      />
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
                    value={logoUrl}
                    onChange={(e) => onContentChange('logoUrl', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    placeholder="https://example.com (leave empty for site homepage)"
                  />
                </div>
              </div>

              {siteFavicon && (!logo || logo === '/images/logo.png') && (
                <p className="text-xs text-muted-foreground">
                  Currently using favicon as fallback logo. Click on image to change
                </p>
              )}
            </div>

            {/* Image Picker Modal */}
            <MediaPicker
              open={showPicker}
              onOpenChange={setShowPicker}
              onSelectMedia={(imageUrl) => {
                onContentChange('logo', imageUrl)
                setShowPicker(false)
              }}
              currentMediaUrl={logo}
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
                items={links.map(l => l.id || '')}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex flex-wrap gap-2">
                  {links.map((link, index) => (
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
              <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
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
                items={buttons.map(b => b.id || '')}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex flex-wrap gap-2">
                  {buttons.map((button, index) => (
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
              <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                No action buttons. Click + to add one.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Styling Tab */}
      <TabsContent value="styling" className="mt-6">
        {ActivePanel && (
          <ActivePanel
            config={currentStyleConfig}
            onConfigChange={handleStyleConfigChange}
            siteId={siteId}
            blockId={blockId}
          />
        )}
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-6">
        {/* Navigation Style Selector */}
        <div className="space-y-2 mb-4 px-6">
          <Label className="text-sm font-medium px-1">Navigation Style</Label>
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {Object.entries(NAVIGATION_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => onContentChange('navigationStyle', key)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  navigationStyle === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  navigationStyle === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {navigationStyle === key && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{style.label}</div>
                  {style.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Width */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Navigation Width</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={currentStyleConfig.containerWidth === 'full'}
                    onCheckedChange={(checked) => handleStyleConfigChange('containerWidth', checked ? 'full' : 'custom')}
                  />
                  <Label className="text-sm">Full Width</Label>
                </div>
                {currentStyleConfig.containerWidth !== 'full' && (
                  <div className="w-32">
                    <input
                      type="number"
                      min="320"
                      max="2560"
                      value={currentStyleConfig.customWidth || ''}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '') {
                          handleStyleConfigChange('customWidth', undefined)
                        } else {
                          const numValue = parseInt(value)
                          handleStyleConfigChange('customWidth', isNaN(numValue) ? undefined : numValue)
                        }
                      }}
                      placeholder="1152"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                )}
              </div>
              {currentStyleConfig.containerWidth !== 'full' && (
                <p className="text-xs text-muted-foreground">
                  Default: 1152px · Range: 320-2560px
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dark Mode */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dark Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={currentStyleConfig.showDarkModeToggle !== false}
                onCheckedChange={(checked) => handleStyleConfigChange('showDarkModeToggle', checked)}
              />
              <div className="space-y-0.5">
                <Label>Show Toggle</Label>
                <p className="text-sm text-muted-foreground">Display theme switcher in navigation</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
