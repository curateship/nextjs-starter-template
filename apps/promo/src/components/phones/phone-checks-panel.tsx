import * as React from "react"
import { HeartPulseIcon, Loader2Icon, SmartphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getPhoneErrorMessage,
  loadPhoneActions,
  runPhoneAction,
  type PhoneActionView,
  type PhoneRecord,
} from "@/lib/api/phones/phones"
import { formatDateTime } from "@/lib/format/format-time"
import { PHONE_ACTION_WORDS, type PhoneAction } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the list is read again while a check is waiting or running. */
const POLL_MS = 2_000

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting for the rack",
  running: "Running on the phone",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

/**
 * The phone's checks: ask the rack to read the Android version off the
 * phone's own Settings screen, or take a health reading, and see the last ten
 * answers with any pictures the phone sent back.
 */
export function PhoneChecksPanel({ phone, onChanged }: { phone: PhoneRecord; onChanged: () => Promise<void> }) {
  const [actions, setActions] = React.useState<PhoneActionView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [asking, setAsking] = React.useState<PhoneAction | null>(null)

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

  // When a check finishes, the dashboard's row may change too: Busy ends.
  const wasWaiting = React.useRef(false)
  React.useEffect(() => {
    if (wasWaiting.current && !waiting) void onChanged()
    wasWaiting.current = waiting
  }, [waiting, onChanged])

  async function ask(action: PhoneAction) {
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
              Read the Android version from Settings
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
          <CardTitle>Last answers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
          ) : !actions ? (
            <LoadingRow label="Reading the checks" className="min-h-32" />
          ) : !actions.length ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No checks run on this phone yet.</p>
          ) : (
            <div className="grid divide-y">
              {actions.map((action) => (
                <div key={action.id} className="grid gap-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {PHONE_ACTION_WORDS[action.action as PhoneAction] ?? action.action}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(action.createdAt)}</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {action.status === "queued" || action.status === "running" ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : null}
                    {STATUS_WORDS[action.status] ?? action.status}
                  </span>
                  {action.answer ? <span>{action.answer}</span> : null}
                  {action.error ? <span className="text-destructive">{action.error}</span> : null}
                  {action.screenshots.length ? (
                    <div className="flex flex-wrap gap-2">
                      {action.screenshots.map((src, index) => (
                        <img
                          key={index}
                          src={src}
                          alt={`What the phone's screen showed, picture ${index + 1}`}
                          className="h-48 w-auto rounded-md border"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
