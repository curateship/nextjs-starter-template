import * as React from "react"
import {
  CheckIcon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MusicIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  formatBytes,
  UPLOAD_ACCEPT,
  UPLOAD_HINT,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import {
  getPomodoroUploadErrorMessage,
  loadUploadLibrary,
  removePomodoroUpload,
  uploadPomodoroMedia,
  type StoredUpload,
  type UploadLibrary,
} from "@/lib/api/pomodoro/media-uploads"

/**
 * A member's own backgrounds or sound loops, under the curated ones.
 *
 * The same strip serves both pickers: what changes is which file types the
 * button offers and what a finished upload does when it is picked. A free
 * account still sees the strip, locked, because a perk nobody can see is a perk
 * nobody upgrades for.
 */

/** How often the list re-reads while something is still being prepared. */
const PROCESSING_POLL_MS = 4000

export function MediaUploadsSection({
  purpose,
  title,
  description,
  isSelected,
  onPick,
  renderThumbnail,
}: {
  purpose: PomodoroUploadPurpose
  title: string
  description: string
  isSelected: (upload: StoredUpload) => boolean
  onPick: (upload: StoredUpload) => void
  renderThumbnail: (upload: StoredUpload) => React.ReactNode
}) {
  const [library, setLibrary] = React.useState<UploadLibrary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [pendingDelete, setPendingDelete] = React.useState<StoredUpload | null>(
    null
  )
  const [deleting, setDeleting] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  // Guests never own uploads, and asking the server anyway answers 401 — which
  // this strip then showed as a red "Please sign in again." on a page that was
  // working perfectly well. The layout already knows who is here, so the strip
  // asks it rather than the server. Every engine in the product does the same.
  const auth = useProductAuth()
  const signedIn = auth.known && auth.authenticated

  const refresh = React.useCallback(() => {
    if (!signedIn) return Promise.resolve()
    return loadUploadLibrary(purpose)
      .then((next) => {
        setLibrary(next)
        setError(null)
      })
      .catch((loadError: unknown) => {
        setError(getPomodoroUploadErrorMessage(loadError))
      })
  }, [purpose, signedIn])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Re-encoding happens on a background pass, so the page has no way of being
  // told when it finishes. It asks again every few seconds, and only while
  // something is actually waiting — a settled list never polls.
  const waiting = (library?.uploads ?? []).some(
    (upload) => upload.status === "queued" || upload.status === "processing"
  )
  React.useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void refresh(), PROCESSING_POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, waiting])

  async function send(file: File) {
    setBusy(true)
    setError(null)
    try {
      await uploadPomodoroMedia(file, purpose)
      await refresh()
    } catch (uploadError) {
      setError(getPomodoroUploadErrorMessage(uploadError))
    } finally {
      setBusy(false)
    }
  }

  // Until the answer arrives the button stays shut. Treating "not known yet"
  // as allowed let a free account open the file picker by clicking quickly,
  // and the upload was then refused by the server a moment later — the right
  // answer, arrived at the wrong way round. The Pro scenes above already start
  // locked and unlock on hydration; this now matches them.
  // A guest gets a settled answer without a request: uploads need an account.
  const known = library !== null || (auth.known && !auth.authenticated)
  const locked = !library || !library.canUploadMedia
  const full = library !== null && library.usedBytes >= library.limitBytes

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <UploadButton
          accept={UPLOAD_ACCEPT[purpose]}
          busy={busy}
          known={known}
          signedIn={signedIn}
          locked={locked}
          full={full}
          inputRef={fileInput}
          onFile={(file) => void send(file)}
        />
      </header>

      <p className="text-xs text-muted-foreground">
        {UPLOAD_HINT[purpose]}
        {library ? (
          <>
            {" "}
            {formatBytes(library.usedBytes)} of{" "}
            {formatBytes(library.limitBytes)} used.
          </>
        ) : null}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {known && (library?.uploads.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          {!signedIn
            ? "Sign in on a Pro plan to put your own here."
            : locked
              ? PRO_PERKS.uploadMedia.lockedReason
              : "Nothing of your own yet."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(library?.uploads ?? []).map((upload) => (
          <UploadCard
            key={upload.mediaId}
            upload={upload}
            selected={isSelected(upload)}
            onPick={() => onPick(upload)}
            onDelete={() => setPendingDelete(upload)}
            thumbnail={renderThumbnail(upload)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
        title="Delete this upload?"
        description={
          pendingDelete
            ? `${pendingDelete.name} is removed for good and the space it takes comes back. If it is the one you are using, you go back to the default.`
            : null
        }
        confirmLabel="Delete upload"
        loading={deleting}
        onConfirm={async () => {
          const target = pendingDelete
          if (!target) return
          setDeleting(true)
          try {
            await removePomodoroUpload(target.mediaId)
            await refresh()
            setPendingDelete(null)
          } catch (deleteError) {
            setError(getPomodoroUploadErrorMessage(deleteError))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </section>
  )
}

/**
 * The one control that starts an upload.
 *
 * Never a dead button: a free account and a full account each say why through
 * the shell's tooltip pattern rather than going grey with no explanation.
 */
function UploadButton({
  accept,
  busy,
  known,
  signedIn,
  locked,
  full,
  inputRef,
  onFile,
}: {
  accept: string
  busy: boolean
  /** The answer is settled — either the server replied, or nobody is signed in. */
  known: boolean
  signedIn: boolean
  locked: boolean
  full: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (file: File) => void
}) {
  const disabled = busy || locked || full
  // No tooltip until the answer is in. A paying member hovering during that
  // moment must not be told uploading is a perk they do not have.
  const reason = !known
    ? null
    : !signedIn
      ? "Sign in on a Pro plan to put your own backgrounds and sounds here."
      : locked
        ? PRO_PERKS.uploadMedia.lockedReason
        : full
          ? "Your storage is full. Delete something you no longer use first."
          : null

  const button = (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
    >
      {busy ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      ) : known && locked ? (
        // Only once the answer is in: a padlock flashed at a paying member
        // while the page was still asking is a small lie.
        <LockIcon className="size-4" aria-hidden="true" />
      ) : (
        <UploadIcon className="size-4" aria-hidden="true" />
      )}
      {busy ? "Uploading…" : "Upload your own"}
    </Button>
  )

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared straight away, so picking the same file twice in a row
          // still fires a change event and still uploads.
          event.target.value = ""
          if (file) onFile(file)
        }}
      />
      {reason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  )
}

const KIND_ICONS = {
  image: ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
} as const

/**
 * One upload. A finished one can be picked; one still being prepared says so
 * and cannot be, because the file behind it is still the raw original.
 */
function UploadCard({
  upload,
  selected,
  onPick,
  onDelete,
  thumbnail,
}: {
  upload: StoredUpload
  selected: boolean
  onPick: () => void
  onDelete: () => void
  thumbnail: React.ReactNode
}) {
  const ready = upload.status === "ready"
  const failed = upload.status === "failed"
  const KindIcon = KIND_ICONS[upload.kind]

  return (
    <Card
      className={cn(
        "overflow-hidden p-0",
        selected && "ring-2 ring-[var(--p-accent)]"
      )}
    >
      <button
        type="button"
        className="group w-full text-left disabled:cursor-not-allowed"
        aria-pressed={selected}
        aria-label={
          ready
            ? `Use ${upload.name}`
            : failed
              ? `${upload.name} could not be prepared`
              : `${upload.name} is still being prepared`
        }
        disabled={!ready}
        onClick={() => {
          if (ready) onPick()
        }}
      >
        <span
          className={cn(
            "relative block bg-muted",
            upload.kind === "audio" ? "aspect-square" : "aspect-video"
          )}
        >
          {ready ? thumbnail : null}
          <span className="absolute inset-0 grid place-items-center">
            {failed ? (
              <TriangleAlertIcon
                className="size-6 text-destructive"
                aria-hidden="true"
              />
            ) : !ready ? (
              <Loader2Icon
                className="size-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : selected ? (
              <CheckIcon
                className="size-6 text-white drop-shadow"
                aria-hidden="true"
              />
            ) : (
              <KindIcon
                className="size-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            )}
          </span>
        </span>
        <CardContent className="flex flex-col gap-0.5 p-3">
          <strong className="truncate text-sm" title={upload.name}>
            {upload.name}
          </strong>
          <small className="truncate text-xs text-muted-foreground">
            {failed
              ? (upload.failureReason ?? "It could not be prepared.")
              : ready
                ? formatBytes(upload.fileSize)
                : "Getting it ready…"}
          </small>
        </CardContent>
      </button>
      <div className="flex justify-end border-t px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title={`Delete ${upload.name}`}
          aria-label={`Delete ${upload.name}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </Card>
  )
}
