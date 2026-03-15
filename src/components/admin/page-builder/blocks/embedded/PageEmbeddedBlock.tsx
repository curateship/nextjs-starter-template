import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface SharedEmbeddedBlockProps {
  code?: string
  type?: 'html' | 'script'
  visibility?: Record<string, boolean>
  onCodeChange: (value: string) => void
  onTypeChange: (value: 'html' | 'script') => void
  onVisibilityChange?: (value: Record<string, boolean>) => void
}

export function PageEmbeddedBlock({
  code = '',
  type = 'html',
  visibility,
  onCodeChange,
  onTypeChange,
  onVisibilityChange,
}: SharedEmbeddedBlockProps) {
  return (
    <BlockTabs
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <div className="space-y-4">
              {/* Type Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Embed Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="embedType">Content Type</Label>
                    <Select value={type} onValueChange={onTypeChange}>
                      <SelectTrigger id="embedType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML (Newsletter forms, widgets)</SelectItem>
                        <SelectItem value="script">Script (Tracking, analytics)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {type === 'html'
                        ? 'Paste HTML code like newsletter signup forms or embedded widgets'
                        : 'Paste JavaScript code or script tags for tracking and analytics'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Code Editor */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Embedded Code</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="embeddedCode">
                      {type === 'html' ? 'HTML Code' : 'Script Code'}
                    </Label>
                    <Textarea
                      id="embeddedCode"
                      value={code}
                      onChange={(e) => onCodeChange(e.target.value)}
                      placeholder={
                        type === 'html'
                          ? '<!-- Paste your HTML code here -->\n<div>\n  <!-- Newsletter form, widget, etc. -->\n</div>'
                          : '// Paste your script code here\n<script>\n  // Analytics, tracking, etc.\n</script>'
                      }
                      className="font-mono text-sm min-h-[300px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      The code will be rendered exactly as entered on your public page.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="space-y-4">
              {onVisibilityChange && (
                <VisibilitySettings
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  fields={[
                    { key: 'embed', label: 'Show on Frontend' },
                  ]}
                />
              )}
            </div>
          ),
        },
      ]}
    />
  )
}
