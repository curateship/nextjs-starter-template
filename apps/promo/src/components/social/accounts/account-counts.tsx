import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RedditAccountRow } from "@/lib/api/social/reddit-accounts"
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/social/account-status"
import { isNetwork, NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"

/** The counts each card shows, in the order a farm moves through them. */
const COUNTED: AccountStatus[] = ["warming_up", "ready", "working", "at_risk", "banned"]

/**
 * The farm at a glance (Bans task, part 17): one card per app with accounts,
 * counting Warming up, Ready, Working, At risk and Banned among the accounts
 * in use. A count is a button that filters the list to that app and status.
 */
export function AccountCounts({
  accounts,
  platform,
  status,
  onPick,
}: {
  accounts: RedditAccountRow[]
  platform: Network | null
  status: string
  onPick: (platform: Network, status: AccountStatus) => void
}) {
  const inUse = accounts.filter((row) => !row.retiredAt)
  const apps = NETWORKS.filter((network) => inUse.some((row) => row.platform === network))
  if (!apps.length) return null
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" style={{ gap: pageGutter }}>
      {apps.map((app) => {
        const rows = inUse.filter((row) => isNetwork(row.platform) && row.platform === app)
        return (
          <Card key={app} size="sm">
            <CardHeader>
              <CardTitle>{NETWORK_NAMES[app]}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-5 gap-1">
              {COUNTED.map((value) => {
                const count = rows.filter((row) => row.status.status === value).length
                const picked = platform === app && status === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPick(app, value)}
                    aria-pressed={picked}
                    aria-label={`${NETWORK_NAMES[app]}: ${count} ${ACCOUNT_STATUS_LABELS[value]}`}
                    className={cn(
                      "grid min-w-0 gap-0.5 rounded-md px-1 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      picked && "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        value === "banned" && count ? "text-destructive" : value === "at_risk" && count ? "text-amber-600 dark:text-amber-400" : ""
                      )}
                    >
                      {count}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{ACCOUNT_STATUS_LABELS[value]}</span>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
