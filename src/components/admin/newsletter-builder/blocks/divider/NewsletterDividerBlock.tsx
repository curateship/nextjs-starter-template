"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft } from "lucide-react"

interface NewsletterDividerBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterDividerBlock({ content, onContentChange, onBack }: NewsletterDividerBlockProps) {
  const [activeTab, setActiveTab] = useState("style")

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
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>
      </div>

      {/* Style Tab */}
      <TabsContent value="style" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Divider Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="divider-color">Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={content.color || '#e5e7eb'}
                  onChange={(e) => onContentChange('color', e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  id="divider-color"
                  value={content.color || '#e5e7eb'}
                  onChange={(e) => onContentChange('color', e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="divider-thickness">Thickness (px)</Label>
              <Input
                id="divider-thickness"
                type="number"
                min={1}
                max={5}
                value={content.thickness ?? 1}
                onChange={(e) => onContentChange('thickness', parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="divider-width">Width (%)</Label>
              <Input
                id="divider-width"
                type="number"
                min={25}
                max={100}
                value={content.width ?? 100}
                onChange={(e) => onContentChange('width', parseInt(e.target.value) || 100)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="divider-spacing">Vertical Spacing (px)</Label>
              <Input
                id="divider-spacing"
                type="number"
                min={0}
                max={100}
                value={content.spacing ?? 20}
                onChange={(e) => onContentChange('spacing', parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ padding: `${content.spacing ?? 20}px 0`, textAlign: 'center' }}>
              <hr style={{
                border: 'none',
                borderTop: `${content.thickness ?? 1}px solid ${content.color || '#e5e7eb'}`,
                width: `${content.width ?? 100}%`,
                margin: '0 auto'
              }} />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
