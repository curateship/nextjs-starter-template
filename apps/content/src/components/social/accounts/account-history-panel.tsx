import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getBansErrorMessage, loadAccountHistory, type AccountEventView } from "@/lib/api/bans"
import { ACCOUNT_EVENT_WORDS } from "@/lib/bans/options"
import { formatDateTime } from "@/lib/format/format-time"

/**
 * Everything that happened to an account, newest first (Bans task, part 14):
 * added, moved, banned, appealed, the appeal's answer, let run again,
 * retired with its reason, and cleaned up. Laid out like a phone's History
 * tab (`src/components/phones/phone-history-panel.tsx`).
 */
export function AccountHistoryPanel({ accountId }: { accountId: string }) {
  const [state, setState] = React.useState<{ entries: AccountEventView[] | null; error: string | null }>({ entries: null, error: null })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadAccountHistory(accountId).then(
      (entries) => {
        if (live) setState({ entries, error: null })
      },
      (error: unknown) => {
        if (live) setState({ entries: null, error: getBansErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [accountId, attempt])

  if (state.error) return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  if (!state.entries) return <LoadingRow label="Reading the history" className="min-h-48" />
  if (!state.entries.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing has been recorded about this account yet. Lines start from when Promo began keeping them.</p>
  }
  return (
    <Card size="sm">
      <CardContent className="grid gap-0 divide-y p-0">
        {state.entries.map((entry) => (
          <div key={entry.id} className="grid gap-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{ACCOUNT_EVENT_WORDS[entry.kind] ?? entry.kind}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
            </div>
            {entry.detail ? <span className="text-xs text-muted-foreground">{entry.detail}</span> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
