"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Video, Image as ImageIcon } from "lucide-react"
import { useState } from "react"

interface ProductVideoBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  videoUrl: string
  coverImage?: string
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onHeaderAlignChange: (value: 'left' | 'center') => void
  onVideoUrlChange: (value: string) => void
  onCoverImageChange: (value: string) => void
  onAutoplayChange: (value: boolean) => void
  onLoopChange: (value: boolean) => void
  onMutedChange: (value: boolean) => void
  siteId: string
  blockId: string
}

export function ProductVideoBlock({
  title = '',
  subtitle = '',
  headerAlign = 'left',
  videoUrl = '',
  coverImage = '',
  autoplay = false,
  loop = false,
  muted = false,
  onTitleChange,
  onSubtitleChange,
  onHeaderAlignChange,
  onVideoUrlChange,
  onCoverImageChange,
  onAutoplayChange,
  onLoopChange,
  onMutedChange,
  siteId,
  blockId,
}: ProductVideoBlockProps) {
  const [showVideoPicker, setShowVideoPicker] = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="video-title">Title</Label>
              <Input
                id="video-title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Watch Our Product in Action"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="video-subtitle">Subtitle</Label>
              <Input
                id="video-subtitle"
                value={subtitle}
                onChange={(e) => onSubtitleChange(e.target.value)}
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

      {/* Video Settings Card */}
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

          {/* Video Controls */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label htmlFor="video-autoplay" className="cursor-pointer">
                Autoplay
              </Label>
              <Switch
                id="video-autoplay"
                checked={autoplay}
                onCheckedChange={onAutoplayChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="video-loop" className="cursor-pointer">
                Loop
              </Label>
              <Switch
                id="video-loop"
                checked={loop}
                onCheckedChange={onLoopChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="video-muted" className="cursor-pointer">
                Muted
              </Label>
              <Switch
                id="video-muted"
                checked={muted}
                onCheckedChange={onMutedChange}
              />
            </div>
          </div>

          {autoplay && !muted && (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
              <strong>Note:</strong> Most browsers require videos to be muted for autoplay to work.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Picker Modal */}
      <MediaPicker
        open={showVideoPicker}
        onOpenChange={setShowVideoPicker}
        onSelectMedia={onVideoUrlChange}
        currentMediaUrl={videoUrl}
        showVideos={true}
        showImages={false}
      />

      {/* Cover Image Picker Modal */}
      <MediaPicker
        open={showCoverPicker}
        onOpenChange={setShowCoverPicker}
        onSelectMedia={onCoverImageChange}
        currentMediaUrl={coverImage}
        showVideos={false}
        showImages={true}
      />
    </div>
  )
}
