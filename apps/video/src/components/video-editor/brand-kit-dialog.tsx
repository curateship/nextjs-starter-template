import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
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
  getBrandKitErrorMessage,
  saveBrandKit,
  type VideoBrandKit,
} from "@/lib/api/video/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  BRAND_COLOR_NAME_MAX,
  END_CARD_TEXT_MAX,
  isBrandColorValue,
  MAX_BRAND_COLORS,
  WATERMARK_POSITIONS,
  type BrandColor,
  type WatermarkPosition,
} from "@/lib/video/brand-kit"

/**
 * Editing the brand kit. It belongs to the whole install rather than to one
 * project, which is why saving it is an admin action — and why this is an
 * ordinary window built from the app's shared parts rather than another piece
 * of the editor's own furniture.
 */
export function BrandKitDialog({
  open,
  onOpenChange,
  brandKit,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandKit: VideoBrandKit
  onSaved: (brandKit: VideoBrandKit) => void
}) {
  const [draft, setDraft] = React.useState(brandKit)
  const [saving, setSaving] = React.useState(false)

  // Start again from what is stored each time the window opens, so a
  // half-finished edit that was thrown away does not come back.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setDraft(brandKit)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(brandKit)

  function setColor(index: number, patch: Partial<BrandColor>) {
    setDraft((current) => ({
      ...current,
      colors: current.colors.map((color, position) =>
        position === index ? { ...color, ...patch } : color
      ),
    }))
  }

  async function handleSave() {
    const badColor = draft.colors.find(
      (color) => !color.name.trim() || !isBrandColorValue(color.value)
    )
    if (badColor) {
      showErrorToast(
        "Every colour needs a name and a hex value like #22c55e."
      )
      return
    }
    setSaving(true)
    try {
      const saved = await saveBrandKit({
        colors: draft.colors.map((color) => ({
          name: color.name.trim(),
          value: color.value,
        })),
        logoUrl: draft.logoUrl,
        watermark: draft.watermark,
        endCard: draft.endCard,
        normalizeLoudness: draft.normalizeLoudness,
      })
      dismissErrorToast()
      onSaved(saved)
      onOpenChange(false)
      toast.success("Brand kit saved.")
    } catch (error) {
      showErrorToast(getBrandKitErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={dirty}
      busy={saving}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Brand kit</DialogTitle>
            <DialogDescription>
              The colours and logo every project in this app is built from.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Colours</CardTitle>
                  <CardDescription>
                    These are the swatches offered when you colour text in the
                    editor.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {draft.colors.map((color, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    >
                      <div className="grid flex-1 gap-2">
                        <Label htmlFor={`brand-color-name-${index}`}>
                          Name
                        </Label>
                        <Input
                          id={`brand-color-name-${index}`}
                          value={color.name}
                          maxLength={BRAND_COLOR_NAME_MAX}
                          aria-invalid={!color.name.trim()}
                          onChange={(event) =>
                            setColor(index, { name: event.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`brand-color-value-${index}`}>
                          Colour
                        </Label>
                        <Input
                          id={`brand-color-value-${index}`}
                          type="color"
                          className="w-16 p-1"
                          value={
                            isBrandColorValue(color.value)
                              ? color.value
                              : "#000000"
                          }
                          onChange={(event) =>
                            setColor(index, { value: event.target.value })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${color.name || "colour"}`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            colors: current.colors.filter(
                              (_, position) => position !== index
                            ),
                          }))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={draft.colors.length >= MAX_BRAND_COLORS}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          colors: [
                            ...current.colors,
                            { name: "New colour", value: "#5b52e8" },
                          ],
                        }))
                      }
                    >
                      <PlusIcon />
                      Add colour
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Logo</CardTitle>
                  <CardDescription>
                    Shown in the Brand panel, and used for the watermark and end
                    card below.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ImageUpload
                    label="Logo"
                    hint="Shown in the Brand panel while editing."
                    value={draft.logoUrl}
                    fit="contain"
                    disabled={saving}
                    onChange={(logoUrl) =>
                      setDraft((current) => ({ ...current, logoUrl }))
                    }
                  />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>On every export</CardTitle>
                  <CardDescription>
                    What gets added to a video when it is made.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="grid gap-0.5">
                      <Label htmlFor="brand-watermark">Watermark</Label>
                      <span className="text-sm text-muted-foreground">
                        The logo, sat in a corner of the picture.
                      </span>
                    </span>
                    <Switch
                      id="brand-watermark"
                      checked={draft.watermark.enabled}
                      onCheckedChange={(enabled) =>
                        setDraft((current) => ({
                          ...current,
                          watermark: { ...current.watermark, enabled },
                        }))
                      }
                    />
                  </div>
                  {draft.watermark.enabled ? (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="grid gap-2">
                        <Label htmlFor="brand-watermark-position">Corner</Label>
                        <Select
                          value={draft.watermark.position}
                          onValueChange={(position) =>
                            setDraft((current) => ({
                              ...current,
                              watermark: {
                                ...current.watermark,
                                position: position as WatermarkPosition,
                              },
                            }))
                          }
                        >
                          <SelectTrigger
                            id="brand-watermark-position"
                            className="w-full sm:w-fit"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WATERMARK_POSITIONS.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid flex-1 gap-2">
                        <Label htmlFor="brand-watermark-width">
                          How wide ({draft.watermark.widthPercent}% of the frame)
                        </Label>
                        <Slider
                          id="brand-watermark-width"
                          min={4}
                          max={50}
                          step={1}
                          value={[draft.watermark.widthPercent]}
                          onValueChange={([widthPercent]) =>
                            setDraft((current) => ({
                              ...current,
                              watermark: { ...current.watermark, widthPercent },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-4">
                    <span className="grid gap-0.5">
                      <Label htmlFor="brand-end-card">End card</Label>
                      <span className="text-sm text-muted-foreground">
                        A few seconds on the end with the logo and a line.
                      </span>
                    </span>
                    <Switch
                      id="brand-end-card"
                      checked={draft.endCard.enabled}
                      onCheckedChange={(enabled) =>
                        setDraft((current) => ({
                          ...current,
                          endCard: { ...current.endCard, enabled },
                        }))
                      }
                    />
                  </div>
                  {draft.endCard.enabled ? (
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="brand-end-card-text">
                          What it says
                        </Label>
                        <Input
                          id="brand-end-card-text"
                          value={draft.endCard.ctaText}
                          maxLength={END_CARD_TEXT_MAX}
                          placeholder="Follow for more"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              endCard: {
                                ...current.endCard,
                                ctaText: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="brand-end-card-colour">Behind it</Label>
                        <Input
                          id="brand-end-card-colour"
                          type="color"
                          className="w-16 p-1"
                          value={
                            isBrandColorValue(draft.endCard.backgroundColor)
                              ? draft.endCard.backgroundColor
                              : "#111827"
                          }
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              endCard: {
                                ...current.endCard,
                                backgroundColor: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="brand-end-card-seconds">
                          How long ({draft.endCard.durationSeconds} seconds)
                        </Label>
                        <Slider
                          id="brand-end-card-seconds"
                          min={1}
                          max={10}
                          step={1}
                          value={[draft.endCard.durationSeconds]}
                          onValueChange={([durationSeconds]) =>
                            setDraft((current) => ({
                              ...current,
                              endCard: { ...current.endCard, durationSeconds },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-4">
                    <span className="grid gap-0.5">
                      <Label htmlFor="brand-normalize">Even out the sound</Label>
                      <span className="text-sm text-muted-foreground">
                        Brings every export to the loudness the apps play videos
                        at. One export can still be made without it.
                      </span>
                    </span>
                    <Switch
                      id="brand-normalize"
                      checked={draft.normalizeLoudness}
                      onCheckedChange={(normalizeLoudness) =>
                        setDraft((current) => ({ ...current, normalizeLoudness }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
