import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon, UserCheckIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CopyDialog } from "@/components/social/copy-dialog"
import { Button } from "@/components/ui/button"
import {
  getCopyErrorMessage,
  setFollowing,
} from "@/lib/api/trade/copy-trading"
import { OWN_PROFILE, type ViewerRelation } from "@/lib/trade/copy/copy-rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Follow and Copy on a public profile. A visitor who is not signed in gets a
 * sign-in link instead; the page itself stays open to everybody.
 */
export function ProfileFollowCopy({
  handle,
  relation,
}: {
  handle: string
  /** Null for a visitor who is not signed in. */
  relation: ViewerRelation | null
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [copying, setCopying] = React.useState(false)

  if (!relation) {
    return (
      <div className="flex">
        <Button asChild size="sm" variant="outline">
          <Link to="/login" search={{ redirect: `/t/${handle}` }}>
            Sign in to follow or copy
          </Link>
        </Button>
      </div>
    )
  }

  // The owner sees the same buttons visitors see, so they know what their
  // page offers. Pressing one on your own profile says why it does nothing.
  const own = relation.notCopyable === OWN_PROFILE
  const ownWords =
    "This is your own profile. Other members see these buttons here and can follow or copy you."

  async function toggleFollow() {
    if (!relation) return
    if (own) {
      showErrorToast(ownWords)
      return
    }
    setBusy(true)
    try {
      await setFollowing(handle, !relation.following)
      await router.invalidate()
      toast.success(
        relation.following
          ? `You stopped following @${handle}.`
          : `Following @${handle}. You get a notice when they close a trade.`
      )
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void toggleFollow()}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : relation.following ? (
          <UserCheckIcon className="size-4" />
        ) : (
          <UserPlusIcon className="size-4" />
        )}
        {relation.following ? "Following" : "Follow"}
      </Button>
      {relation.copy ? (
        <Button asChild size="sm">
          <Link to="/following">
            <CopyIcon className="size-4" />
            {relation.copy.status === "paused" ? "Copy paused" : "Copying"}
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            // Never greyed out: a press on a trader who cannot be copied yet
            // says why instead.
            if (relation.notCopyable) {
              showErrorToast(own ? ownWords : relation.notCopyable)
              return
            }
            setCopying(true)
          }}
        >
          <CopyIcon className="size-4" />
          Copy
        </Button>
      )}
      <CopyDialog
        open={copying}
        handle={handle}
        relation={relation}
        copy={null}
        onClose={() => setCopying(false)}
        onSaved={() => router.invalidate()}
      />
    </div>
  )
}
