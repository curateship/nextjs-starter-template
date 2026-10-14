import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getPhoneHealthErrorMessage, loadPhoneHistory, type PhoneEventView } from "@/lib/api/phones/health"
import { formatDateTime } from "@/lib/format/format-time"
import { PHONE_EVENT_WORDS } from "@/lib/phones/options"

/**
 * Everything that happened to the phone, newest first (part 18 of the phone
 * farm): plugged in, unplugged, restarted, an app updated, an account moved
 * on or signed in, ran hot, and each notice raised and cleared. Built like a
 * browser profile's History tab.
 */
export function PhoneHistoryPanel({ phoneId }: { phoneId: string }) {
  const [state, setState] = React.useState<{ entries: PhoneEventView[] | null; error: string | null }>({
    entries: null,
    error: null,
  })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadPhoneHistory(phoneId).then(
      (entries) => {
        if (live) setState({ entries, error: null })
      },
      (error: unknown) => {
        if (live) setState({ entries: null, error: getPhoneHealthErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [phoneId, attempt])

  if (state.error) return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  if (!state.entries) return <LoadingRow label="Reading the history" className="min-h-48" />
  if (!state.entries.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing has happened to this phone yet.</p>
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-0 divide-y p-0">
        {state.entries.map((entry) => (
          <div key={entry.id} className="grid gap-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{PHONE_EVENT_WORDS[entry.kind] ?? entry.kind}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
            </div>
            {entry.detail ? <span className="text-xs text-muted-foreground">{entry.detail}</span> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
