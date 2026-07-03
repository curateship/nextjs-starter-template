import * as React from "react"
import { ImageIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { TextFontSelect } from "@/components/text-font-select"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ColorPicker } from "@/components/ui/color-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  BRAND_KIT_WATERMARK_POSITIONS,
  brandKitExportFilename,
  type BrandKitConfig,
  type ShellConfig,
} from "@/lib/ai-video"
import type { MediaItem } from "@/lib/api/media"
import type { TextFontId } from "@/lib/text-fonts"

type BrandKitSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
}

const POSITION_LABELS: Record<BrandKitConfig["watermark"]["position"], string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
}

export function BrandKitSettings({
  config,
  isSaving,
  onConfigChange,
}: BrandKitSettingsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const brandKit = config.brandKit

  function updateBrandKit(patch: Partial<BrandKitConfig>) {
    onConfigChange({
      ...config,
      brandKit: { ...brandKit, ...patch },
    })
  }

  function updateCaptionFont(fontId: TextFontId) {
    updateBrandKit({
      fonts: { ...brandKit.fonts, caption: fontId },
      captionStyle: { ...brandKit.captionStyle, fontId },
    })
  }

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
          <CardDescription>
            Save reusable hex swatches for editor text and caption controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {brandKit.colors.map((color, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`brand-color-name-${index}`}>Name</Label>
                <Input
                  id={`brand-color-name-${index}`}
                  value={color.name}
                  maxLength={40}
                  disabled={isSaving}
                  onChange={(event) => {
                    const colors = [...brandKit.colors]
                    colors[index] = { ...color, name: event.target.value }
                    updateBrandKit({ colors })
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`brand-color-value-${index}`}>Hex</Label>
                <ColorPicker
                  id={`brand-color-value-${index}`}
                  value={color.value}
                  disabled={isSaving}
                  onChange={(value) => {
                    const colors = [...brandKit.colors]
                    colors[index] = { ...color, value }
                    updateBrandKit({ colors })
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                disabled={isSaving || brandKit.colors.length <= 1}
                aria-label="Remove color"
                onClick={() =>
                  updateBrandKit({
                    colors: brandKit.colors.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={isSaving || brandKit.colors.length >= 20}
            onClick={() =>
              updateBrandKit({
                colors: [
                  ...brandKit.colors,
                  { name: "Color", value: "#ffffff" },
                ],
              })
            }
          >
            <PlusIcon className="size-4" />
            Add Color
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fonts</CardTitle>
          <CardDescription>
            Choose bundled render-safe fonts for brand text defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <FontSelect
            id="brand-heading-font"
            label="Heading"
            value={brandKit.fonts.heading}
            disabled={isSaving}
            onChange={(heading) =>
              updateBrandKit({ fonts: { ...brandKit.fonts, heading } })
            }
          />
          <FontSelect
            id="brand-body-font"
            label="Body"
            value={brandKit.fonts.body}
            disabled={isSaving}
            onChange={(body) =>
              updateBrandKit({ fonts: { ...brandKit.fonts, body } })
            }
          />
          <FontSelect
            id="brand-caption-font"
            label="Caption"
            value={brandKit.fonts.caption}
            disabled={isSaving}
            onChange={updateCaptionFont}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caption Defaults</CardTitle>
          <CardDescription>
            Set the starting look for generated captions and voice captions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Font size</Label>
              <Slider
                value={[brandKit.captionStyle.fontSize]}
                min={8}
                max={240}
                step={2}
                disabled={isSaving}
                onValueChange={(value) =>
                  updateBrandKit({
                    captionStyle: {
                      ...brandKit.captionStyle,
                      fontSize: value[0],
                    },
                  })
                }
                aria-label="Caption font size"
              />
              <span className="text-xs text-muted-foreground">
                {brandKit.captionStyle.fontSize}px
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="brand-caption-color">Text color</Label>
              <ColorPicker
                id="brand-caption-color"
                value={brandKit.captionStyle.color}
                disabled={isSaving}
                onChange={(color) =>
                  updateBrandKit({
                    captionStyle: { ...brandKit.captionStyle, color },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="brand-highlight-toggle">Highlight</Label>
                <Switch
                  id="brand-highlight-toggle"
                  checked={!!brandKit.captionStyle.highlightColor}
                  disabled={isSaving}
                  onCheckedChange={(enabled) =>
                    updateBrandKit({
                      captionStyle: {
                        ...brandKit.captionStyle,
                        highlightColor: enabled ? "#000000" : null,
                      },
                    })
                  }
                  aria-label="Toggle caption highlight"
                />
              </div>
              {brandKit.captionStyle.highlightColor ? (
                <ColorPicker
                  id="brand-highlight-color"
                  value={brandKit.captionStyle.highlightColor}
                  disabled={isSaving}
                  onChange={(highlightColor) =>
                    updateBrandKit({
                      captionStyle: {
                        ...brandKit.captionStyle,
                        highlightColor,
                      },
                    })
                  }
                  aria-label="Highlight color"
                />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo / Watermark</CardTitle>
          <CardDescription>
            Select a media-library image and control automatic export stamping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isSaving}
              className="grid h-20 min-w-20 place-items-center border border-dashed bg-muted/50 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setPickerOpen(true)}
              aria-label={brandKit.logo.mediaId ? "Change logo" : "Select logo"}
            >
              {brandKit.logo.previewUrl ? (
                <img
                  src={brandKit.logo.previewUrl}
                  alt="Logo preview"
                  className="h-20 w-auto object-contain"
                />
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  <ImageIcon className="mx-auto mb-1 h-4 w-4" />
                  Select
                </div>
              )}
            </button>
            {brandKit.logo.mediaId ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() =>
                  updateBrandKit({ logo: { mediaId: null, previewUrl: "" } })
                }
              >
                Remove Logo
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
              <Label htmlFor="brand-watermark-enabled">Enabled</Label>
              <Switch
                id="brand-watermark-enabled"
                checked={brandKit.watermark.enabled}
                disabled={isSaving}
                onCheckedChange={(enabled) =>
                  updateBrandKit({
                    watermark: { ...brandKit.watermark, enabled },
                  })
                }
                aria-label="Enable watermark"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="brand-watermark-position">Position</Label>
              <Select
                value={brandKit.watermark.position}
                disabled={isSaving}
                onValueChange={(position) =>
                  updateBrandKit({
                    watermark: {
                      ...brandKit.watermark,
                      position: position as BrandKitConfig["watermark"]["position"],
                    },
                  })
                }
              >
                <SelectTrigger id="brand-watermark-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAND_KIT_WATERMARK_POSITIONS.map((position) => (
                    <SelectItem key={position} value={position}>
                      {POSITION_LABELS[position]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PercentSlider
              id="brand-watermark-width"
              label="Width"
              value={brandKit.watermark.widthPercent}
              min={1}
              disabled={isSaving}
              onChange={(widthPercent) =>
                updateBrandKit({
                  watermark: { ...brandKit.watermark, widthPercent },
                })
              }
            />
            <PercentSlider
              id="brand-watermark-opacity"
              label="Opacity"
              value={brandKit.watermark.opacity}
              disabled={isSaving}
              onChange={(opacity) =>
                updateBrandKit({
                  watermark: { ...brandKit.watermark, opacity },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CTA Phrases</CardTitle>
          <CardDescription>
            Add short calls to action for AI-written marketing copy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {brandKit.ctaPhrases.map((phrase, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={phrase}
                maxLength={180}
                disabled={isSaving}
                onChange={(event) => {
                  const ctaPhrases = [...brandKit.ctaPhrases]
                  ctaPhrases[index] = event.target.value
                  updateBrandKit({ ctaPhrases })
                }}
                placeholder="Start your free trial today"
                aria-label={`CTA phrase ${index + 1}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                disabled={isSaving}
                aria-label="Remove CTA phrase"
                onClick={() =>
                  updateBrandKit({
                    ctaPhrases: brandKit.ctaPhrases.filter(
                      (_, i) => i !== index
                    ),
                  })
                }
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={isSaving || brandKit.ctaPhrases.length >= 20}
            onClick={() =>
              updateBrandKit({
                ctaPhrases: [...brandKit.ctaPhrases, "Book a demo"],
              })
            }
          >
            <PlusIcon className="size-4" />
            Add Phrase
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Naming</CardTitle>
          <CardDescription>
            Use tokens to prefill new export file names.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="brand-export-pattern">Pattern</Label>
            <Input
              id="brand-export-pattern"
              value={brandKit.exportNamingPattern}
              maxLength={120}
              disabled={isSaving}
              onChange={(event) =>
                updateBrandKit({ exportNamingPattern: event.target.value })
              }
              placeholder="{project}-{date}"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Preview:{" "}
            <span className="font-mono text-foreground">
              {previewExportName(brandKit.exportNamingPattern, config)}.mp4
            </span>
          </p>
        </CardContent>
      </Card>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl, _alt, media?: MediaItem) =>
          updateBrandKit({
            logo:
              mediaUrl && media
                ? { mediaId: media.id, previewUrl: mediaUrl }
                : { mediaId: null, previewUrl: "" },
          })
        }
        currentMediaUrl={brandKit.logo.previewUrl}
        showVideos={false}
      />
    </CardGroup>
  )
}

function FontSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: TextFontId
  disabled: boolean
  onChange: (value: TextFontId) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <TextFontSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  )
}

function PercentSlider({
  id,
  label,
  value,
  min = 0,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: number
  min?: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0])}
        aria-label={label}
      />
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  )
}

function previewExportName(pattern: string, config: ShellConfig) {
  return brandKitExportFilename(pattern, "my-reel", config.workspaceName)
}
