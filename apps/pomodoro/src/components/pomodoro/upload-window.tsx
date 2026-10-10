import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { MeterRow } from "@/components/ui/meter"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PixabayImportPanel } from "@/components/pomodoro/pixabay-import-panel"
import { ShareFields } from "@/components/pomodoro/share-fields"
import { TagsField } from "@/components/pomodoro/tags-field"
import { TrimStrip } from "@/components/pomodoro/trim-strip"
import {
  getPomodoroUploadErrorMessage,
  isUploadCancelled,
  suggestPomodoroUploadLabels,
  uploadPomodoroMedia,
  type UploadLibrary,
  type UploadProgress,
} from "@/lib/api/pomodoro/media-uploads"
import {
  formatBytes,
  UPLOAD_ACCEPT,
  UPLOAD_HINT,
  uploadRefusal,
  type PomodoroUploadKind,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import {
  MAX_UPLOAD_FILES,
  UPLOAD_LABEL_MESSAGES,
  UPLOAD_NAME_MAX,
  checkUploadLabels,
  nameFromFileName,
  parseTagText,
  uploadedMessage,
  type UploadTrim,
} from "@/lib/pomodoro/upload-labels"

/**
 * The upload window (uploads-and-sharing task 01). Upload on Sounds or
 * Backgrounds opens it instead of the bare file picker. Each file gets a name,
 * tags, a "Share this" tick and, for a sound or clip, a trim, all before
 * anything is sent. Files then go up one after another, each with its own bar,
 * and each says afterwards whether it is ready or how long it should take.
 * See "The upload window" in `workspace/docs/own-media-uploads.md`.
 */

type RowStatus =
  | { step: "waiting" }
  | { step: "sending"; progress: UploadProgress }
  | { step: "failed"; reason: string }
  | { step: "done"; message: string }

type Row = {
  id: string
  file: File
  /** From the browser's file type; null when it could not tell. */
  kind: PomodoroUploadKind | null
  /** An object address for the trim preview, for a sound or clip. */
  previewUrl: string | null
  name: string
  nameEdited: boolean
  tagText: string
  tagsEdited: boolean
  shared: boolean
  /** The "I have the right to share this" tick, needed while Share is ticked. */
  confirmRights: boolean
  /** Null for the whole file. */
  trim: UploadTrim | null
  suggesting: boolean
  status: RowStatus
}

type Form = { rows: Row[]; sharedTags: string }

const EMPTY_FORM: Form = { rows: [], sharedTags: "" }

function kindOfFile(file: File): PomodoroUploadKind | null {
  const family = file.type.split("/")[0]
  return family === "image" || family === "audio" || family === "video"
    ? family
    : null
}

/** What is wrong with a row's name and tags, if anything. */
/** Share is ticked and the right to share is not. */
function rightsMissing(row: Row) {
  return row.shared && !row.confirmRights
}

function labelProblem(row: Row) {
  const { tags, unusable } = parseTagText(row.tagText)
  if (unusable.length) return UPLOAD_LABEL_MESSAGES.UPLOAD_TAG_INVALID
  const checked = checkUploadLabels({ name: row.name, tags })
  return checked.ok ? null : UPLOAD_LABEL_MESSAGES[checked.problem]
}

/**
 * What a screen reader hears, in quarters. The bar moves every percent, and
 * reading each one out would talk over everything else.
 */
function spokenProgress(progress: UploadProgress | null) {
  if (progress === null) return ""
  if (progress.phase === "checking") return "Uploaded. Checking the file."
  const quarter = Math.floor(progress.percent / 25) * 25
  return quarter > 0 ? `Uploading, ${quarter}%` : "Uploading"
}

export function UploadWindow({
  open,
  onClose,
  purpose,
  library,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  purpose: PomodoroUploadPurpose
  library: UploadLibrary
  /** A file landed: the card grid reads its list again. */
  onUploaded: () => void
}) {
  const [form, setForm] = React.useState<Form>(EMPTY_FORM)
  const [source, setSource] = React.useState<"device" | "pixabay">("device")
  const [running, setRunning] = React.useState(false)
  const [showProblems, setShowProblems] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<"stop" | "discard" | null>(
    null
  )
  const fileInput = React.useRef<HTMLInputElement>(null)
  const controller = React.useRef<AbortController | null>(null)
  // Cancel during "Checking the file…": the file is already up, so it is let
  // finish and the files after it are not sent.
  const stopAfterThis = React.useRef(false)
  const sharedTagsId = React.useId()

  const rows = form.rows

  // Leaving the page lets every preview address go and stops the uploads:
  // the one going up is dropped, and the ones after it are not sent.
  const previews = React.useRef<string[]>([])
  React.useEffect(
    () => () => {
      stopAfterThis.current = true
      controller.current?.abort()
      previews.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const patch = React.useCallback((id: string, change: Partial<Row>) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.id === id ? { ...row, ...change } : row
      ),
    }))
  }, [])

  // The browser's own check, against the limits and the space left. Worked
  // out on every draw, in order, so removing one file frees its space for the
  // rest. A finished file is already counted in the space used.
  const refusals = new Map<string, string>()
  let spaceLeft = library.limitBytes - library.usedBytes
  for (const row of rows) {
    if (row.status.step === "done") continue
    const allowed: PomodoroUploadKind[] =
      purpose === "sound" ? ["audio"] : ["image", "video"]
    const reason =
      row.kind && !allowed.includes(row.kind)
        ? `This file is the wrong kind for here. ${UPLOAD_HINT[purpose]}`
        : uploadRefusal(row.file, spaceLeft)
    if (reason) refusals.set(row.id, reason)
    else spaceLeft -= row.file.size
  }

  const toSend = rows.filter(
    (row) =>
      (row.status.step === "waiting" || row.status.step === "failed") &&
      !refusals.has(row.id)
  )
  // A file the browser refused cannot go, so it never holds the window open.
  const unsent = toSend.length > 0
  const current = rows.find((row) => row.status.step === "sending")
  const currentProgress =
    current?.status.step === "sending" ? current.status.progress : null
  const finished = rows.length > 0 && !unsent && !running

  function addFiles(files: File[]) {
    setNotice(null)
    const room = MAX_UPLOAD_FILES - rows.length
    if (files.length > room) {
      setNotice(
        `You can upload ${MAX_UPLOAD_FILES} files at once, so ${files.length - room === 1 ? "one was" : `${files.length - room} were`} left out.`
      )
    }
    const added: Row[] = files.slice(0, Math.max(0, room)).map((file) => {
      const kind = kindOfFile(file)
      const previewUrl =
        kind === "audio" || kind === "video" ? URL.createObjectURL(file) : null
      if (previewUrl) previews.current.push(previewUrl)
      return {
        id: crypto.randomUUID(),
        file,
        kind,
        previewUrl,
        name: nameFromFileName(file.name),
        nameEdited: false,
        tagText: form.sharedTags,
        tagsEdited: false,
        shared: false,
        confirmRights: false,
        trim: null,
        suggesting: library.suggestLabels,
        status: { step: "waiting" },
      }
    })
    setForm((current) => ({ ...current, rows: [...current.rows, ...added] }))
    if (!library.suggestLabels) return
    for (const row of added) {
      void suggestPomodoroUploadLabels(row.file.name, purpose).then(
        (suggested) => {
          // Only fields the member has not touched take the suggestion, and
          // tags typed for every file win over it.
          setForm((current) => ({
            ...current,
            rows: current.rows.map((one) => {
              if (one.id !== row.id) return one
              const next = { ...one, suggesting: false }
              if (!suggested || one.status.step !== "waiting") return next
              if (!one.nameEdited && suggested.name) next.name = suggested.name
              if (
                !one.tagsEdited &&
                !current.sharedTags.trim() &&
                suggested.tags.length
              )
                next.tagText = suggested.tags.join(", ")
              return next
            }),
          }))
        }
      )
    }
  }

  function removeRow(id: string) {
    const row = rows.find((one) => one.id === id)
    if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl)
    setForm((current) => ({
      ...current,
      rows: current.rows.filter((one) => one.id !== id),
    }))
  }

  async function sendAll() {
    setNotice(null)
    if (!rows.length) {
      fileInput.current?.click()
      return
    }
    if (
      toSend.some((row) => labelProblem(row) !== null || rightsMissing(row))
    ) {
      setShowProblems(true)
      return
    }
    // Taken now: the fields are locked while files go up.
    const plan = toSend.map((row) => ({
      id: row.id,
      file: row.file,
      labels: {
        name: row.name,
        tags: parseTagText(row.tagText).tags,
        shared: row.shared,
        confirmRights: row.shared && row.confirmRights,
        trim: row.trim,
      },
    }))
    setRunning(true)
    stopAfterThis.current = false
    for (const item of plan) {
      if (stopAfterThis.current) break
      const abort = new AbortController()
      controller.current = abort
      patch(item.id, {
        status: { step: "sending", progress: { phase: "sending", percent: 0 } },
      })
      try {
        const result = await uploadPomodoroMedia({
          file: item.file,
          purpose,
          labels: item.labels,
          signal: abort.signal,
          onProgress: (progress) =>
            patch(item.id, { status: { step: "sending", progress } }),
        })
        patch(item.id, {
          status: {
            step: "done",
            message: uploadedMessage(result.kind, result.ahead),
          },
        })
        onUploaded()
      } catch (error) {
        if (isUploadCancelled(error)) {
          patch(item.id, { status: { step: "waiting" } })
          break
        }
        patch(item.id, {
          status: { step: "failed", reason: getPomodoroUploadErrorMessage(error) },
        })
      }
    }
    controller.current = null
    setRunning(false)
  }

  /** Cancel while files go up. Nothing half-sent is stored. */
  function cancelRun() {
    if (currentProgress?.phase === "checking") stopAfterThis.current = true
    else controller.current?.abort()
  }

  function requestClose() {
    if (running) setConfirming("stop")
    else if (unsent) setConfirming("discard")
    else onClose()
  }

  const title = purpose === "sound" ? "Upload sounds" : "Upload backgrounds"
  // Backgrounds can also come from a Pixabay link (task 06, part 8). Sounds
  // cannot: Pixabay does not let a server copy its music.
  const sourceTabs =
    purpose === "background" ? (
      <Tabs
        value={source}
        onValueChange={(next) => setSource(next === "pixabay" ? "pixabay" : "device")}
      >
        <TabsList aria-label="Where the files come from">
          <TabsTrigger value="device" disabled={running}>
            From your device
          </TabsTrigger>
          <TabsTrigger value="pixabay" disabled={running}>
            From a Pixabay link
          </TabsTrigger>
        </TabsList>
      </Tabs>
    ) : null
  // The tags for every file only matter while two or more are still to send.
  const several =
    rows.filter((row) => row.status.step !== "done").length > 1

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {UPLOAD_HINT[purpose]} Up to {MAX_UPLOAD_FILES} at once.
            </DialogDescription>
          </DialogHeader>
          {source === "pixabay" ? (
            <PixabayImportPanel
              tabs={sourceTabs}
              onClose={requestClose}
              onImported={onUploaded}
            />
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void sendAll()
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept={UPLOAD_ACCEPT[purpose]}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  // Cleared at once, so the same file can be picked again.
                  event.target.value = ""
                  if (files.length) addFiles(files)
                }}
              />
              <span className="sr-only" aria-live="polite">
                {spokenProgress(currentProgress)}
              </span>
              <DialogBody>
                {sourceTabs}
                {several ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Every file</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <fieldset disabled={running} className="contents">
                        <TagsField
                          id={sharedTagsId}
                          label="Tags for every file"
                          hint="Given to every file below, unless you change a file's own tags."
                          value={form.sharedTags}
                          knownTags={library.knownTags}
                          onChange={(sharedTags) =>
                            setForm((current) => ({
                              sharedTags,
                              rows: current.rows.map((row) =>
                                row.tagsEdited || row.status.step === "done"
                                  ? row
                                  : { ...row, tagText: sharedTags }
                              ),
                            }))
                          }
                        />
                      </fieldset>
                    </CardContent>
                  </Card>
                ) : null}

                {rows.map((row) => (
                  <FileRow
                    key={row.id}
                    row={row}
                    refusal={refusals.get(row.id) ?? null}
                    problem={showProblems ? labelProblem(row) : null}
                    showRightsProblem={showProblems}
                    locked={running}
                    knownTags={library.knownTags}
                    onChange={(change) => patch(row.id, change)}
                    onRemove={() => removeRow(row.id)}
                  />
                ))}

                {rows.length < MAX_UPLOAD_FILES && !running ? (
                  <Card size="sm">
                    <CardContent className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInput.current?.click()}
                      >
                        <UploadIcon aria-hidden="true" />
                        {rows.length ? "Add more files" : "Choose files"}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {rows.length
                          ? `${rows.length} of ${MAX_UPLOAD_FILES} chosen.`
                          : `${formatBytes(Math.max(0, library.limitBytes - library.usedBytes))} of space left.`}
                      </span>
                    </CardContent>
                  </Card>
                ) : null}

                {notice ? (
                  <p role="alert" className="text-sm text-destructive">
                    {notice}
                  </p>
                ) : null}
              </DialogBody>
              <DialogFooter>
                {finished ? (
                  <Button type="button" onClick={onClose}>
                    Done
                  </Button>
                ) : running ? (
                  <>
                    <Button type="button" variant="outline" onClick={cancelRun}>
                      Cancel
                    </Button>
                    <Button type="button" disabled>
                      <Loader2Icon className="animate-spin" aria-hidden="true" />
                      Uploading…
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={requestClose}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      <UploadIcon aria-hidden="true" />
                      {toSend.length > 1 ? `Upload ${toSend.length} files` : "Upload"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null)
        }}
        title={confirming === "stop" ? "Stop uploading?" : "Discard these files?"}
        description={
          confirming === "stop"
            ? currentProgress?.phase === "checking"
              ? "The file being checked now is already up and will be saved. The ones after it are not sent."
              : "The file going up now is not saved, and the ones after it are not sent. Files already uploaded stay."
            : "The files you chose have not been uploaded. Closing the window throws them away."
        }
        confirmLabel={confirming === "stop" ? "Stop uploading" : "Discard files"}
        cancelLabel={confirming === "stop" ? "Keep uploading" : "Keep editing"}
        onConfirm={() => {
          if (confirming === "stop") cancelRun()
          setConfirming(null)
          onClose()
        }}
      />
    </>
  )
}

