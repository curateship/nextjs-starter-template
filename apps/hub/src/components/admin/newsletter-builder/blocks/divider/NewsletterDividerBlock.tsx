"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/admin/shared/BlockTabs"

interface NewsletterDividerBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function NewsletterDividerBlock({ content, onContentChange, onBack }: NewsletterDividerBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="space-y-6">
              <BlockEditorSection heading="Divider Settings">
                <div>
                  <Label htmlFor="divider-color">Color</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={content.color || "#e5e7eb"}
                      onChange={(e) => onContentChange("color", e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded border"
                    />
                    <Input
                      id="divider-color"
                      value={content.color || "#e5e7eb"}
                      onChange={(e) => onContentChange("color", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="divider-thickness">Thickness (px)</Label>
                    <Input
                      id="divider-thickness"
                      type="number"
                      defaultValue={(content.thickness ?? 1).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === "" ? 1 : parseInt(val)
                        if (!isNaN(num)) onContentChange("thickness", num)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="divider-width">Width (%)</Label>
                    <Input
                      id="divider-width"
                      type="number"
                      defaultValue={(content.width ?? 100).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === "" ? 100 : parseInt(val)
                        if (!isNaN(num)) onContentChange("width", num)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="divider-spacing">Vertical Spacing (px)</Label>
                    <Input
                      id="divider-spacing"
                      type="number"
                      defaultValue={(content.spacing ?? 20).toString()}
                      onBlur={(e) => {
                        const val = e.target.value
                        const num = val === "" ? 0 : parseInt(val)
                        if (!isNaN(num)) onContentChange("spacing", num)
                      }}
                    />
                  </div>
                </div>
              </BlockEditorSection>

              <BlockEditorSection heading="Preview">
                <div style={{ padding: `${content.spacing ?? 20}px 0`, textAlign: "center" }}>
                  <hr
                    style={{
                      border: "none",
                      borderTop: `${content.thickness ?? 1}px solid ${content.color || "#e5e7eb"}`,
                      width: `${content.width ?? 100}%`,
                      margin: "0 auto",
                    }}
                  />
                </div>
              </BlockEditorSection>
            </div>
          ),
        },
      ]}
    />
  )
}
