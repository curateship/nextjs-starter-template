"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft, AlignLeft, AlignCenter, AlignRight, ImageIcon, X } from "lucide-react"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"

interface NewsletterHeaderBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
}

export function NewsletterHeaderBlock({ content, onContentChange, onBack, siteId }: NewsletterHeaderBlockProps) {
  const [activeTab, setActiveTab] = useState("content")
  const [showImagePicker, setShowImagePicker] = useState(false)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted"
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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              {content.logoUrl ? (
                <div className="relative w-48 h-48 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={content.logoUrl}
                    alt="Logo preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <button
                    type="button"
                    onClick={() => onContentChange('logoUrl', '')}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div
                    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 cursor-pointer"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <div className="text-white text-center">
                      <ImageIcon className="mx-auto h-8 w-8 mb-2" />
                      <p className="text-sm font-medium">Click to change image</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center w-48 h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to select logo image</p>
                  </div>
                </div>
              )}
            </div>

            {content.logoUrl && (
              <div className="flex gap-3 mt-4">
                <div className="flex-1">
                  <Label htmlFor="header-logo-width">Width (px)</Label>
                  <input
                    id="header-logo-width"
                    type="text"
                    defaultValue={(content.logoWidth ?? 100).toString()}
                    onBlur={(e) => {
                      const num = e.target.value === '' ? 0 : parseInt(e.target.value)
                      if (!isNaN(num)) onContentChange('logoWidth', num)
                    }}
                    className="border p-2 rounded-md mt-1"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="header-logo-height">Height (px)</Label>
                  <input
                    id="header-logo-height"
                    type="text"
                    defaultValue={(content.logoHeight ?? '').toString()}
                    placeholder="Auto"
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        onContentChange('logoHeight', null)
                      } else {
                        const num = parseInt(val)
                        if (!isNaN(num)) onContentChange('logoHeight', num)
                      }
                    }}
                    className="border p-2 rounded-md mt-1"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            )}

            <MediaPicker
              open={showImagePicker}
              onOpenChange={setShowImagePicker}
              onSelectMedia={(imageUrl) => {
                onContentChange('logoUrl', imageUrl)
                setShowImagePicker(false)
              }}
              currentMediaUrl={content.logoUrl || ''}
              showVideos={false}
              site_id={siteId}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Styling Tab */}
      <TabsContent value="styling" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Alignment</Label>
              <div className="flex gap-1 mt-1">
                {([
                  { value: 'left', icon: AlignLeft, label: 'Left' },
                  { value: 'center', icon: AlignCenter, label: 'Center' },
                  { value: 'right', icon: AlignRight, label: 'Right' },
                ] as const).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onContentChange('alignment', value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                      (content.alignment || 'center') === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-input hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="header-bg-color">Background Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={content.backgroundColor || '#ffffff'}
                  onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  id="header-bg-color"
                  value={content.backgroundColor || '#ffffff'}
                  onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="header-padding-top">Top Padding (px)</Label>
              <input
                id="header-padding-top"
                type="text"
                defaultValue={(content.paddingTop ?? content.padding ?? 20).toString()}
                onBlur={(e) => {
                  const val = e.target.value
                  const num = val === '' ? 0 : parseInt(val)
                  if (!isNaN(num)) {
                    onContentChange('paddingTop', num)
                  }
                }}
                className="border p-2 rounded-md mt-1"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <Label htmlFor="header-padding-bottom">Bottom Padding (px)</Label>
              <input
                id="header-padding-bottom"
                type="text"
                defaultValue={(content.paddingBottom ?? content.padding ?? 20).toString()}
                onBlur={(e) => {
                  const val = e.target.value
                  const num = val === '' ? 0 : parseInt(val)
                  if (!isNaN(num)) {
                    onContentChange('paddingBottom', num)
                  }
                }}
                className="border p-2 rounded-md mt-1"
                style={{ width: '100%' }}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-6">
      </TabsContent>
    </Tabs>
  )
}
