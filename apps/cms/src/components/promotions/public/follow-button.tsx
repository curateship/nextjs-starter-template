import * as React from "react"
import { BellIcon, BellRingIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { ListingFollowState } from "@/lib/api/directory/public"
import {
  followListing,
  getFollowErrorMessage,
} from "@/lib/api/promotions/follows"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Follow on a listing's page: an email when the listing publishes a new deal,
 * one a day at most. Following needs an account, so a signed-out visitor is
 * sent to sign in and brought back here.
 */
export function FollowButton({
  listingId,
  listingTitle,
  start,
}: {
  listingId: string
  listingTitle: string
  /** Read with the page, after its cache, so a reload shows the truth. */
  start: ListingFollowState
}) {
  const [following, setFollowing] = React.useState(start.following)
  const [busy, setBusy] = React.useState(false)

  async function toggle() {
    if (!start.signedIn) {
      const back = `${window.location.pathname}${window.location.search}`
      window.location.assign(`/login?redirect=${encodeURIComponent(back)}`)
      return
    }
    dismissErrorToast()
    setBusy(true)
    try {
      const answer = await followListing({ listingId, following: !following })
      if (!answer.done) {
        showErrorToast(answer.problem)
        return
      }
      setFollowing(answer.following)
      toast.success(
        answer.following
          ? `You will get an email when ${listingTitle} posts a new deal.`
          : `You no longer follow ${listingTitle}.`
      )
    } catch (error) {
      showErrorToast(getFollowErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const Icon = busy ? Loader2Icon : following ? BellRingIcon : BellIcon
  return (
    <Button
      type="button"
      variant={following ? "secondary" : "outline"}
      aria-pressed={following}
      disabled={busy}
      onClick={() => void toggle()}
      className="w-fit"
    >
      <Icon className={busy ? "animate-spin" : undefined} aria-hidden="true" />
      {following ? "Following" : "Follow for deals"}
    </Button>
  )
}
