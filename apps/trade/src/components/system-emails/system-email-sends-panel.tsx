import * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { EmptyRow } from "@/components/shared/feed-card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getSystemEmailErrorMessage,
  loadSystemEmailSends,
  type SystemEmailSendItem,
} from "@/lib/api/email/system-emails"
import { SYSTEM_EMAIL_META, type SystemEmailKind } from "@/lib/system-emails/kinds"
import { formatDateTime } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

/**
 * The bottom panel: who has actually been sent this email.
 *
 * There is no progress bar and no pause button, because nobody sends one of
 * these — the app does, whenever somebody registers or forgets a password. So
 * the only question worth answering is "did it go out, and to whom", and that
 * is the whole panel.
 *
 * What has to survive the panel being dragged shut lives in the header strip,
 * since that header is all that is left on screen when it is collapsed.
 */
export function SystemEmailSendsPanel({
  kind,
  /** Bumped after a test send, which is what brings the new row into the list. */
  refreshToken,
}: {
  kind: SystemEmailKind
  refreshToken: number
}) {
  const [sends, setSends] = React.useState<SystemEmailSendItem[]>([])
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const meta = SYSTEM_EMAIL_META[kind]

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadSystemEmailSends(kind, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setSends(page.sends)
        setHasMore(page.hasMore)
        setError(null)
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(getSystemEmailErrorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, refreshToken])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = await loadSystemEmailSends(kind, {
        limit: PAGE_SIZE,
        offset: sends.length,
      })
      setSends((current) => [...current, ...page.sends])
      setHasMore(page.hasMore)
      setError(null)
    } catch (loadError) {
      setError(getSystemEmailErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  const failed = sends.filter((send) => send.status === "failed").length
  const summary = loading
    ? "Looking…"
    : sends.length === 0
      ? "Nothing has gone out yet"
      : `Last ${sends.length} shown` +
        (failed > 0 ? ` · ${failed} did not go through` : "")

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-3">
        <span className="text-sm font-medium">Recent sends</span>
        <span className="truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </DashboardCardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {error ? <ErrorBanner message={error} /> : null}

          <div className="grid gap-1.5">
            <p className="text-sm text-muted-foreground">{meta.whenSent}</p>
            {meta.tokens.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                You can drop{" "}
                {meta.tokens.map((token, index) => (
                  <React.Fragment key={token.token}>
                    {index > 0
                      ? index === meta.tokens.length - 1
                        ? " and "
                        : ", "
                      : null}
                    <code
                      className="rounded bg-muted px-1 py-0.5 text-xs"
                      title={token.description}
                    >
                      {token.token}
                    </code>
                  </React.Fragment>
                ))}{" "}
                into the words, and they are filled in for each person.
              </p>
            ) : null}
          </div>

          {!loading && sends.length === 0 ? (
            <EmptyRow>
              Nobody has been sent this yet. Every one that goes out from now on
              shows up here.
            </EmptyRow>
          ) : null}

          {sends.length > 0 ? (
            <div className="grid gap-1">
              {sends.map((send) => (
                <div
                  key={send.id}
                  className="grid gap-0.5 rounded-md border border-foreground/5 px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        send.status === "sent"
                          ? "bg-emerald-500 dark:bg-emerald-400"
                          : "bg-destructive"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {send.toEmail}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(send.created_at)}
                    </span>
                  </div>
                  {/* The time still shows on a failure. "It did not work" is
                      only half the answer; "at 2pm, and here is why" is the
                      other half. */}
                  {send.status === "failed" ? (
                    <p className="pl-3.5 text-xs text-destructive">
                      {send.error ?? "Did not go through"}
                    </p>
                  ) : null}
                </div>
              ))}
              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 justify-self-start"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
