import * as React from "react"
import { Link } from "@tanstack/react-router"

import { PanelCard } from "@/components/shared/panel-card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getPhoneHealthErrorMessage, loadPhoneHistory, type PhoneEventView } from "@/lib/api/phones/health"
import { formatDateTime } from "@/lib/format/format-time"
import { PHONE_EVENT_WORDS } from "@/lib/phones/options"
import { getBansErrorMessage, loadPhoneTenancies, type TenancyView } from "@/lib/api/bans"
import { appName, TENANCY_END_WORDS } from "@/lib/bans/options"
import { handleWords } from "@/lib/social/networks"

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

  return (
    <div className="grid min-w-0 gap-3">
      <PhoneAccountsCard phoneId={phoneId} />
      {state.entries.length ? (
        <PanelCard storageId="promo-phone-history-what-happened" title="What happened">
          <div className="-mx-4 -mb-4 grid divide-y border-t">
            {state.entries.map((entry) => (
              <div key={entry.id} className="grid gap-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{PHONE_EVENT_WORDS[entry.kind] ?? entry.kind}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
                </div>
                {entry.detail ? <span className="text-xs text-muted-foreground">{entry.detail}</span> : null}
              </div>
            ))}
          </div>
        </PanelCard>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing has happened to this phone yet.</p>
      )}
    </div>
  )
}

/**
 * Every account the phone has held, newest first (Bans task, part 2): the
 * handle and app, from and to, and how it left. Each row opens the account
 * on the Accounts dashboard. Moves before this record began are only the
 * free-text lines below.
 */
function PhoneAccountsCard({ phoneId }: { phoneId: string }) {
  const [rows, setRows] = React.useState<TenancyView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadPhoneTenancies(phoneId).then(
      (next) => {
        if (live) {
          setRows(next)
          setError(null)
        }
      },
      (failure: unknown) => {
        if (live) setError(getBansErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [phoneId, attempt])

  return (
    <PanelCard storageId="promo-phone-history-accounts" title="Accounts">
      <div className="-mx-4 -mb-4 border-t">
        {error ? (
          <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
        ) : !rows ? (
          <LoadingRow label="Reading the accounts" />
        ) : !rows.length ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No account has been on this phone since Promo started keeping this list.</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => {
              const name = handleWords(row.platform, row.handle) || `${appName(row.platform)} account, not signed in`
              const when = `${formatDateTime(row.arrivedAt)} to ${row.leftAt ? formatDateTime(row.leftAt) : "now"}`
              return (
                <div key={row.id} className="grid gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {row.accountId ? (
                      <Link to="/admin/projects" search={{ section: "accounts", open: row.accountId }} className="font-medium hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="font-medium">{name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{row.leftHow ? TENANCY_END_WORDS[row.leftHow] : "On it now"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {appName(row.platform)} · {when}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PanelCard>
  )
}
