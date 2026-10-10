import * as React from "react"
import {
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
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
  UPLOAD_HINT,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import {
  getPomodoroUploadErrorMessage,
  loadUploadLibrary,
  removePomodoroUpload,
  type StoredUpload,
  type UploadLibrary,
} from "@/lib/api/pomodoro/media-uploads"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { UploadWindow } from "@/components/pomodoro/upload-window"
import { UploadEditDialog } from "@/components/pomodoro/upload-edit-dialog"
import { CurrentlySelectedLabel } from "@/components/pomodoro/media-add-actions"
import { useOpenPlans } from "@/lib/pomodoro/use-open-plans"

/**
 * A member's own backgrounds or sound loops, under the curated ones: one card
 * with a "YOUR OWN" heading and the space used, two buttons (upload a file,
 * or go to the AI generator below), and the uploads under it. Tyler, 7 Oct
 * 2026: "remove the upload box ... Clicking the button is enough."
 *
 * The same card serves both kinds on My uploads: what changes is which file
 * types the upload window takes and what a finished upload does when it is
 * picked. A free
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
  onPick,
  isPlaying,
  onWindowOpen,
  renderAddMenu,
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
   * A click or tap on a finished card calls `onPick`. Sounds plays the file
   * through its preview player, and a second click stops it; Backgrounds
   * plays the film inside the thumbnail, on hover too. Tyler, 10 Oct 2026:
   * a sound plays on a click only, because playing on hover fought the click.
   */
  onPick?: (upload: StoredUpload) => void
  /** Whether this sound is the one the preview player is playing. */
  isPlaying?: (upload: StoredUpload) => boolean
  /**
   * Called as the upload window or the cog's window opens, so a card's
   * preview is not left playing under the window's own player.
   */
  onWindowOpen?: () => void
  /** The "+" beside the delete button that opens the Add choices. */
  renderAddMenu?: (upload: StoredUpload) => React.ReactNode
  /**
   * `playing` is true for a picture or clip while the card is hovered or was
   * tapped, and for a sound while the preview player is playing it.
   */
  renderThumbnail: (upload: StoredUpload, playing: boolean) => React.ReactNode
}) {
  const [library, setLibrary] = React.useState<UploadLibrary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [windowOpen, setWindowOpen] = React.useState(false)
  // Bumped on every open, so each visit to the window starts empty.
  const [windowKey, setWindowKey] = React.useState(0)
  const [editing, setEditing] = React.useState<StoredUpload | null>(null)
  // Bumped on every open, so each edit starts from the saved values.
  const [editKey, setEditKey] = React.useState(0)
  const [pendingDelete, setPendingDelete] = React.useState<StoredUpload | null>(
    null
  )
  const [deleting, setDeleting] = React.useState(false)

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
        label={uploadLabel}
        hint={`${UPLOAD_HINT[purpose]} ${description}`}
        known={known}
        signedIn={signedIn}
        locked={locked}
        full={full}
        onUpload={() => {
          onWindowOpen?.()
          setError(null)
          setWindowKey((key) => key + 1)
          setWindowOpen(true)
        }}
        onGenerate={onGenerate}
      />
      {library ? (
        <UploadWindow
          key={`upload-${windowKey}`}
          open={windowOpen}
          onClose={() => setWindowOpen(false)}
          purpose={purpose}
          library={library}
          onUploaded={() => void refresh()}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {(library?.uploads.length ?? 0) > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {(library?.uploads ?? []).map((upload) => (
            <UploadCard
              key={upload.mediaId}
              upload={upload}
              selected={isSelected(upload)}
              addMenu={renderAddMenu?.(upload) ?? null}
              onPick={() => onPick?.(upload)}
              playing={isPlaying?.(upload) ?? false}
              onEdit={() => {
                onWindowOpen?.()
                setEditKey((key) => key + 1)
                setEditing(upload)
              }}
              onDelete={() => setPendingDelete(upload)}
              renderThumbnail={(playing) => renderThumbnail(upload, playing)}
            />
          ))}
        </div>
      ) : null}

      <UploadEditDialog
        key={`edit-${editKey}`}
        // The list's own copy, so a cut finishing while the window is open
        // shows there; the window's fields keep what was typed.
        upload={
          editing
            ? (library?.uploads.find((one) => one.mediaId === editing.mediaId) ??
              editing)
            : null
        }
        knownTags={library?.knownTags ?? []}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />

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
 * The two buttons: Upload, which opens the upload window, and Generate with
 * AI, which goes to the generator further down the page.
 *
 * Upload is never dead. A guest is sent to sign in, a free account to the
 * plans, and a full account is told why under the buttons, each with the
 * reason beside it, rather than a grey button with nothing to say.
 */
function UploadActions({
  label,
  hint,
  known,
  signedIn,
  locked,
  full,
  onUpload,
  onGenerate,
}: {
  label: string
  hint: string
  /** The answer is settled — either the server replied, or nobody is signed in. */
  known: boolean
  signedIn: boolean
  locked: boolean
  full: boolean
  onUpload: () => void
  onGenerate: () => void
}) {
  const { openPlans } = useOpenPlans()
  const [fullNotice, setFullNotice] = React.useState(false)
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
            onClick={() => {
              if (locked) openPlans()
              else if (full) setFullNotice(true)
              else onUpload()
            }}
          >
            {locked ? (
              <LockIcon aria-hidden="true" />
            ) : (
              <UploadIcon aria-hidden="true" />
            )}
            {label}
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

/** The cog and the bin on a card's picture: the play button's glass circle. */
const cornerButton =
  "rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"

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
  addMenu,
  onPick,
  playing,
  onEdit,
  onDelete,
  renderThumbnail,
}: {
  upload: StoredUpload
  /** In use in the room you are in. */
  selected: boolean
  /** The "+" that opens the Add choices. */
  addMenu: React.ReactNode
  onPick: () => void
  /** A sound being previewed shows Pause. */
  playing: boolean
  onEdit: () => void
  onDelete: () => void
  renderThumbnail: (playing: boolean) => React.ReactNode
}) {
  // A finished file plays, including the old cut while a new trim is made.
  const ready = upload.url !== ""
  const failed = upload.status === "failed"
  const cutting = upload.status === "queued" || upload.status === "processing"
  const KindIcon = KIND_ICONS[upload.kind]
  // Drawn like the catalogue's cards beside it: a sound like a Sounds card,
  // a picture or clip like a Theme card. Tyler, 10 Oct 2026: "it needs to
  // look similiar in size and structure".
  const sound = upload.kind === "audio"
  const status = cutting
    ? ready
      ? "Making the new cut…"
      : "Getting it ready…"
    : failed
      ? ready
        ? "The new cut could not be made. The old one still plays."
        : (upload.failureReason ?? "It could not be prepared.")
      : null
  const [hovered, setHovered] = React.useState(false)
  const [tapped, setTapped] = React.useState(false)

  const pickButton = (
    <button
      type="button"
      className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
      aria-label={
        ready
          ? `Preview ${upload.name}`
          : failed
            ? `${upload.name} could not be prepared`
            : `${upload.name} is still being prepared`
      }
      disabled={!ready}
      onClick={() => {
        if (!ready) return
        if (!sound) setTapped((current) => !current)
        onPick()
      }}
    >
      <span
        className={cn(
          "relative block bg-muted",
          // The square waveform picture, cropped wide as on Sounds.
          sound ? "aspect-[8/5]" : "aspect-video"
        )}
      >
        {ready ? renderThumbnail(sound ? playing : hovered || tapped) : null}
        {/* At the foot of the picture, because the cog and the bin hold the
            top corner and a narrow card has no room for both. */}
        {selected ? <CurrentlySelectedLabel className="top-auto bottom-2 whitespace-nowrap" /> : null}
        <span className="absolute inset-0 grid place-items-center">
          {failed && !ready ? (
            <TriangleAlertIcon
              className="size-6 text-destructive"
              aria-hidden="true"
            />
          ) : !ready ? (
            <Loader2Icon
              className="size-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : sound ? (
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                !playing &&
                  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              )}
            >
              {playing ? (
                <PauseIcon className="size-5" aria-hidden="true" />
              ) : (
                <PlayIcon className="size-5" aria-hidden="true" />
              )}
            </span>
          ) : (
            <KindIcon
              className="size-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          )}
        </span>
      </span>
      {/* Room on the right for the "+" beside the button. */}
      <CardContent
        className={cn(
          "flex flex-col pr-14",
          sound ? "gap-1 py-4 pl-[18px]" : "gap-0.5 py-3 pl-3"
        )}
      >
        <strong
          className={cn("truncate", sound ? "text-base font-semibold" : "text-sm")}
          title={upload.name}
        >
          {upload.name}
        </strong>
        {/* A finished file shows its name alone, as the catalogue's cards
            do; a line under it only says what is still happening. */}
        {status ? (
          <small
            className={cn(
              "truncate text-muted-foreground",
              sound ? "text-sm" : "text-xs"
            )}
          >
            {status}
          </small>
        ) : null}
      </CardContent>
    </button>
  )

  return (
    <Card
      className={cn(
        "relative gap-0 overflow-hidden p-0",
        sound && "rounded-[18px]",
        selected && "ring-2 ring-[var(--p-accent)]"
      )}
      // A film plays while the pointer is over the card, on the whole card
      // so moving onto the "+" keeps it playing. Only a mouse hovers; a
      // finger's tap is the button's click. A sound plays on a click only.
      onPointerEnter={(event) => {
        if (!ready || sound || event.pointerType !== "mouse") return
        setHovered(true)
      }}
      onPointerLeave={(event) => {
        if (!ready || sound || event.pointerType !== "mouse") return
        setHovered(false)
        setTapped(false)
      }}
    >
      {pickButton}
      {/* Beside the card's button, because a button cannot sit inside
          another one. The "+" sits by the name as on the catalogue's cards;
          the cog and the bin sit on the picture's corner, so the name keeps
          the room it has there. */}
      {ready ? (
        <div
          // Centred on the name's line. The text under the picture has a
          // fixed height (padding, a name line, and a status line only while
          // something is happening), so the distance from the card's foot to
          // the middle of the name is known: padding, the status line and its
          // gap if shown, half the name's line, less half the 32px button.
          className={cn(
            "absolute right-3",
            sound
              ? status
                ? "bottom-9"
                : "bottom-3"
              : status
                ? "bottom-6"
                : "bottom-1.5"
          )}
        >
          {addMenu}
        </div>
      ) : null}
      <div className="absolute top-2 right-2 flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cornerButton}
          onClick={onEdit}
          title={`Edit ${upload.name}`}
          aria-label={`Edit ${upload.name}`}
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cornerButton}
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
