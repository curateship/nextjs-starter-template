import * as React from "react"
import {
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MusicIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  formatBytes,
  UPLOAD_ACCEPT,
  UPLOAD_HINT,
  uploadRefusal,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import {
  getPomodoroUploadErrorMessage,
  loadUploadLibrary,
  removePomodoroUpload,
  uploadPomodoroMedia,
  type StoredUpload,
  type UploadLibrary,
  type UploadProgress,
} from "@/lib/api/pomodoro/media-uploads"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { CurrentlySelectedLabel } from "@/components/pomodoro/media-add-actions"
import { useOpenPlans } from "@/lib/pomodoro/use-open-plans"

/**
 * A member's own backgrounds or sound loops, under the curated ones: one card
 * with a "YOUR OWN" heading and the space used, two buttons (upload a file,
 * or go to the AI generator below), and the uploads under it. Tyler, 7 Oct
 * 2026: "remove the upload box ... Clicking the button is enough."
 *
 * The same card serves both pickers: what changes is which file types the
 * picker takes and what a finished upload does when it is picked. A free
 * account still sees the card, locked, because a perk nobody can see is a perk
 * nobody upgrades for.
 */

/** How often the list re-reads while something is still being prepared. */
const PROCESSING_POLL_MS = 4000

export function MediaUploadsSection({
  purpose,
  title,
  uploadLabel,
  description,
  onGenerate,
  reloadToken = 0,
  isSelected,
  isPreviewed,
  onPick,
  renderActions,
  renderPreview,
  renderThumbnail,
}: {
  purpose: PomodoroUploadPurpose
  title: string
  /** The upload button's words: "Upload sound". */
  uploadLabel: string
  /** Said after the file limits, under the buttons. */
  description: string
  /** Generate with AI: takes the reader to the generator on the same page. */
  onGenerate: () => void
  /**
   * Bump this to make the strip read its list again. The generator below uses
   * it: an AI file lands as an ordinary upload, so it belongs in this grid, and
   * nothing else would tell the grid it is there.
   */
  reloadToken?: number
  /** Whether this upload is the one in use in the room you are in. */
  isSelected: (upload: StoredUpload) => boolean
  /**
   * Sounds previews on the page: `onPick` plays the upload, and the Add
   * buttons from `renderActions` are drawn under the one `isPreviewed` names.
   */
  isPreviewed?: (upload: StoredUpload) => boolean
  onPick?: (upload: StoredUpload) => void
  renderActions?: (upload: StoredUpload) => React.ReactNode
  /**
   * Backgrounds previews in a popover instead: it wraps the card's button in
   * one, and the popover holds the preview and the Add buttons.
   */
  renderPreview?: (
    upload: StoredUpload,
    card: React.ReactElement
  ) => React.ReactNode
  renderThumbnail: (upload: StoredUpload) => React.ReactNode
}) {
  const [library, setLibrary] = React.useState<UploadLibrary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Non-null for the whole of an upload, so it doubles as "busy".
  const [progress, setProgress] = React.useState<UploadProgress | null>(null)
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
  }, [purpose, reloadToken, signedIn])

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
    // The page already knows the limits and the space left, so a file that
    // cannot fit is turned away here instead of after the whole upload.
    const refusal = library
      ? uploadRefusal(file, library.limitBytes - library.usedBytes)
      : null
    if (refusal) {
      setError(refusal)
      return
    }
    setProgress({ phase: "sending", percent: 0 })
    setError(null)
    try {
      await uploadPomodoroMedia(file, purpose, setProgress)
      await refresh()
    } catch (uploadError) {
      setError(getPomodoroUploadErrorMessage(uploadError))
    } finally {
      setProgress(null)
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

  const headingId = `your-own-${purpose}`

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-[24px] border bg-[var(--p-surface)] p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className={eyebrowClass}>
          {title}
        </h3>
        {library ? (
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(library.usedBytes)} of{" "}
            {formatBytes(library.limitBytes)}
          </span>
        ) : null}
      </header>

      <UploadActions
        accept={UPLOAD_ACCEPT[purpose]}
        label={uploadLabel}
        hint={`${UPLOAD_HINT[purpose]} ${description}`}
        progress={progress}
        known={known}
        signedIn={signedIn}
        locked={locked}
        full={full}
        inputRef={fileInput}
        onFile={(file) => void send(file)}
        onGenerate={onGenerate}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {(library?.uploads.length ?? 0) > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(library?.uploads ?? []).map((upload) => (
            <UploadCard
              key={upload.mediaId}
              upload={upload}
              selected={isSelected(upload)}
              actions={
                isPreviewed?.(upload) ? (renderActions?.(upload) ?? null) : null
              }
              onPick={() => onPick?.(upload)}
              wrapPick={
                renderPreview
                  ? (card) => renderPreview(upload, card)
                  : undefined
              }
              onDelete={() => setPendingDelete(upload)}
              thumbnail={renderThumbnail(upload)}
            />
          ))}
        </div>
      ) : null}

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

