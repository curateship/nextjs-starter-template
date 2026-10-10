import * as React from "react"
import { DownloadIcon, Loader2Icon } from "lucide-react"

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
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { ShareFields } from "@/components/pomodoro/share-fields"
import { TagsField } from "@/components/pomodoro/tags-field"
import { TrimStrip } from "@/components/pomodoro/trim-strip"
import {
  editPomodoroUpload,
  getPomodoroUploadErrorMessage,
  type StoredUpload,
} from "@/lib/api/pomodoro/media-uploads"
import {
  UPLOAD_LABEL_MESSAGES,
  UPLOAD_NAME_MAX,
  checkUploadLabels,
  parseTagText,
  type UploadTrim,
} from "@/lib/pomodoro/upload-labels"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The cog on an upload's card: its name, tags and Share tick, the same fields
 * the upload window asked for, and for a sound or clip its trim. Tyler,
 * 10 Oct 2026: "There is no edit icon for the uploaded background, add the
 * cog icon here", then "I should be able to reclip the file too". A new trim
 * is cut from the kept original by the worker; the old cut plays until then.
 */
export function UploadEditDialog({
  upload,
  knownTags,
  onClose,
  onSaved,
}: {
  /** The upload being edited; null while the window is shut. */
  upload: StoredUpload | null
  knownTags: string[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [dirty, setDirty] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // The last upload stays drawn while the window animates shut. The card list
  // keys this window by each opening, so every edit starts clean.
  const [shown, setShown] = React.useState(upload)
  if (upload && upload.mediaId !== shown?.mediaId) setShown(upload)

  return (
    <FormDialog
      open={upload !== null}
      dirty={dirty}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) =>
        shown ? (
          <EditForm
            upload={shown}
            knownTags={knownTags}
            setDirty={setDirty}
            setBusy={setBusy}
            requestClose={requestClose}
            onDone={async () => {
              await onSaved()
              onClose()
            }}
          />
        ) : null
      }
    </FormDialog>
  )
}

function EditForm({
  upload,
  knownTags,
  setDirty,
  setBusy,
  requestClose,
  onDone,
}: {
  upload: StoredUpload
  knownTags: string[]
  setDirty: (dirty: boolean) => void
  setBusy: (busy: boolean) => void
  requestClose: () => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = React.useState(upload.name)
  const [tagText, setTagText] = React.useState(upload.tags.join(", "))
  const [shared, setShared] = React.useState(upload.shared)
  const [confirmRights, setConfirmRights] = React.useState(false)
  const [rightsProblem, setRightsProblem] = React.useState(false)
  // Only switching Share on asks for the confirmation; a file already shared
  // has it on record.
  const needsRights = !upload.shared
  const takenDown = upload.shareState === "taken_down"
  const [trim, setTrim] = React.useState<UploadTrim | null>(upload.trim)
  const trimChanged = JSON.stringify(trim) !== JSON.stringify(upload.trim)
  const cutting = upload.status === "queued" || upload.status === "processing"
  const trimKind =
    upload.kind === "audio" || upload.kind === "video" ? upload.kind : null
  const [problem, setProblem] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const nameId = React.useId()
  const tagsId = React.useId()
  const problemId = React.useId()

  function edit() {
    setDirty(true)
    setProblem(null)
  }

  async function save() {
    const { tags, unusable } = parseTagText(tagText)
    const checked = checkUploadLabels({ name, tags })
    if (unusable.length) {
      setProblem(UPLOAD_LABEL_MESSAGES.UPLOAD_TAG_INVALID)
      return
    }
    if (!checked.ok) {
      setProblem(UPLOAD_LABEL_MESSAGES[checked.problem])
      return
    }
    if (shared && needsRights && !confirmRights) {
      setRightsProblem(true)
      return
    }
    setSaving(true)
    setBusy(true)
    try {
      await editPomodoroUpload({
        mediaId: upload.mediaId,
        name: checked.name,
        tags: checked.tags,
        shared,
        confirmRights: shared && confirmRights,
        ...(trimChanged ? { trim } : {}),
      })
      setBusy(false)
      setDirty(false)
      await onDone()
    } catch (error) {
      showErrorToast(getPomodoroUploadErrorMessage(error))
    } finally {
      setSaving(false)
      setBusy(false)
    }
  }

  return (
    <DialogContent variant="admin">
      <DialogHeader>
        <DialogTitle>{upload.name}</DialogTitle>
        <DialogDescription>
          {trimKind
            ? "Change its name, tags, or where it starts and ends."
            : "Change its name and tags."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <fieldset disabled={saving} className="contents">
              <div className="grid gap-2">
                <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                <Input
                  id={nameId}
                  value={name}
                  maxLength={UPLOAD_NAME_MAX}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? problemId : undefined}
                  onChange={(event) => {
                    edit()
                    setName(event.target.value)
                  }}
                />
              </div>
              <TagsField
                id={tagsId}
                value={tagText}
                knownTags={knownTags}
                errorId={problem ? problemId : undefined}
                onChange={(value) => {
                  edit()
                  setTagText(value)
                }}
              />
              {problem ? (
                <p id={problemId} className="text-sm text-destructive">
                  {problem}
                </p>
              ) : null}
              <ShareFields
                shared={shared}
                confirmRights={confirmRights}
                needsRights={needsRights}
                showProblem={rightsProblem}
                disabled={takenDown}
                disabledReason={
                  takenDown
                    ? `An admin took this file off sharing${upload.takenDownReason ? `: ${upload.takenDownReason}` : ""}. It cannot be shared again.`
                    : upload.shareState === "waiting"
                      ? "Your first shared file waits for a quick check by our team before anyone else sees it."
                      : null
                }
                onChange={(change) => {
                  edit()
                  setRightsProblem(false)
                  if (change.shared !== undefined) setShared(change.shared)
                  if (change.confirmRights !== undefined)
                    setConfirmRights(change.confirmRights)
                }}
              />
              {trimKind && cutting ? (
                <p className="text-sm text-muted-foreground">
                  {upload.url
                    ? "A new cut is being made. You can trim it again once it is ready."
                    : "You can trim it once it is ready."}
                </p>
              ) : trimKind && upload.sourceUrl ? (
                <TrimStrip
                  src={upload.sourceUrl}
                  kind={trimKind}
                  value={trim}
                  startOpen
                  onChange={(next) => {
                    edit()
                    setTrim(next)
                  }}
                  unplayableNote="This browser cannot play this file, so it cannot be trimmed here."
                  disabled={saving}
                />
              ) : null}
              {trimChanged ? (
                <p className="text-sm text-muted-foreground">
                  Saving makes a new cut. The current one plays until it is
                  ready, and the bell will tell you.
                </p>
              ) : null}
              </fieldset>
            </CardContent>
          </Card>
          {upload.url ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>File</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {/* What the download is, so a 720p silent film is no
                      surprise to somebody who sent a 4K clip with sound. */}
                  {upload.kind === "video"
                    ? "The prepared clip you play: 720p, no sound."
                    : upload.kind === "audio"
                      ? "The prepared sound you play: a 192 kbps MP3."
                      : "The picture as you uploaded it."}
                  {/* The credit an imported file keeps (task 06, part 8). */}
                  {upload.sourceAuthor
                    ? ` From Pixabay, by ${upload.sourceAuthor}.`
                    : null}
                </p>
                <Button asChild variant="outline">
                  <a
                    href={`/api/pomodoro/uploads/${upload.mediaId}/download`}
                    download
                  >
                    <DownloadIcon aria-hidden="true" />
                    Download
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : null}
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
