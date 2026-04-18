"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"

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
            <BlockEditorSection heading="Company Information">
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
            </BlockEditorSection>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <BlockEditorSection heading="Display Settings">
              <div className="flex items-center justify-between">
                <Label htmlFor="footer-show-unsub">Show Unsubscribe Link</Label>
                <Switch
                  id="footer-show-unsub"
                  checked={content.showUnsubscribe !== false}
                  onCheckedChange={(checked) => onContentChange("showUnsubscribe", checked)}
                />
              </div>
            </BlockEditorSection>
          ),
        },
      ]}
    />
  )
}
