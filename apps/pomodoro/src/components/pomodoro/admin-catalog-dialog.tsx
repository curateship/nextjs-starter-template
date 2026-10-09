import * as React from "react"
import { Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

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
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ImageUpload } from "@/components/shared/image-upload"
import {
  getCatalogAdminErrorMessage,
  loadCatalogItem,
  saveCatalogItem,
  uploadCatalogSource,
  type AdminCatalogItem,
} from "@/lib/api/pomodoro/admin-catalog"
import {
  CATALOG_ACCEPT,
  CATALOG_DESCRIPTORS,
  CATALOG_LICENCES,
  DESCRIPTOR_LABELS,
  formatClock,
  measureAudioFile,
  soundLengthProblem,
  type CatalogKind,
} from "@/lib/pomodoro/admin-catalog"
import { normalizeTag } from "@/lib/pomodoro/media-pool"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useHeldWhileClosing } from "@/lib/pomodoro/use-held-while-closing"

/**
 * The window a theme or a sound opens in, from its name, its settings cog, or
 * New theme / New sound. See `workspace/docs/catalog-admin.md`.
 *
 * It takes only the item's id and reads the item itself, so it opens the same
 * way from anywhere, and `?open=<id>` (or `?open=new`) keeps it in the
 * address, so Back closes it. A file chosen here goes to the bucket at once,
 * is checked in the browser first (a sound outside 2 to 5 minutes is refused
 * before it is sent), and becomes the item's file once the worker has
 * re-encoded it after Save.
 */

type Draft = {
  label: string
  hint: string
  descriptor: string
  locked: boolean
  status: "draft" | "live"
  pictureUrl: string
  /** As typed: words separated by commas. */
  tags: string
  volume: number
  artist: string
  sourceUrl: string
  licence: string
  licenceNote: string
  source: { path: string; kind: "audio" | "video" | "image"; name: string } | null
  clearFile: boolean
}

const NOUN: Record<CatalogKind, string> = { theme: "theme", sound: "sound" }

function emptyDraft(kind: CatalogKind): Draft {
  return {
    label: "",
    hint: "",
    descriptor: kind === "sound" ? "ambient" : "static",
    locked: false,
    status: "draft",
    pictureUrl: "",
    tags: "",
    volume: 100,
    artist: "",
    sourceUrl: "",
    licence: "",
    licenceNote: "",
    source: null,
    clearFile: false,
  }
}

function draftFrom(item: AdminCatalogItem): Draft {
  return {
    label: item.label,
    hint: item.hint,
    descriptor: item.descriptor,
    locked: item.locked,
    status: item.status,
    pictureUrl: item.pictureUrl ?? "",
    tags: item.tags.join(", "),
    volume: item.volume,
    artist: item.artist ?? "",
    sourceUrl: item.sourceUrl ?? "",
    licence: item.licence ?? "",
    licenceNote: item.licenceNote ?? "",
    source: null,
    clearFile: false,
  }
}

