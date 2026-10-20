import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import {
  createExtra,
  getExtraErrorMessage,
  updateExtra,
  type ExtraItem,
} from "@/lib/api/video/extras"
import { showErrorToast } from "@/lib/toast/error-toast"
import { DEFAULT_IMAGE_MODEL } from "@/lib/video/asset-factories"
import {
  EXTRA_KIND_LABELS,
  EXTRA_PICTURE_MISSING_MESSAGE,
  type ExtraKind,
} from "@/lib/video/extras"
import { formatCents } from "@/lib/video/project-spend"

type FormState = { name: string; prompt: string; imageMediaUrl: string }

const DRAW_CENTS = aiUnitCostCents(DEFAULT_IMAGE_MODEL, 1)

function startingForm(extra: ExtraItem | null): FormState {
  return extra
    ? { name: extra.name, prompt: extra.prompt, imageMediaUrl: extra.image_url }
    : { name: "", prompt: "", imageMediaUrl: "" }
}

/**
 * Making or editing a clothing item, backdrop, prop or hair look. The picture
 * is picked from Media, or drawn by AI from the description. Drawing again
 * replaces the picture; the old one stays in Media.
 */
export function ExtraFormDialog({
  open,
  kind,
  extra,
  onClose,
  onSaved,
}: {
  open: boolean
  kind: ExtraKind
  /** Null makes a new extra of `kind`. */
  extra: ExtraItem | null
  onClose: () => void
  onSaved: (extra: ExtraItem, created: boolean) => void
}) {
  const [form, setForm] = React.useState<FormState>(() => startingForm(extra))
  const [busy, setBusy] = React.useState<"save" | "draw" | null>(null)
  const [invalid, setInvalid] = React.useState(false)

  // A fresh form every time the window opens, on whichever extra it opens on.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(startingForm(extra))
      setInvalid(false)
    }
  }

  const label = EXTRA_KIND_LABELS[extra?.kind ?? kind].one
  const dirty = JSON.stringify(form) !== JSON.stringify(startingForm(extra))

  async function submit(draw: boolean) {
    if (!form.name.trim() || !form.prompt.trim()) {
      setInvalid(true)
      showErrorToast("Name and description are required.")
      return
    }
    if (!draw && !form.imageMediaUrl) {
      showErrorToast(EXTRA_PICTURE_MISSING_MESSAGE)
      return
    }
    setBusy(draw ? "draw" : "save")
    try {
      const fields = {
        name: form.name,
        prompt: form.prompt,
        imageMediaUrl: form.imageMediaUrl || null,
      }
      const saved = extra
        ? await updateExtra(extra.id, fields, draw)
        : await createExtra({ ...fields, kind }, draw)
      onSaved(saved, !extra)
    } catch (error) {
      showErrorToast(getExtraErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy !== null} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{extra ? `Edit ${label}` : `Create ${label}`}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{EXTRA_KIND_LABELS[extra?.kind ?? kind].tab}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="extra-name">Name</Label>
                  <Input
                    id="extra-name"
                    value={form.name}
                    maxLength={200}
                    aria-invalid={(invalid && !form.name.trim()) || undefined}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="extra-description">Description</Label>
                  <Textarea
                    id="extra-description"
                    rows={1}
                    value={form.prompt}
                    maxLength={5000}
                    aria-invalid={(invalid && !form.prompt.trim()) || undefined}
                    onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  />
                </div>
                <ImageUpload
                  label="Picture"
                  value={form.imageMediaUrl}
                  onChange={(value) => setForm({ ...form, imageMediaUrl: value })}
                  aspect="square"
                  fit="contain"
                  disabled={busy !== null}
                  className="max-w-32"
                  hint="Pick one from Media, or press Draw with AI to make one from the description."
                />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void submit(true)}>
              {busy === "draw" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Draw with AI · {formatCents(DRAW_CENTS)}
            </Button>
            <Button type="button" disabled={busy !== null} onClick={() => void submit(false)}>
              {busy === "save" ? <Loader2Icon className="animate-spin" /> : null}
              {extra ? "Save changes" : `Create ${label}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
