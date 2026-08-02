import * as React from "react"
import { EyeIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { announcementLevelBannerClassNames } from "@/lib/announcement"
import { getViewAsErrorMessage, stopViewingAsMember } from "@/lib/api/view-as"
import { showErrorToast } from "@/lib/error-toast"
import { cn } from "@/lib/utils"

/**
 * The strip that says whose screen you are looking at. It is on every page for
 * as long as the view lasts — an admin must never be able to forget they are
 * somebody else, because from here on every click is that person's.
 *
 * Like the announcement banner it is a plain `Card` rendered straight into
 * `DashboardContent`, so it sits on the content gutter and takes the
 * workspace's own card border, rounding and flat mode. It borrows that
 * banner's "heads-up" colours too, rather than keeping its own copy of them,
 * so retuning the warning look moves both at once.
 */
export function ViewAsBanner({
  member,
  admin,
}: {
  member: { name: string; email: string }
  admin: { name: string }
}) {
  const [leaving, setLeaving] = React.useState(false)

  async function exit() {
    setLeaving(true)
    try {
      await stopViewingAsMember()
      // A full load, not a router refresh: every loader on the page was fetched
      // as the member and has to be thrown away. Back to the list they came
      // from, as themselves.
      window.location.href = "/admin/users"
    } catch (error) {
      setLeaving(false)
      showErrorToast(getViewAsErrorMessage(error))
    }
  }

  return (
    <Card
      size="sm"
      role="region"
      aria-label={`Viewing the app as ${member.name}`}
      className={cn("shrink-0", announcementLevelBannerClassNames.warning)}
    >
      <CardContent className="flex items-start gap-2 text-sm">
        <EyeIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Viewing as {member.name}</strong>{" "}
          <span className="break-all">({member.email})</span>. Everything you do
          here is done as them. You are signed in as {admin.name}.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="-my-1 shrink-0 bg-transparent"
          disabled={leaving}
          onClick={() => void exit()}
        >
          {leaving ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : null}
          Stop viewing
        </Button>
      </CardContent>
    </Card>
  )
}
