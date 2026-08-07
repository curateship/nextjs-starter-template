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
  getBrandKitErrorMessage,
  saveBrandKit,
  type VideoBrandKit,
} from "@/lib/api/video/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  BRAND_COLOR_NAME_MAX,
  isBrandColorValue,
  MAX_BRAND_COLORS,
  type BrandColor,
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
