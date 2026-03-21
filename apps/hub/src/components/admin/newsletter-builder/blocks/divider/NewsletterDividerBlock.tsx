"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"

interface NewsletterDividerBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterDividerBlock({ content, onContentChange, onBack }: NewsletterDividerBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: null,
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <>
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
                    <input
                      id="divider-thickness"
                      type="text"
                      defaultValue={(content.thickness ?? 1).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === '' ? 1 : parseInt(val)
                        if (!isNaN(num)) {
                          onContentChange('thickness', num)
                        }
                      }}
                      className="border p-2 rounded-md mt-1"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="divider-width">Width (%)</Label>
                    <input
                      id="divider-width"
                      type="text"
                      defaultValue={(content.width ?? 100).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === '' ? 100 : parseInt(val)
                        if (!isNaN(num)) {
                          onContentChange('width', num)
                        }
                      }}
                      className="border p-2 rounded-md mt-1"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="divider-spacing">Vertical Spacing (px)</Label>
                    <input
                      id="divider-spacing"
                      type="text"
                      defaultValue={(content.spacing ?? 20).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === '' ? 0 : parseInt(val)
                        if (!isNaN(num)) {
                          onContentChange('spacing', num)
                        }
                      }}
                      className="border p-2 rounded-md mt-1"
                      style={{ width: '100%' }}
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
            </>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: null,
        },
      ]}
    />
  )
}