/** One chosen file: its fields before it goes up, its bar while it does, and what happened after. */
function FileRow({
  row,
  refusal,
  problem,
  showRightsProblem,
  locked,
  knownTags,
  onChange,
  onRemove,
}: {
  row: Row
  /** Why the browser will not send it, before it is tried. */
  refusal: string | null
  /** What is wrong with the name or tags, once Upload was pressed. */
  problem: string | null
  /** Upload was pressed, so a missing right-to-share tick is marked. */
  showRightsProblem: boolean
  locked: boolean
  knownTags: string[]
  onChange: (change: Partial<Row>) => void
  onRemove: () => void
}) {
  const nameId = React.useId()
  const tagsId = React.useId()
  const problemId = React.useId()
  const { status } = row

  if (status.step === "done") {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <CheckIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{row.name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{status.message}</p>
        </CardContent>
      </Card>
    )
  }

  const trimKind =
    row.kind === "audio" || row.kind === "video" ? row.kind : null
  const editable = !locked && status.step !== "sending"

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="truncate" title={row.file.name}>
          {row.file.name}
        </CardTitle>
        <CardDescription>{formatBytes(row.file.size)}</CardDescription>
        <CardAction>
          {editable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${row.file.name}`}
              onClick={onRemove}
            >
              <XIcon className="size-4" />
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {refusal ? (
          <p className="flex gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {refusal}
          </p>
        ) : null}
        <fieldset disabled={!editable} className="contents">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              {row.suggesting ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
                  Suggesting a name…
                </span>
              ) : null}
            </div>
            <Input
              id={nameId}
              value={row.name}
              maxLength={UPLOAD_NAME_MAX}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              onChange={(event) =>
                onChange({ name: event.target.value, nameEdited: true })
              }
            />
          </div>
          <TagsField
            id={tagsId}
            value={row.tagText}
            knownTags={knownTags}
            errorId={problem ? problemId : undefined}
            onChange={(tagText) => onChange({ tagText, tagsEdited: true })}
          />
          {problem ? (
            <p id={problemId} className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          <ShareFields
            shared={row.shared}
            confirmRights={row.confirmRights}
            needsRights
            showProblem={showRightsProblem}
            onChange={onChange}
          />
          {trimKind && row.previewUrl ? (
            <TrimStrip
              src={row.previewUrl}
              kind={trimKind}
              value={row.trim}
              onChange={(trim) => onChange({ trim })}
              unplayableNote="This browser cannot play this file, so it cannot be trimmed here. It uploads whole."
              disabled={!editable}
            />
          ) : null}
        </fieldset>
        {status.step === "sending" ? (
          <MeterRow
            label={
              status.progress.phase === "checking"
                ? "Checking the file…"
                : `Uploading ${row.name}`
            }
            value={
              status.progress.phase === "checking"
                ? "100%"
                : `${status.progress.percent}%`
            }
            meter={{
              value:
                status.progress.phase === "checking"
                  ? 100
                  : status.progress.percent,
              label: `Uploading ${row.name}`,
            }}
          />
        ) : null}
        {status.step === "failed" ? (
          <p role="alert" className="flex gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {status.reason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
