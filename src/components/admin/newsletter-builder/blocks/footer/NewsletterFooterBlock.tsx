"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"

interface NewsletterFooterBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterFooterBlock({ content, onContentChange, onBack }: NewsletterFooterBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
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
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Layout</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
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
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}
