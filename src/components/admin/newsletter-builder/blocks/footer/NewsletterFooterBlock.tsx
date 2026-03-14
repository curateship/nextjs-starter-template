"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft } from "lucide-react"

interface NewsletterFooterBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterFooterBlock({ content, onContentChange, onBack }: NewsletterFooterBlockProps) {
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
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="footer-company-name">Company Name</Label>
              <Input
                id="footer-company-name"
                value={content.companyName || ''}
                onChange={(e) => onContentChange('companyName', e.target.value)}
                placeholder="Your Company"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="footer-company-address">Company Address</Label>
              <Input
                id="footer-company-address"
                value={content.companyAddress || ''}
                onChange={(e) => onContentChange('companyAddress', e.target.value)}
                placeholder="123 Main St, City, State 12345"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Display Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="footer-show-unsub">Show Unsubscribe Link</Label>
              <Switch
                id="footer-show-unsub"
                checked={content.showUnsubscribe !== false}
                onCheckedChange={(checked) => onContentChange('showUnsubscribe', checked)}
              />
            </div>
            <div>
              <Label htmlFor="footer-alignment">Alignment</Label>
              <Select value={content.alignment || 'center'} onValueChange={(v) => onContentChange('alignment', v)}>
                <SelectTrigger id="footer-alignment" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
