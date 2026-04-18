"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ImageIcon, X } from "lucide-react"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import type { LeadMagnetStyleAdminProps } from "."
import { BlockEditorSection } from "@/components/ui/tabs"

export function DefaultLeadMagnetConfig({ config, onConfigChange, siteId }: LeadMagnetStyleAdminProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  const showcaseImage = config.showcaseImage || ''
  const showBorderBeam = config.showBorderBeam ?? true
  const showPrivacyNote = config.showPrivacyNote ?? true
  const beamColorFrom = config.beamColorFrom || '#ffaa40'
  const beamColorTo = config.beamColorTo || '#9c40ff'

  return (
    <div className="space-y-4">
      <BlockEditorSection heading="Showcase Image">
          <div className="relative">
            {showcaseImage ? (
              <div
                className="relative w-[100px] h-[100px] rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowImagePicker(true)}
              >
                <img
                  src={showcaseImage}
                  alt="Showcase preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                  <div className="text-white text-center">
                    <ImageIcon className="mx-auto h-6 w-6 mb-1" />
                    <p className="text-xs font-medium">Click to change image</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onConfigChange('showcaseImage', '')
                  }}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-sm transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center justify-center w-[100px] h-[100px] rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                onClick={() => setShowImagePicker(true)}
              >
                <div className="text-center">
                  <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/50" />
                  <p className="mt-1 text-xs text-muted-foreground">Click to select image</p>
                </div>
              </div>
            )}
          </div>
      </BlockEditorSection>

      <BlockEditorSection heading="Border Beam Effect">
          <div className="flex items-center gap-2">
            <Checkbox
              id="showBorderBeam"
              checked={showBorderBeam}
              onCheckedChange={(checked) => onConfigChange('showBorderBeam', !!checked)}
            />
            <Label htmlFor="showBorderBeam">Enable border beam animation</Label>
          </div>

          {showBorderBeam && (
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Color From</Label>
                <Input
                  type="color"
                  value={beamColorFrom}
                  onChange={(e) => onConfigChange('beamColorFrom', e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color To</Label>
                <Input
                  type="color"
                  value={beamColorTo}
                  onChange={(e) => onConfigChange('beamColorTo', e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
              </div>
            </div>
          )}
      </BlockEditorSection>

      <BlockEditorSection heading="Display Options">
          <div className="flex items-center gap-2">
            <Checkbox
              id="downloadShowPrivacyNote"
              checked={showPrivacyNote}
              onCheckedChange={(checked) => onConfigChange('showPrivacyNote', !!checked)}
            />
            <Label htmlFor="downloadShowPrivacyNote">Show privacy note</Label>
          </div>
      </BlockEditorSection>

      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(url) => {
          onConfigChange('showcaseImage', url)
          setShowImagePicker(false)
        }}
        currentMediaUrl={showcaseImage}
        showVideos={false}
      />
    </div>
  )
}
