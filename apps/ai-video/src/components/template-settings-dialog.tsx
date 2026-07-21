import * as React from "react"
import {
  ImagePlusIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type { MediaItem } from "@/lib/api/media"
import {
  getTemplateErrorMessage,
  renameTemplate,
  setTemplateCover,
} from "@/lib/api/video-templates"

export type TemplateSettingsUpdate = {
  id: string
  name?: string
  thumbnail_url?: string | null
}

export function TemplateSettingsDialog({
  open,
  onOpenChange,
  templateId,
  initialName,
  thumbnailUrl,
  onTemplateUpdated,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
  initialName: string
  thumbnailUrl: string | null
  onTemplateUpdated?: (update: TemplateSettingsUpdate) => void
  onSaved?: () => void
}) {
  const [name, setName] = React.useState(initialName)
  const [coverUrl, setCoverUrl] = React.useState(thumbnailUrl)
  const [submitting, setSubmitting] = React.useState(false)
  const [coverUploading, setCoverUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const initializedTemplateRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      initializedTemplateRef.current = null
      return
    }
    if (initializedTemplateRef.current === templateId) return
    initializedTemplateRef.current = templateId
    setName(initialName)
    setCoverUrl(thumbnailUrl)
    setSubmitting(false)
    setCoverUploading(false)
    setError(null)
  }, [initialName, open, templateId, thumbnailUrl])

  const disabled = submitting || coverUploading || !name.trim() || !templateId

  async function handleSave() {
    if (!templateId) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await renameTemplate(templateId, name)
      onTemplateUpdated?.({
        id: updated.id,
        name: updated.name,
        thumbnail_url: updated.thumbnail_url,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (caught) {
      setError(getTemplateErrorMessage(caught))
      setSubmitting(false)
    }
  }

  async function handleCoverSelect(media?: MediaItem) {
    if (!templateId || !media) return
    setCoverUploading(true)
    setError(null)
    try {
      const updated = await setTemplateCover(templateId, media.id)
      setCoverUrl(updated.thumbnail_url)
      onTemplateUpdated?.({
        id: updated.templateId,
        thumbnail_url: updated.thumbnail_url,
      })
    } catch (caught) {
      setError(getTemplateErrorMessage(caught))
    } finally {
      setCoverUploading(false)
    }
  }

  async function handleCoverRemove() {
    if (!templateId) return
    setCoverUploading(true)
    setError(null)
    try {
      const updated = await setTemplateCover(templateId, null)
      setCoverUrl(updated.thumbnail_url)
      onTemplateUpdated?.({
        id: updated.templateId,
        thumbnail_url: updated.thumbnail_url,
      })
    } catch (caught) {
      setError(getTemplateErrorMessage(caught))
    } finally {
      setCoverUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Template Settings</DialogTitle>
          <DialogDescription>
            Rename the template and set the cover image shown in the catalog.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Template</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="template-settings-name">Name</FieldLabel>
                <Input
                  id="template-settings-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Template name"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !disabled) {
                      void handleSave()
                    }
                  }}
                />
              </div>

              <TemplateCoverUpload
                disabled={coverUploading}
                thumbnailUrl={coverUrl}
                onRemove={handleCoverRemove}
                onSelectMedia={handleCoverSelect}
              />
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={disabled} onClick={handleSave}>
            {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {submitting ? "Saving" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateCoverUpload({
  disabled,
  thumbnailUrl,
  onRemove,
  onSelectMedia,
}: {
  disabled: boolean
  thumbnailUrl: string | null
  onRemove: () => void
  onSelectMedia: (media?: MediaItem) => void
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false)

  return (
    <div className="grid w-full max-w-52 gap-2">
      <FieldLabel>Cover image</FieldLabel>
      <button
        type="button"
        disabled={disabled}
        className="group relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70"
        onClick={() => setPickerOpen(true)}
      >
        {thumbnailUrl ? (
          <div className="relative aspect-square">
            <img
              src={thumbnailUrl}
              alt="Cover"
              className="h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="text-sm font-medium text-white">
                Click to change
              </span>
            </div>
          </div>
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-muted/50 transition-colors group-hover:bg-muted">
            <ImagePlusIcon className="size-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Add cover image
            </span>
          </div>
        )}
        {disabled ? (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </button>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl, _altText, media) => {
          if (!mediaUrl) {
            void onRemove()
            return
          }
          onSelectMedia(media)
        }}
        currentMediaUrl={thumbnailUrl ?? undefined}
        showVideos={false}
      />
      {thumbnailUrl ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={onRemove}
        >
          <XIcon className="mr-1 size-4" />
          Remove cover
        </Button>
      ) : null}
    </div>
  )
}
