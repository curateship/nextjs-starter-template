"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { BlockTabs } from "@/components/ui/tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

interface NewsletterFooterBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterFooterBlock({ content, onContentChange, onBack }: NewsletterFooterBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader className="p-4 pb-3">
                  <DashboardModalCardTitle>Company Information</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0">
                  <div className="space-y-2">
                    <Label htmlFor="footer-company-name">Company Name</Label>
                    <Input
                      id="footer-company-name"
                      value={content.companyName || ""}
                      onChange={(e) => onContentChange("companyName", e.target.value)}
                      placeholder="Your Company"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="footer-company-address">Company Address</Label>
                    <Input
                      id="footer-company-address"
                      value={content.companyAddress || ""}
                      onChange={(e) => onContentChange("companyAddress", e.target.value)}
                      placeholder="123 Main St, City, State 12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="footer-alignment">Alignment</Label>
                    <Select value={content.alignment || "center"} onValueChange={(v) => onContentChange("alignment", v)}>
                      <SelectTrigger id="footer-alignment" size="button">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader className="p-4 pb-3">
                  <DashboardModalCardTitle>Display Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="footer-show-unsub">Show Unsubscribe Link</Label>
                    <Switch
                      id="footer-show-unsub"
                      checked={content.showUnsubscribe !== false}
                      onCheckedChange={(checked) => onContentChange("showUnsubscribe", checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