export function AdminCatalogDialog({
  kind,
  openId,
  onClose,
  onSaved,
  onDelete,
  knownTags,
}: {
  kind: CatalogKind
  /** An item's id, "new", or undefined while the window is shut. */
  openId: string | undefined
  onClose: () => void
  /** Reads the list again; awaited before the window closes. */
  onSaved: () => Promise<void>
  /** Hands the delete to the dashboard's own confirm, so no window opens over this one. */
  onDelete: (id: string) => void
  /** Tags already used on this kind, offered under the field. */
  knownTags: string[]
}) {
  const open = openId !== undefined
  // Kept while the window fades out, so it never redraws as a new item.
  const creating = useHeldWhileClosing(openId) === "new"
  const [item, setItem] = React.useState<AdminCatalogItem | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Draft>(() => emptyDraft(kind))
  const [initial, setInitial] = React.useState<Draft>(() => emptyDraft(kind))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [fileInvalid, setFileInvalid] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const nameId = React.useId()
  const hintId = React.useId()
  const descriptorId = React.useId()
  const accessId = React.useId()
  const statusId = React.useId()
  const volumeId = React.useId()
  const artistId = React.useId()
  const linkId = React.useId()
  const licenceId = React.useId()
  const noteId = React.useId()
  const fileId = React.useId()
  const tagsId = React.useId()

  // A new id is a new window: read that item, or start an empty one. Closing
  // clears nothing, so the window fades out as it was.
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setItem(null)
    setLoadError(null)
    setFileInvalid(false)
    setNameInvalid(false)
    const start = emptyDraft(kind)
    setDraft(start)
    setInitial(start)
  }

  React.useEffect(() => {
    if (!openId || openId === "new") return
    let live = true
    loadCatalogItem(openId).then(
      (loaded) => {
        if (!live) return
        setItem(loaded)
        const start = draftFrom(loaded)
        setDraft(start)
        setInitial(start)
      },
      (error) => {
        if (live) setLoadError(getCatalogAdminErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [openId])

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const chooseFile = async (file: File) => {
    setFileInvalid(false)
    if (kind === "sound") {
      try {
        const problem = soundLengthProblem(await measureAudioFile(file))
        if (problem) {
          setFileInvalid(true)
          showErrorToast(problem)
          return
        }
      } catch {
        setFileInvalid(true)
        showErrorToast(getCatalogAdminErrorMessage(new Error("INVALID_FILE_CONTENT")))
        return
      }
    }
    setUploading(true)
    try {
      const stored = await uploadCatalogSource(file)
      update("source", { path: stored.path, kind: stored.kind, name: file.name })
      update("clearFile", false)
    } catch (error) {
      setFileInvalid(true)
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!draft.label.trim()) {
      setNameInvalid(true)
      showErrorToast(`Give the ${NOUN[kind]} a name.`)
      return
    }
    setSaving(true)
    try {
      await saveCatalogItem({
        id: creating ? null : (item?.id ?? null),
        kind,
        label: draft.label,
        hint: draft.hint,
        descriptor: draft.descriptor,
        locked: draft.locked,
        status: draft.status,
        pictureUrl: draft.pictureUrl || null,
        tags: draft.tags.split(","),
        volume: draft.volume,
        artist: draft.artist || null,
        sourceUrl: draft.sourceUrl || null,
        licence: draft.licence || null,
        licenceNote: draft.licenceNote || null,
        source: draft.source
          ? { path: draft.source.path, kind: draft.source.kind }
          : null,
        clearFile: draft.clearFile,
      })
      toast.success(
        creating
          ? `${kind === "sound" ? "Sound" : "Theme"} created.`
          : "Changes saved."
      )
      // The list is read again before the window goes, so the row behind it
      // already shows the change.
      await onSaved()
      onClose()
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = creating
    ? `New ${NOUN[kind]}`
    : item
      ? item.label
      : `Edit ${NOUN[kind]}`
  const hasFile = !draft.clearFile && Boolean(item?.fileUrl)

  return (
    <FormDialog open={open} dirty={dirty} busy={saving || uploading} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {kind === "sound"
                ? "Members hear a Live sound on the Sounds page and in rooms. A sound runs 2 to 5 minutes."
                : "Members see a Live theme on the Theme page, behind every page and in rooms."}
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
              {loadError ? (
                <p role="alert" className="text-sm text-destructive">
                  {loadError}
                </p>
              ) : !creating && !item ? (
                <div className="flex justify-center py-10">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                          <Input
                            id={nameId}
                            maxLength={60}
                            value={draft.label}
                            aria-invalid={nameInvalid || undefined}
                            onChange={(event) => {
                              setNameInvalid(false)
                              update("label", event.target.value)
                            }}
                          />
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel
                            htmlFor={hintId}
                            hint="One short line under the name on the card."
                          >
                            Hint
                          </FieldLabel>
                          <Input
                            id={hintId}
                            maxLength={120}
                            value={draft.hint}
                            onChange={(event) => update("hint", event.target.value)}
                          />
                        </div>
                      </div>
                      <TagsField
                        id={tagsId}
                        value={draft.tags}
                        onChange={(value) => update("tags", value)}
                        knownTags={knownTags}
                      />
                      <div className="flex flex-wrap gap-4">
                        <div className="grid gap-2">
                          <FieldLabel htmlFor={descriptorId}>Kind</FieldLabel>
                          <Select
                            value={draft.descriptor}
                            onValueChange={(value) => update("descriptor", value)}
                          >
                            <SelectTrigger id={descriptorId}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATALOG_DESCRIPTORS[kind].map((value) => (
                                <SelectItem key={value} value={value}>
                                  {DESCRIPTOR_LABELS[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel
                            htmlFor={accessId}
                            hint="Making something Pro does not take it from a free member who already has it. It is checked the next time they pick."
                          >
                            Access
                          </FieldLabel>
                          <Select
                            value={draft.locked ? "pro" : "free"}
                            onValueChange={(value) => update("locked", value === "pro")}
                          >
                            <SelectTrigger id={accessId}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel
                            htmlFor={statusId}
                            hint="A Draft is seen only here. Anybody using it falls back to the default until it is Live again."
                          >
                            Status
                          </FieldLabel>
                          <Select
                            value={draft.status}
                            onValueChange={(value) =>
                              update("status", value === "live" ? "live" : "draft")
                            }
                          >
                            <SelectTrigger id={statusId}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="live">Live</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Files</CardTitle>
                      <CardDescription>
                        {kind === "sound"
                          ? "An MP3, WAV or OGG of 2 to 5 minutes. It is evened out for loudness before members hear it."
                          : "A still is required. A film is optional, plays behind the page, and is shrunk to 720p first."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <ImageUpload
                        label={kind === "sound" ? "Card picture" : "Still"}
                        value={draft.pictureUrl}
                        onChange={(value) => update("pictureUrl", value)}
                        aspect="video"
                        className="sm:max-w-xs"
                        hint={
                          kind === "theme"
                            ? "Shown on the card, and behind the page whenever the film cannot play. Leave it empty with a film and the film's first frame is used."
                            : undefined
                        }
                      />
                      <div className="grid gap-2">
                        <FieldLabel htmlFor={fileId}>
                          {kind === "sound" ? "Sound file" : "Film"}
                        </FieldLabel>
                        <FileStatusLine
                          item={item}
                          draft={draft}
                          hasFile={hasFile}
                          uploading={uploading}
                        />
                        <div className="flex flex-wrap gap-2">
                          <input
                            ref={fileInputRef}
                            id={fileId}
                            type="file"
                            className="sr-only"
                            accept={CATALOG_ACCEPT[kind]}
                            aria-invalid={fileInvalid || undefined}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ""
                              if (file) void chooseFile(file)
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploading ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              <UploadIcon className="size-4" />
                            )}
                            {hasFile || draft.source ? "Replace file" : "Choose file"}
                          </Button>
                          {kind === "theme" && (hasFile || draft.source) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                update("source", null)
                                update("clearFile", true)
                              }}
                            >
                              Use the still only
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {kind === "sound" ? (
                        <div className="grid gap-2">
                          <FieldLabel
                            htmlFor={volumeId}
                            hint="Multiplied into each member's own volume, so a loud track starts quieter. Their slider still shows what they set."
                          >
                            Starting volume, {draft.volume}%
                          </FieldLabel>
                          <Slider
                            id={volumeId}
                            min={10}
                            max={100}
                            step={5}
                            value={[draft.volume]}
                            onValueChange={([value]) => update("volume", value ?? 100)}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Credits</CardTitle>
                      <CardDescription>
                        Only admins see these. A Live item with no licence is
                        flagged in the list.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <FieldLabel htmlFor={artistId}>Artist</FieldLabel>
                          <Input
                            id={artistId}
                            maxLength={120}
                            value={draft.artist}
                            onChange={(event) => update("artist", event.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel htmlFor={linkId}>Source link</FieldLabel>
                          <Input
                            id={linkId}
                            type="url"
                            maxLength={500}
                            placeholder="https://"
                            value={draft.sourceUrl}
                            onChange={(event) => update("sourceUrl", event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <FieldLabel htmlFor={licenceId}>Licence</FieldLabel>
                        <Select
                          value={draft.licence || "none"}
                          onValueChange={(value) =>
                            update("licence", value === "none" ? "" : value)
                          }
                        >
                          <SelectTrigger id={licenceId} className="w-fit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not set</SelectItem>
                            {CATALOG_LICENCES.map((licence) => (
                              <SelectItem key={licence.value} value={licence.value}>
                                {licence.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <FieldLabel htmlFor={noteId}>Licence note</FieldLabel>
                        <Textarea
                          id={noteId}
                          rows={1}
                          maxLength={300}
                          value={draft.licenceNote}
                          onChange={(event) => update("licenceNote", event.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              {item && !creating ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => {
                    onDelete(item.id)
                    onClose()
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || uploading || Boolean(loadError)}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {creating ? `Create ${NOUN[kind]}` : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The tags box: words separated by commas, with the tags already in use one
 * click away so the same word is not spelled three ways.
 */
function TagsField({
  id,
  value,
  onChange,
  knownTags,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  knownTags: string[]
}) {
  const typed = value
    .split(",")
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null)
  const offered = knownTags.filter((tag) => !typed.includes(tag)).slice(0, 12)
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor={id}
        hint="Members pick sounds and themes by these words on the By tag tab. Separate them with commas, up to eight."
      >
        Tags
      </FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder="rain, night"
        onChange={(event) => onChange(event.target.value)}
      />
      {offered.length ? (
        <div className="flex flex-wrap gap-1">
          {offered.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onChange(typed.length ? `${typed.join(", ")}, ${tag}` : tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Where the item's file has got to, in one line under the field's label. */
function FileStatusLine({
  item,
  draft,
  hasFile,
  uploading,
}: {
  item: AdminCatalogItem | null
  draft: Draft
  hasFile: boolean
  uploading: boolean
}) {
  let text: string
  if (uploading) text = "Sending the file…"
  else if (draft.source)
    text = `${draft.source.name} is uploaded. It is prepared after you save, and replaces the current file once it is ready.`
  else if (draft.clearFile) text = "No film. The still is drawn on its own."
  else if (item?.fileStatus === "queued" || item?.fileStatus === "processing")
    text = "A new file is being prepared. The current one stays until it is ready."
  else if (item?.fileStatus === "failed")
    text = `The last upload was refused: ${item.fileError ?? "it could not be prepared."}`
  else if (hasFile)
    text = item?.durationSeconds
      ? `Ready, ${formatClock(item.durationSeconds)} long.`
      : "Ready."
  else text = "No file yet."
  return (
    <p
      className={
        item?.fileStatus === "failed" && !draft.source
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {text}
    </p>
  )
}
