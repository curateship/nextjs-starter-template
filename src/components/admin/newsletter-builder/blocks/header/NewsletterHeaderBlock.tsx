"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft, ImageIcon } from "lucide-react"

interface NewsletterHeaderBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
}

export function NewsletterHeaderBlock({ content, onContentChange, onBack, siteId }: NewsletterHeaderBlockProps) {
  const [activeTab, setActiveTab] = useState("content")

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
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="header-logo-url">Logo URL</Label>
              <div className="flex items-center gap-2 mt-1">
                {content.logoUrl ? (
                  <img src={content.logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded border" />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center rounded border bg-muted">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <Input
                  id="header-logo-url"
                  value={content.logoUrl || ''}
                  onChange={(e) => onContentChange('logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="flex-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Site Name</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="header-site-name">Site Name</Label>
              <Input
                id="header-site-name"
                value={content.siteName || ''}
                onChange={(e) => onContentChange('siteName', e.target.value)}
                placeholder="Your Site Name"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="header-show-name">Show Site Name</Label>
              <Switch
                id="header-show-name"
                checked={content.showSiteName !== false}
                onCheckedChange={(checked) => onContentChange('showSiteName', checked)}
              />
            </div>
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
              <Label htmlFor="header-alignment">Alignment</Label>
              <Select value={content.alignment || 'center'} onValueChange={(v) => onContentChange('alignment', v)}>
                <SelectTrigger id="header-alignment" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
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
              <Label htmlFor="header-padding">Padding (px)</Label>
              <Input
                id="header-padding"
                type="number"
                min={0}
                max={100}
                value={content.padding ?? 20}
                onChange={(e) => onContentChange('padding', parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