/** The small spaced capitals that name the card, as on the timer's cards. */
const eyebrowClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"

/**
 * The two buttons: Upload, which opens the file picker, and Generate with AI,
 * which goes to the generator further down the page.
 *
 * Upload is never dead. A guest is sent to sign in, a free account to the
 * plans, and a full account is told why under the buttons, each with the
 * reason beside it, rather than a grey button with nothing to say.
 */
function UploadActions({
  accept,
  label,
  hint,
  progress,
  known,
  signedIn,
  locked,
  full,
  inputRef,
  onFile,
  onGenerate,
}: {
  accept: string
  label: string
  hint: string
  progress: UploadProgress | null
  /** The answer is settled — either the server replied, or nobody is signed in. */
  known: boolean
  signedIn: boolean
  locked: boolean
  full: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (file: File) => void
  onGenerate: () => void
}) {
  const { openPlans } = useOpenPlans()
  const [fullNotice, setFullNotice] = React.useState(false)
  const busy = progress !== null
  // Nothing is said until the answer is in. A paying member must not be told,
  // even for a moment, that uploading is a perk they do not have.
  const reason = !known
    ? null
    : !signedIn
      ? "Sign in on a Pro plan to put your own backgrounds and sounds here."
      : locked
        ? PRO_PERKS.uploadMedia.lockedReason
        : full && fullNotice
          ? "Your storage is full. Delete something you no longer use first."
          : null

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared straight away, so picking the same file twice in a row
          // still fires a change event and still uploads.
          event.target.value = ""
          if (file) onFile(file)
        }}
      />
      <span className="sr-only" aria-live="polite">
        {spokenProgress(progress)}
      </span>
      <div className="flex flex-wrap gap-2">
        {!known ? (
          <Button type="button" className="rounded-full" disabled>
            <Loader2Icon className="animate-spin" aria-hidden="true" />
            {label}
          </Button>
        ) : !signedIn ? (
          <SignInButton variant="default" />
        ) : (
          <Button
            type="button"
            className="rounded-full"
            disabled={busy}
            onClick={() => {
              if (locked) openPlans()
              else if (full) setFullNotice(true)
              else inputRef.current?.click()
            }}
          >
            {busy ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : locked ? (
              <LockIcon aria-hidden="true" />
            ) : (
              <UploadIcon aria-hidden="true" />
            )}
            {progress === null
              ? label
              : progress.phase === "checking"
                ? "Checking the file…"
                : `Uploading… ${progress.percent}%`}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onGenerate}
        >
          <SparklesIcon aria-hidden="true" />
          Generate with AI
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{reason ?? hint}</p>
    </div>
  )
}

/**
 * What a screen reader hears, in quarters. The button's own figure moves every
 * percent, and reading each one out would talk over everything else.
 */
function spokenProgress(progress: UploadProgress | null) {
  if (progress === null) return ""
  if (progress.phase === "checking") return "Uploaded. Checking the file."
  const quarter = Math.floor(progress.percent / 25) * 25
  return quarter > 0 ? `Uploading, ${quarter}%` : "Uploading"
}

const KIND_ICONS = {
  image: ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
} as const

/**
 * One upload. A finished one can be previewed; one still being prepared says
 * so and cannot be, because the file behind it is still the raw original.
 */
function UploadCard({
  upload,
  selected,
  actions,
  onPick,
  wrapPick,
  onDelete,
  thumbnail,
}: {
  upload: StoredUpload
  /** In use in the room you are in. */
  selected: boolean
  /** The Add buttons, while this upload is being previewed. */
  actions: React.ReactNode
  onPick: () => void
  /** Wraps a finished card's button, for a page that previews in a popover. */
  wrapPick?: (card: React.ReactElement) => React.ReactNode
  onDelete: () => void
  thumbnail: React.ReactNode
}) {
  const ready = upload.status === "ready"
  const failed = upload.status === "failed"
  const KindIcon = KIND_ICONS[upload.kind]

  const pickButton = (
    <button
      type="button"
      className="group w-full text-left disabled:cursor-not-allowed"
      aria-label={
        ready
          ? `Preview ${upload.name}`
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
        {selected ? <CurrentlySelectedLabel /> : null}
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
  )

  return (
    <Card
      className={cn(
        "overflow-hidden p-0",
        selected && "ring-2 ring-[var(--p-accent)]"
      )}
    >
      {ready && wrapPick ? wrapPick(pickButton) : pickButton}
      <div className="flex items-center justify-end gap-2 border-t px-2 py-1">
        {actions ? <div className="mr-auto">{actions}</div> : null}
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
