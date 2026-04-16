"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlignLeft, AlignCenter, AlignRight, ImageIcon, X } from "lucide-react"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { BlockEditorSection, BlockTabs } from "@/components/admin/shared/BlockTabs"

interface NewsletterHeaderBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
}

export function NewsletterHeaderBlock({ content, onContentChange, onBack, siteId }: NewsletterHeaderBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <BlockEditorSection heading="Logo">
              <div>
                {content.logoUrl ? (
                  <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                    <img
                      src={content.logoUrl}
                      alt="Logo preview"
                      className="h-full w-full object-contain"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                    <button
                      type="button"
                      onClick={() => onContentChange("logoUrl", "")}
                      className="absolute top-2 right-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div
                      className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                      onClick={() => setShowImagePicker(true)}
                    >
                      <div className="text-center text-white">
                        <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                        <p className="text-sm font-medium">Click to change image</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Click to select logo image</p>
                    </div>
                  </div>
                )}
              </div>

              {content.logoUrl && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="header-logo-width">Width (px)</Label>
                    <Input
                      id="header-logo-width"
                      type="number"
                      defaultValue={(content.logoWidth ?? 100).toString()}
                      onBlur={(e) => {
                        const num = e.target.value === "" ? 0 : parseInt(e.target.value)
                        if (!isNaN(num)) onContentChange("logoWidth", num)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="header-logo-height">Height (px)</Label>
                    <Input
                      id="header-logo-height"
                      type="number"
                      defaultValue={(content.logoHeight ?? "").toString()}
                      placeholder="Auto"
                      onBlur={(e) => {
                        const val = e.target.value
                        if (val === "") {
                          onContentChange("logoHeight", null)
                          return
                        }

                        const num = parseInt(val)
                        if (!isNaN(num)) onContentChange("logoHeight", num)
                      }}
                    />
                  </div>
                </div>
              )}

              <MediaPicker
                open={showImagePicker}
                onOpenChange={setShowImagePicker}
                onSelectMedia={(imageUrl) => {
                  onContentChange("logoUrl", imageUrl)
                  setShowImagePicker(false)
                }}
                currentMediaUrl={content.logoUrl || ""}
                showVideos={false}
                site_id={siteId}
              />
            </BlockEditorSection>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <BlockEditorSection heading="Layout">
              <div>
                <Label>Alignment</Label>
                <div className="mt-1 flex gap-1">
                  {([
                    { value: "left", icon: AlignLeft, label: "Left" },
                    { value: "center", icon: AlignCenter, label: "Center" },
                    { value: "right", icon: AlignRight, label: "Right" },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onContentChange("alignment", value)}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        (content.alignment || "center") === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="header-bg-color">Background Color</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={content.backgroundColor || "#ffffff"}
                    onChange={(e) => onContentChange("backgroundColor", e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border"
                  />
                  <Input
                    id="header-bg-color"
                    value={content.backgroundColor || "#ffffff"}
                    onChange={(e) => onContentChange("backgroundColor", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="header-padding-top">Top Padding (px)</Label>
                  <Input
                    id="header-padding-top"
                    type="number"
                    defaultValue={(content.paddingTop ?? content.padding ?? 20).toString()}
                    onBlur={(e) => {
                      const val = e.target.value
                      const num = val === "" ? 0 : parseInt(val)
                      if (!isNaN(num)) onContentChange("paddingTop", num)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="header-padding-bottom">Bottom Padding (px)</Label>
                  <Input
                    id="header-padding-bottom"
                    type="number"
                    defaultValue={(content.paddingBottom ?? content.padding ?? 20).toString()}
                    onBlur={(e) => {
                      const val = e.target.value
                      const num = val === "" ? 0 : parseInt(val)
                      if (!isNaN(num)) onContentChange("paddingBottom", num)
                    }}
                  />
                </div>
              </div>
            </BlockEditorSection>
          ),
        },
      ]}
    />
  )
}
