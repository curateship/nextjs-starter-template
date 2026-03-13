"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Video, Image as ImageIcon, ArrowLeft } from "lucide-react"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { useState } from "react"

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
  const [activeTab, setActiveTab] = useState('content')

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-6 pt-6 flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted"
            >
              <ArrowLeft className="w-3.5 h-4 mr-1.5" />
              Back
            </button>
          )}
          <TabsList className="gap-1">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="style">Style</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>

        {/* Content Tab */}
        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Header Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
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
                    <SelectTrigger id="video-align">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Video Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Video URL */}
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

                {/* Video Preview */}
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

              {/* Cover Image */}
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

                {/* Cover Image Preview */}
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

            </CardContent>
          </Card>
        </TabsContent>

        {/* Style Tab */}
        <TabsContent value="style">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Style options coming soon.
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Playback Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  )
}
