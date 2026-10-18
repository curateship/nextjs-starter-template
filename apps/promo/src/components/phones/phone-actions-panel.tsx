import * as React from "react"
import { HeartPulseIcon, ImagesIcon, Loader2Icon, SmartphoneIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  runPhoneAction,
  type PhoneActionView,
  type PhoneRecord,
} from "@/lib/api/phones/phones"
import { formatDateTime } from "@/lib/format/format-time"
import { actionWords, MANUAL_PHONE_ACTIONS } from "@/lib/phones/options"
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

type ManualAction = (typeof MANUAL_PHONE_ACTIONS)[number]

/**
 * The phone's actions: ask the rack to read the system version off the
 * phone's own Settings screen, or take a health reading, and see the last
 * twenty actions, including a job's Reddit steps and the daily self-test.
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
  const [asking, setAsking] = React.useState<ManualAction | null>(null)

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

  async function ask(action: ManualAction) {
    setAsking(action)
    try {
      await runPhoneAction(phone.id, action)
      setAttempt((count) => count + 1)
    } catch (askError) {
      showErrorToast(getPhoneErrorMessage(askError))
    } finally {
      setAsking(null)
    }
  }

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Ask the phone</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            The rack runs each check on the phone and sends back the answer. Reading the
            version opens Settings on the phone, reads the screen and goes back home.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={asking !== null}
              onClick={() => void ask("phone/android-version")}
            >
              {asking === "phone/android-version" ? <Loader2Icon className="animate-spin" /> : <SmartphoneIcon />}
              Read the system version from Settings
            </Button>
            <Button type="button" variant="outline" disabled={asking !== null} onClick={() => void ask("phone/health")}>
              {asking === "phone/health" ? <Loader2Icon className="animate-spin" /> : <HeartPulseIcon />}
              Health check
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Last actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </div>
  )
}

function ActionRow({ action, onCleared }: { action: PhoneActionView; onCleared: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [pictures, setPictures] = React.useState<StepPicture[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [clearing, setClearing] = React.useState(false)
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
      toast.success("Pictures cleared.")
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
          <div className="flex flex-wrap gap-3">
            {pictures.map((picture, index) => (
              <figure key={picture.id} className="grid w-40 gap-1">
                {picture.src ? (
                  <img
                    src={picture.src}
                    alt={`Step ${index + 1}: ${picture.step || "the screen"}`}
                    className="h-72 w-40 rounded-md border object-cover object-top"
                  />
                ) : (
                  <div className="flex h-72 w-40 items-center justify-center rounded-md border p-2 text-center text-xs text-muted-foreground">
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
    </div>
  )
}
