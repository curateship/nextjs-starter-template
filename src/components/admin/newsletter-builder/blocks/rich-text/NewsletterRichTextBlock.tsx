"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { ArrowLeft } from "lucide-react"

interface NewsletterRichTextBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterRichTextBlock({ content, onContentChange, onBack }: NewsletterRichTextBlockProps) {
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
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <RichTextEditor
              content={{ content: content.htmlContent || '', hideHeader: true, hideEditorHeader: true }}
              onContentChange={(c) => onContentChange('htmlContent', c.content)}
              inline
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Style Tab */}
      <TabsContent value="style" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Background & Spacing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="richtext-bg-color">Background Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={content.backgroundColor || '#ffffff'}
                  onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  id="richtext-bg-color"
                  value={content.backgroundColor || '#ffffff'}
                  onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="richtext-padding">Padding (px)</Label>
              <Input
                id="richtext-padding"
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
