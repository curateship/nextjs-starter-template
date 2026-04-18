"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { BlockEditorEmptyState, BlockEditorSection } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageIcon, Play, Plus, Trash2, VideoIcon, X } from "lucide-react"
import {
  DIRECTORY_CONTACT_BUTTON_TYPES,
  getDirectoryContactTypeLabel,
  getDirectoryContactValuePlaceholder,
  type DirectoryClaimButton,
  type DirectoryContactButton,
  type DirectoryContactButtonType,
} from "@/lib/actions/directories/directory-content"
import type { DirectoryContentStyleContentProps } from "./index"

function createContactButtonId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createContactButton(type: DirectoryContactButtonType): DirectoryContactButton {
  return {
    id: createContactButtonId(),
    type,
    label: '',
    value: '',
  }
}

function normalizeClaimButton(value: unknown): Required<DirectoryClaimButton> {
  const claimButton = typeof value === 'object' && value !== null ? value as DirectoryClaimButton : {}

  return {
    enabled: claimButton.enabled ?? false,
    label: claimButton.label ?? 'Claim Listing',
    url: claimButton.url ?? '',
  }
}

export function TwoColumnListing({
  content,
  onContentChange,
  siteId,
  section = 'content',
  directoryData,
  onDirectoryFeaturedImageChange,
}: DirectoryContentStyleContentProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [showVideoPicker, setShowVideoPicker] = useState(false)
  const claimButton = normalizeClaimButton(content.claimButton)
  const contactButtons = (Array.isArray(content.contactButtons) ? content.contactButtons : []).map((button, index) => ({
    id: typeof button?.id === 'string' && button.id ? button.id : `contact-${index + 1}`,
    type: DIRECTORY_CONTACT_BUTTON_TYPES.includes(button?.type) ? button.type : 'website',
    label: typeof button?.label === 'string' ? button.label : '',
    value: typeof button?.value === 'string' ? button.value : '',
  })) as DirectoryContactButton[]
  const featuredImage = directoryData?.featured_image || ''
  const hoverVideoUrl = typeof content.hoverVideoUrl === 'string' ? content.hoverVideoUrl : ''

  const handleClaimButtonChange = (field: keyof DirectoryClaimButton, value: string | boolean) => {
    onContentChange('claimButton', {
      ...claimButton,
      [field]: value,
    })
  }

  const handleContactButtonChange = (buttonId: string, field: keyof DirectoryContactButton, value: string) => {
    onContentChange(
      'contactButtons',
      contactButtons.map((button) => (
        button.id === buttonId
          ? { ...button, [field]: value }
          : button
      ))
    )
  }

  const handleAddContactButton = (type: DirectoryContactButtonType) => {
    onContentChange('contactButtons', [...contactButtons, createContactButton(type)])
  }

  const handleRemoveContactButton = (buttonId: string) => {
    onContentChange(
      'contactButtons',
      contactButtons.filter((button) => button.id !== buttonId)
    )
  }

  const handleRemoveImage = () => {
    onDirectoryFeaturedImageChange?.('')
  }

  const handleRemoveVideo = () => {
    onContentChange('hoverVideoUrl', '')
  }

  if (section === 'claim-listing') {
    return (
      <div className="space-y-6 pt-6">
        <BlockEditorSection
          heading="Claim Listing"
          description="This button appears over the bottom gradient on the media panel."
        >
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="listing-claim-enabled">Enable Claim Button</Label>
              <p className="text-sm text-muted-foreground">CTA only for now.</p>
            </div>
            <Switch
              id="listing-claim-enabled"
              checked={claimButton.enabled}
              onCheckedChange={(checked) => handleClaimButtonChange('enabled', checked)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="listing-claim-label">Button Label</Label>
              <Input
                id="listing-claim-label"
                value={claimButton.label}
                onChange={(event) => handleClaimButtonChange('label', event.target.value)}
                placeholder="Claim Listing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="listing-claim-url">Button URL</Label>
              <Input
                id="listing-claim-url"
                value={claimButton.url}
                onChange={(event) => handleClaimButtonChange('url', event.target.value)}
                placeholder="example.com/claim"
              />
            </div>
          </div>
        </BlockEditorSection>
      </div>
    )
  }

  if (section === 'custom-buttons') {
    return (
      <div className="space-y-6 pt-6">
        <BlockEditorSection
          heading="Contact Buttons"
          description="These render as website, phone, or email action buttons under the About copy."
          action={
            <div className="flex flex-wrap gap-2">
              {DIRECTORY_CONTACT_BUTTON_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddContactButton(type)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {getDirectoryContactTypeLabel(type)}
                </Button>
              ))}
            </div>
          }
        >
          {contactButtons.length === 0 ? (
            <BlockEditorEmptyState>
              Add at least one contact button to show website, phone, or email actions on the frontend.
            </BlockEditorEmptyState>
          ) : (
            <div className="space-y-4">
              {contactButtons.map((button, index) => (
                <div key={button.id} className="space-y-4 rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">Button {index + 1}</h4>
                      <p className="text-xs text-muted-foreground">Choose the action type and the value that should open.</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveContactButton(button.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={button.type}
                        onValueChange={(value) => handleContactButtonChange(button.id, 'type', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DIRECTORY_CONTACT_BUTTON_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {getDirectoryContactTypeLabel(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Button Label</Label>
                      <Input
                        value={button.label || ''}
                        onChange={(event) => handleContactButtonChange(button.id, 'label', event.target.value)}
                        placeholder={getDirectoryContactTypeLabel(button.type)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Value</Label>
                      <Input
                        value={button.value || ''}
                        onChange={(event) => handleContactButtonChange(button.id, 'value', event.target.value)}
                        placeholder={getDirectoryContactValuePlaceholder(button.type)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BlockEditorSection>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-6">
      <BlockEditorSection
        heading="Media"
        description="The image uses the directory’s real featured image. Hover video only plays on desktop hover devices."
      >
        {onDirectoryFeaturedImageChange ? (
          <div className="space-y-3">
            <Label htmlFor="listing-featured-image">Featured Image</Label>
            <div>
              {featuredImage ? (
                <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                  <img
                    src={featuredImage}
                    alt="Featured image preview"
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
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
                    <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Shown in the right column on the live directory page.
            </p>
            <MediaPicker
              open={showImagePicker}
              onOpenChange={setShowImagePicker}
              onSelectMedia={(mediaUrl) => {
                onDirectoryFeaturedImageChange(mediaUrl)
                setShowImagePicker(false)
              }}
              currentMediaUrl={featuredImage}
              site_id={siteId}
            />
          </div>
        ) : (
          <BlockEditorEmptyState>
            Featured image comes from each real directory item at runtime. Templates do not store one here.
          </BlockEditorEmptyState>
        )}

        <div className="space-y-3">
          <Label htmlFor="listing-hover-video">Hover Video</Label>
          <div>
            {hoverVideoUrl ? (
              <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                <video
                  src={hoverVideoUrl}
                  className="h-full w-full object-contain"
                  muted
                  loop
                  playsInline
                />
                <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-black/50 p-3">
                    <Play className="h-6 w-6 fill-white text-white" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <div
                  className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                  onClick={() => setShowVideoPicker(true)}
                >
                  <div className="text-center text-white">
                    <VideoIcon className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm font-medium">Click to change video</p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                onClick={() => setShowVideoPicker(true)}
              >
                <div className="text-center">
                  <VideoIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Click to select hover video</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Use a vertical video when possible. This sits on top of the image only while hovering.
          </p>
          <MediaPicker
            open={showVideoPicker}
            onOpenChange={setShowVideoPicker}
            onSelectMedia={(mediaUrl) => {
              onContentChange('hoverVideoUrl', mediaUrl)
              setShowVideoPicker(false)
            }}
            currentMediaUrl={hoverVideoUrl}
            showVideos
            site_id={siteId}
          />
        </div>
      </BlockEditorSection>

    </div>
  )
}
