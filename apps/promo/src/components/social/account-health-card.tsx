import * as React from "react"
import { AlertTriangleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  checkAccountHealthNow,
  getAccountErrorMessage,
  loadAccountHealth,
  type AccountHealth,
} from "@/lib/api/social/account"
import { formatDate, formatTimeAgo } from "@/lib/format/format-time"
import { accountAgeText, profileCheckWords } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often to ask whether a check has finished, while one is under way. */
const POLL_MS = 3_000

/**
 * Whether the Reddit account is in good standing: who is signed in, the
 * karma, how old the account is, and whether a stranger can see its profile.
 *
 * Each reading says when it was taken, and one never taken says so in words,
 * because a blank or a 0 would read as a real answer. The browser program
 * takes a fresh reading once a day on its own; Check now asks for one at once.
 * Nothing here acts on a bad reading.
 */
export function AccountHealthCard() {
  const [health, setHealth] = React.useState<AccountHealth | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadAccountHealth().then(
        (next) => {
          setHealth(next)
          setError(null)
        },
        (failure: unknown) => setError(getAccountErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Asks again only while a check is waiting or running, and stops when it
  // has finished, which is when the new readings are worth showing.
  const checking = Boolean(health?.checking)
  React.useEffect(() => {
    if (!checking) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [checking, refresh])

  async function checkNow() {
    setAsking(true)
    try {
      await checkAccountHealthNow()
      await refresh()
    } catch (failure) {
      showErrorToast(getAccountErrorMessage(failure))
    } finally {
      setAsking(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="promo-reddit-health"
      title="How Reddit sees the account"
      description="Karma, the account's age, and whether a stranger can see its profile."
      contentClassName="grid gap-4"
    >
        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>The readings could not be loaded. {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : health === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Reading the account
          </p>
        ) : health === null ? (
          <p className="text-sm text-muted-foreground">
            No Reddit account is set up yet. Pick a browser profile above and save.
          </p>
        ) : (
          <>
            <dl className="-mx-4 divide-y border-y">
              <Reading
                label="Signed in as"
                readAt={health.stateReadAt}
                value={
                  health.stateReadAt
                    ? health.handle
                      ? `u/${health.handle}`
                      : "Signed out"
                    : "Not read yet"
                }
              />
              <Reading
                label="Karma"
                readAt={health.karmaReadAt}
                value={health.karma === null ? "Not read yet" : health.karma.toLocaleString()}
              />
              <Reading
                label="Account age"
                readAt={health.karmaReadAt}
                value={
                  health.redditCreatedAt
                    ? `${accountAgeText(health.redditCreatedAt)}, made ${formatDate(health.redditCreatedAt)}`
                    : "Not read yet"
                }
              />
              <ProfileReading health={health} />
            </dl>

            {health.lastError && !checking ? (
              <p className="text-sm text-muted-foreground">
                The last check did not finish. {health.lastError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={asking || checking}
                onClick={() => void checkNow()}
              >
                {asking || checking ? <Loader2Icon className="animate-spin" /> : null}
                {checking ? "Checking" : "Check now"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Checked again on its own once a day, through this profile&apos;s browser.
              </span>
            </div>
          </>
        )}
    </CollapsibleSettingsCard>
  )
}

function Reading({
  label,
  value,
  readAt,
  children,
}: {
  label: string
  /** The reading in words. Left out when `children` carry it instead. */
  value?: string
  readAt: Date | string | null
  children?: React.ReactNode
}) {
  return (
    <div className="grid gap-1 px-4 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="grid gap-0.5">
        {value ? <span className="text-sm">{value}</span> : null}
        {children}
        {readAt ? (
          <span className="text-xs text-muted-foreground">Read {formatTimeAgo(readAt).toLowerCase()}</span>
        ) : null}
      </dd>
    </div>
  )
}

/** What a signed-out visitor saw, worded so a shadowban is never stated as certain. */
function ProfileReading({ health }: { health: AccountHealth }) {
  const check = health.profileCheck
  if (!check) {
    return <Reading label="Seen by a stranger" value="Not checked yet" readAt={null} />
  }
  const words = profileCheckWords(check)
  const otherHandle = health.handle && health.handle !== check.handle
  return (
    <Reading label="Seen by a stranger" readAt={check.readAt}>
      <span className="flex items-start gap-1.5 text-sm">
        {words.concern ? (
          // Decorative: the words beside it already say what was seen.
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {words.text}
      </span>
      {otherHandle ? (
        <span className="text-xs text-muted-foreground">
          This was u/{check.handle}, not u/{health.handle} who is signed in now.
        </span>
      ) : null}
    </Reading>
  )
}
