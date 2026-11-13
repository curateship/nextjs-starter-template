import * as React from "react"
import { ImagesIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PhoneSectionCard } from "@/components/phones/phone-section-card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  clearActionPictures,
  getPhoneHealthErrorMessage,
  loadStepPictures,
  type StepPicture,
} from "@/lib/api/phones/health"
import {
  getPhoneErrorMessage,
  loadPhoneActions,
  type PhoneActionView,
  type PhoneRecord,
} from "@/lib/api/phones/phones"
import { formatDateTime } from "@/lib/format/format-time"
import { actionWords } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the list is read again while an action is waiting or running. */
const POLL_MS = 2_000

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting for the rack",
  running: "Running on the phone",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

const RECOVERED_WORDS: Record<string, string> = {
  app: "The app froze, so the rack closed it and opened it again.",
  phone: "The phone stopped answering, so the rack restarted it.",
}

/**
 * The phone's last twenty actions, including a job's Reddit steps and the
 * daily self-test. Read the version and Health check, which ask for one, are
 * at the foot of the phone's ⋮ (Tyler, 12 Nov 2026: "move these 2 function
 * down here").
 *
 * Each action keeps a picture of every step (part 17 of the phone farm). A
 * failed one says the step it stopped at; its pictures stay until cleared
 * here. The pictures are only fetched when a row is opened, because each is
 * read out of R2 and opened with the server's key.
 */
export function PhoneActionsPanel({ phone, onChanged }: { phone: PhoneRecord; onChanged: () => Promise<void> }) {
  const [actions, setActions] = React.useState<PhoneActionView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadPhoneActions(phone.id).then(
      (next) => {
        if (!live) return
        setActions(next)
        setError(null)
      },
      (loadError: unknown) => {
        if (live) setError(getPhoneErrorMessage(loadError))
      }
    )
    return () => {
      live = false
    }
  }, [phone.id, attempt])

  const waiting = Boolean(actions?.some((action) => action.status === "queued" || action.status === "running"))
  React.useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setAttempt((count) => count + 1), POLL_MS)
    return () => clearInterval(timer)
  }, [waiting])

  // When an action finishes, the dashboard's row may change too: Busy ends.
  const wasWaiting = React.useRef(false)
  React.useEffect(() => {
    if (wasWaiting.current && !waiting) void onChanged()
    wasWaiting.current = waiting
  }, [waiting, onChanged])

  return (
    <div className="grid min-w-0 gap-3">
      <PhoneSectionCard storageId="promo-phone-actions-last-actions" title="Last actions">
        <div className="-mx-4 -mb-4 border-t">
          {error ? (
            <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
          ) : !actions ? (
            <LoadingRow label="Reading the actions" className="min-h-32" />
          ) : !actions.length ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing has run on this phone yet.</p>
          ) : (
            <div className="grid divide-y">
              {actions.map((action) => (
                <ActionRow key={action.id} action={action} onCleared={() => setAttempt((count) => count + 1)} />
              ))}
            </div>
          )}
        </div>
      </PhoneSectionCard>
    </div>
  )
}

function ActionRow({ action, onCleared }: { action: PhoneActionView; onCleared: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [pictures, setPictures] = React.useState<StepPicture[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [clearing, setClearing] = React.useState(false)
  // A step picture opened full size (Racks dashboard, part 114): the panel shows them small.
  const [big, setBig] = React.useState<{ src: string; step: string; index: number } | null>(null)
  const failed = action.status === "failed"
  const stoppedAt = failed ? action.steps[action.steps.length - 1] : ""

  React.useEffect(() => {
    if (!open || pictures) return
    let live = true
    loadStepPictures(action.id).then(
      (next) => {
        if (live) setPictures(next)
      },
      (error: unknown) => {
        if (live) setLoadError(getPhoneHealthErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [action.id, open, pictures])

  async function clear() {
    setClearing(true)
    try {
      await clearActionPictures(action.id)
      setOpen(false)
      setPictures(null)
      onCleared()
    } catch (error) {
      showErrorToast(getPhoneHealthErrorMessage(error))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="grid gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{actionWords(action.action)}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(action.createdAt)}</span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {action.status === "queued" || action.status === "running" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
        {STATUS_WORDS[action.status] ?? action.status}
      </span>
      {action.answer ? <span>{action.answer}</span> : null}
      {action.error ? <span className="text-destructive">{action.error}</span> : null}
      {RECOVERED_WORDS[action.recovered] ? <span className="text-muted-foreground">{RECOVERED_WORDS[action.recovered]}</span> : null}
      {stoppedAt ? <span className="text-destructive">Stopped at: {stoppedAt}</span> : null}
      {action.steps.length ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
            <ImagesIcon />
            {open ? "Hide the steps" : `Show the ${action.steps.length} ${action.steps.length === 1 ? "step" : "steps"}`}
          </Button>
          {failed ? (
            <Button type="button" variant="ghost" size="sm" disabled={clearing} onClick={() => void clear()}>
              {clearing ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Clear the pictures
            </Button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        loadError ? (
          <span className="text-destructive">{loadError}</span>
        ) : !pictures ? (
          <LoadingRow label="Opening the pictures" className="min-h-24" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {pictures.map((picture, index) => (
              <figure key={picture.id} className="grid w-24 gap-1">
                {picture.src ? (
                  <button
                    type="button"
                    className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Open step ${index + 1} full size`}
                    onClick={() => setBig({ src: picture.src as string, step: picture.step, index })}
                  >
                    <img
                      src={picture.src}
                      alt={`Step ${index + 1}: ${picture.step || "the screen"}`}
                      className="h-44 w-24 rounded-md border object-cover object-top"
                    />
                  </button>
                ) : (
                  <div className="flex h-44 w-24 items-center justify-center rounded-md border p-2 text-center text-xs text-muted-foreground">
                    This picture could not be kept.
                  </div>
                )}
                <figcaption className="text-xs text-muted-foreground">
                  {index + 1}. {picture.step || "Picture"}
                </figcaption>
              </figure>
            ))}
          </div>
        )
      ) : null}
      <Dialog open={big !== null} onOpenChange={(next) => (next ? undefined : setBig(null))}>
        <DialogContent variant="admin" className="data-[variant=admin]:sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{big ? `Step ${big.index + 1}: ${big.step || "the screen"}` : "Step"}</DialogTitle>
            <DialogDescription>{actionWords(action.action)}, {formatDateTime(action.createdAt)}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {big ? <img src={big.src} alt={`Step ${big.index + 1}: ${big.step || "the screen"}`} className="mx-auto max-h-[70vh] w-auto rounded-md border" /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setBig(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
