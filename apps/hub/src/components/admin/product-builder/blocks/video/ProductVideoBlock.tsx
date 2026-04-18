"use client"

import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { BlockTabs } from "@/components/ui/tabs"
import { Video, Image as ImageIcon } from "lucide-react"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { useState } from "react"
import { BlockEditorEmptyState, BlockEditorSection } from "@/components/ui/tabs"

interface ProductVideoBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  videoUrl: string
  coverImage?: string
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange: (value: 'left' | 'center') => void
  onVideoUrlChange: (value: string) => void
  onCoverImageChange: (value: string) => void
  onAutoplayChange: (value: boolean) => void
  onLoopChange: (value: boolean) => void
  onMutedChange: (value: boolean) => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
  onBack?: () => void
  siteId: string
  blockId: string
}

export function ProductVideoBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  videoUrl = '',
  coverImage = '',
  autoplay = false,
  loop = false,
  muted = false,
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onVideoUrlChange,
  onCoverImageChange,
  onAutoplayChange,
  onLoopChange,
  onMutedChange,
  visibility,
  onVisibilityChange,
  onBack,
  siteId,
  blockId,
}: ProductVideoBlockProps) {
  const [showVideoPicker, setShowVideoPicker] = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <div className="space-y-6">
                <BlockEditorSection heading="Header Settings">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="video-title">Header</Label>
                        <Input
                          id="video-title"
                          value={header}
                          onChange={(e) => onHeaderChange(e.target.value)}
                          placeholder="Watch Our Product in Action"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="video-subtitle">Sub Header</Label>
                        <Input
                          id="video-subtitle"
                          value={subheader}
                          onChange={(e) => onSubheaderChange(e.target.value)}
                          placeholder="See how our product works"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="video-align">Header Alignment</Label>
                        <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                          <SelectTrigger id="video-align" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                </BlockEditorSection>

                <BlockEditorSection heading="Video Settings">
                    <div className="space-y-2">
                      <Label>Video</Label>
                      <div className="flex gap-2">
                        <Input
                          value={videoUrl}
                          onChange={(e) => onVideoUrlChange(e.target.value)}
                          placeholder="Enter video URL or click to select from library"
                          readOnly
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowVideoPicker(true)}
                        >
                          <Video className="w-4 h-4 mr-1" />
                          Select Video
                        </Button>
                      </div>

                      {videoUrl && (
                        <div className="mt-3">
                          <div className="relative w-full max-w-md aspect-video rounded-lg overflow-hidden border bg-black">
                            <video
                              src={videoUrl.startsWith('http') ? `/api/media/proxy?url=${encodeURIComponent(videoUrl)}` : videoUrl}
                              controls
                              poster={coverImage}
                              className="w-full h-full object-contain"
                              autoPlay={autoplay}
                              loop={loop}
                              muted={muted}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Cover Image (Poster)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={coverImage}
                          onChange={(e) => onCoverImageChange(e.target.value)}
                          placeholder="Enter image URL or click to select from library"
                          readOnly
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowCoverPicker(true)}
                        >
                          <ImageIcon className="w-4 h-4 mr-1" />
                          Select Image
                        </Button>
                      </div>

                      {coverImage && (
                        <div className="mt-3">
                          <img
                            src={coverImage}
                            alt="Video cover"
                            className="w-full max-w-md aspect-video object-cover rounded-lg border"
                          />
                        </div>
                      )}
                    </div>
                </BlockEditorSection>
              </div>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <>
                {onVisibilityChange && (
                  <VisibilitySettings
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    fields={[
                      { key: 'header', label: 'Header' },
                      { key: 'subheader', label: 'Sub Header' },
                    ]}
                  />
                )}

                <BlockEditorSection heading="Playback Settings">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="video-autoplay"
                        checked={autoplay}
                        onCheckedChange={(checked) => onAutoplayChange(checked === true)}
                      />
                      <Label htmlFor="video-autoplay" className="cursor-pointer">Autoplay</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="video-loop"
                        checked={loop}
                        onCheckedChange={(checked) => onLoopChange(checked === true)}
                      />
                      <Label htmlFor="video-loop" className="cursor-pointer">Loop</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="video-muted"
                        checked={muted}
                        onCheckedChange={(checked) => onMutedChange(checked === true)}
                      />
                      <Label htmlFor="video-muted" className="cursor-pointer">Muted</Label>
                    </div>

                    {autoplay && !muted && (
                      <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                        <strong>Note:</strong> Most browsers require videos to be muted for autoplay to work.
                      </div>
                    )}
                </BlockEditorSection>
              </>
            ),
          },
        ]}
      />

      {/* Video Picker Modal */}
      <MediaPicker
        open={showVideoPicker}
        onOpenChange={setShowVideoPicker}
        onSelectMedia={onVideoUrlChange}
        currentMediaUrl={videoUrl}
        showVideos={true}
      />

      {/* Cover Image Picker Modal */}
      <MediaPicker
        open={showCoverPicker}
        onOpenChange={setShowCoverPicker}
        onSelectMedia={onCoverImageChange}
        currentMediaUrl={coverImage}
        showVideos={false}
      />
    </>
  )
}
