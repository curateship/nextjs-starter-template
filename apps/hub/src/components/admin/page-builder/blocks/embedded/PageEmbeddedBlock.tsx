import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface SharedEmbeddedBlockProps {
  code?: string
  type?: 'html' | 'script'
  visibility?: Record<string, boolean>
  onCodeChange: (value: string) => void
  onTypeChange: (value: 'html' | 'script') => void
  onVisibilityChange?: (value: Record<string, boolean>) => void
  onBack?: () => void
}

export function PageEmbeddedBlock({
  code = '',
  type = 'html',
  visibility,
  onCodeChange,
  onTypeChange,
  onVisibilityChange,
  onBack,
}: SharedEmbeddedBlockProps) {
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
                <CardContent>
                  <BlockEditorSection heading="Embed Type">
                  <div className="space-y-2">
                    <Label htmlFor="embedType">Content Type</Label>
                    <Select value={type} onValueChange={onTypeChange}>
                      <SelectTrigger id="embedType" size="button">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML (Newsletter forms, widgets)</SelectItem>
                        <SelectItem value="script">Script (stored, not executed)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {type === 'html'
                        ? 'Paste HTML code like newsletter signup forms or embedded widgets'
                        : 'Script tags are not executed on public pages. Use HTML or a trusted integration instead.'}
                    </p>
                  </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Embedded Code">
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
                      Only sanitized HTML is rendered on public pages. Script tags and event handlers are removed.
                    </p>
                  </div>
                  </BlockEditorSection>
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
              {onVisibilityChange && (
                <>
                  <VisibilitySettings
                    title="Elements Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    includeHideBlock={false}
                    helperText="Toggle specific Elements on or off"
                    useCard
                    fields={[
                      { key: 'embed', label: 'Show on Frontend' },
                    ]}
                  />
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    useCard
                    fields={[]}
                  />
                </>
              )}
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
