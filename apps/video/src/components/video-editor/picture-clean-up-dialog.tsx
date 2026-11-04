import * as React from "react"
import { EraserIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { showBeforeAfter } from "@/components/video-editor/before-after"
import {
  findClip,
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { cleanUpPicture, getPictureEditErrorMessage } from "@/lib/api/video/picture-edits"
import { ACTOR_IMAGE_MODELS, type ImageModelId } from "@/lib/video/asset-factories"
import {
  PICTURE_EDIT_LABELS,
  PICTURE_EDIT_MODEL,
  PICTURE_EDIT_WORDS_MAX,
  PICTURE_EDIT_WORDS_MESSAGE,
} from "@/lib/video/picture-edits"
import { formatCents, isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { showErrorToast } from "@/lib/toast/error-toast"

export type CleanUpKind = "reflection" | "object"

/**
 * Remove reflection and Remove an object on a picture clip
 * (picture-clean-up.md). The new picture takes the clip's place with the same
 * start, length and lane, as one undo step, and the preview shows the before
 * and after slider over it.
 */
export function PictureCleanUpDialog({
  clip,
  kind,
  onClose,
}: {
  clip: EditorClip
  kind: CleanUpKind
  onClose: () => void
}) {
  const { store, dispatch, videoId, saveNow } = useEditorRuntime()
  const { refreshSpend, openSettings } = useProjectSettings()
  const [words, setWords] = React.useState("")
  const [model, setModel] = React.useState<ImageModelId>(PICTURE_EDIT_MODEL)
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const cents = aiUnitCostCents(model, 1)

  async function submit() {
    if (kind === "object" && !words.trim()) {
      setInvalid(true)
      showErrorToast(PICTURE_EDIT_WORDS_MESSAGE)
      return
    }
    if (!clip.mediaId || !clip.url) return
    setBusy(true)
    try {
      await saveNow()
      const picture = await cleanUpPicture({
        videoId,
        mediaId: clip.mediaId,
        kind,
        words: kind === "object" ? words.trim() : undefined,
        model,
      })
      refreshSpend()
      store.refreshMediaShelf()
      if (!findClip(store.getSnapshot().state.tracks, clip.id)) {
        toast("The picture was deleted meanwhile. The clean one is in the Media panel.")
        onClose()
        return
      }
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: {
          mediaId: picture.media_id,
          url: picture.url,
          name: picture.name,
          // A changed picture can't be made again from the old recipe.
          origin: undefined,
        },
      })
      dispatch({ type: "SELECT_CLIP", clipId: clip.id })
      showBeforeAfter({ clipId: clip.id, beforeUrl: clip.url })
      toast.success("Done. Drag the line on the preview to compare. Undo brings the old picture back.")
      onClose()
    } catch (error) {
      const message = getPictureEditErrorMessage(error)
      showErrorToast(
        message,
        isProjectSpendLimitMessage(message)
          ? { label: "Raise limit", onClick: openSettings }
          : undefined
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={words !== ""} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{PICTURE_EDIT_LABELS[kind]}</DialogTitle>
            <DialogDescription>
              The clean picture takes this one&apos;s place on the timeline and
              nothing else moves.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The picture</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {clip.url ? (
                    <div className="grid place-items-center overflow-hidden rounded-lg bg-muted">
                      <img
                        src={clip.url}
                        alt={clip.name}
                        draggable={false}
                        className="block max-h-48 w-auto object-contain"
                      />
                    </div>
                  ) : null}
                  {kind === "object" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="clean-up-words">What should go?</Label>
                      <Input
                        id="clean-up-words"
                        value={words}
                        maxLength={PICTURE_EDIT_WORDS_MAX}
                        placeholder="the cup on the table"
                        disabled={busy}
                        aria-invalid={invalid || undefined}
                        autoFocus
                        onChange={(event) => {
                          setWords(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      For a photo taken through a window: the room, lamps and
                      glare mirrored on the glass come off, and the view behind
                      it stays.
                    </p>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="clean-up-model">Model</Label>
                    <Select
                      value={model}
                      onValueChange={(next) => setModel(next as ImageModelId)}
                      disabled={busy}
                    >
                      <SelectTrigger id="clean-up-model" className="w-full sm:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTOR_IMAGE_MODELS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label} · {formatCents(aiUnitCostCents(item.id, 1))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <EraserIcon />}
                {PICTURE_EDIT_LABELS[kind]} · {formatCents(cents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
