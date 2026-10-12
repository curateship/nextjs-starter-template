import { Badge } from "@/components/ui/badge"
import { accountStatusText, type AccountStatusView } from "@/lib/social/account-status"

/**
 * An account's status as a badge, the same on the Reddit accounts dashboard
 * and the Projects dashboard. Said in words, so the colour is never the only
 * thing telling them apart. Banned is red; "Not read yet", when the app cannot
 * tell, is plain grey text rather than a status it does not have.
 */
export function AccountStatusBadge({ view }: { view: AccountStatusView }) {
  if (!view.status) {
    return <span className="text-xs whitespace-nowrap text-muted-foreground">Not read yet</span>
  }
  return (
    <Badge
      variant={
        view.status === "banned" ? "destructive" : view.status === "warming_up" ? "outline" : "secondary"
      }
      className="w-fit"
    >
      {accountStatusText(view)}
    </Badge>
  )
}
