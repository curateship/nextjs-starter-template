import * as React from "react"
import { Link } from "@tanstack/react-router"
import { FlagIcon, ShieldOffIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  blockProfile,
  followProfile,
  loadIsFollowing,
  sendCheer,
  unfollowProfile,
} from "@/lib/api/pomodoro/following"
import { reportProfile } from "@/lib/api/pomodoro/profile-reports"
import { CHEERS, cheerErrorMessage } from "@/lib/pomodoro/cheers"
import { followErrorMessage } from "@/lib/pomodoro/following"
import {
  PROFILE_REPORT_REASONS,
  PROFILE_REPORT_RATE_LIMITED,
  PROFILE_REPORT_THANKS,
  type ProfileReportReasonId,
} from "@/lib/pomodoro/profile-reports"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The row of actions on somebody else's profile: Follow, a cheer, Report and
 * Block.
 *
 * Report is the only one a signed-out reader can use, because the page is
 * public and most of its readers have no account. Everything else needs one,
 * and a signed-out visitor is offered sign-in rather than a dead button.
 *
 * None of these ever says whether a block exists. A cheer to somebody who has
 * blocked you reports success, and a block itself reports success whether or
 * not the handle was real.
 */
export function ProfileActions({
  handle,
  name,
  isOwner,
}: {
  handle: string
  name: string
  /** Your own page shows no actions; you cannot follow or block yourself. */
  isOwner: boolean
}) {
  const { known, authenticated } = useProductAuth()
  const [following, setFollowing] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [reportOpen, setReportOpen] = React.useState(false)
  const [blockOpen, setBlockOpen] = React.useState(false)

  React.useEffect(() => {
    if (!authenticated || isOwner) return
    let cancelled = false
    void loadIsFollowing(handle)
      .then((result) => {
        if (!cancelled) setFollowing(result)
      })
      // A failed read leaves the button saying Follow, which is the honest
      // default: pressing it is idempotent, so a wrong guess costs nothing.
      .catch(() => {
        if (!cancelled) setFollowing(false)
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, handle, isOwner])

  if (isOwner) return null

  const toggleFollow = async () => {
    setBusy(true)
    try {
      const next = following
        ? await unfollowProfile(handle)
        : await followProfile(handle)
      setFollowing(next.following)
    } catch (cause) {
      showErrorToast(followErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const cheer = async (cheerId: string) => {
    setBusy(true)
    try {
      await sendCheer(handle, cheerId)
      toast.success(`Sent to ${name}.`)
    } catch (cause) {
      showErrorToast(cheerErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {authenticated ? (
        <>
          <Button
            variant={following ? "outline" : "default"}
            disabled={busy || !known}
            onClick={() => void toggleFollow()}
          >
            {following ? "Following" : "Follow"}
          </Button>
          {/* Cheers are only for people you follow, so the picker appears
              with the follow rather than beside it. */}
          {following ? (
            <Select onValueChange={(value) => void cheer(value)}>
              <SelectTrigger className="w-44" aria-label={`Cheer ${name} on`}>
                <SelectValue placeholder="Send a cheer" />
              </SelectTrigger>
              <SelectContent>
                {CHEERS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </>
      ) : known ? (
        <Button asChild variant="outline">
          <Link to="/login" search={{ redirect: `/u/${handle}` }}>
            Sign in to follow
          </Link>
        </Button>
      ) : null}

      <Button variant="ghost" onClick={() => setReportOpen(true)}>
        <FlagIcon aria-hidden="true" />
        Report
      </Button>
      {authenticated ? (
        <Button variant="ghost" onClick={() => setBlockOpen(true)}>
          <ShieldOffIcon aria-hidden="true" />
          Block
        </Button>
      ) : null}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        handle={handle}
        name={name}
      />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        handle={handle}
        name={name}
        onBlocked={() => setFollowing(false)}
      />
    </div>
  )
}

function ReportDialog({
  open,
  onOpenChange,
  handle,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  handle: string
  name: string
}) {
  const [reason, setReason] = React.useState<ProfileReportReasonId>("picture")
  const [sending, setSending] = React.useState(false)

  const send = async () => {
    setSending(true)
    try {
      await reportProfile(handle, reason)
      // The same thanks whatever happened on the server, so nothing here can
      // tell a reader that a handle exists or that they have reported before.
      toast.success(PROFILE_REPORT_THANKS)
      onOpenChange(false)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("RATE_LIMITED")
          ? PROFILE_REPORT_RATE_LIMITED
          : "That report could not be sent. Try again."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Report {name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-report-reason">What is wrong?</Label>
            <Select
              value={reason}
              onValueChange={(value) =>
                setReason(value as ProfileReportReasonId)
              }
            >
              <SelectTrigger id="profile-report-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_REPORT_REASONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            An operator reads every report. You do not need an account to send
            one.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlockDialog({
  open,
  onOpenChange,
  handle,
  name,
  onBlocked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  handle: string
  name: string
  onBlocked: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  const block = async () => {
    setBusy(true)
    try {
      await blockProfile(handle)
      onBlocked()
      toast.success(`${name} is blocked.`)
      onOpenChange(false)
    } catch {
      showErrorToast("That block could not be saved. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Block {name}?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            You will not see each other anywhere in the app: not on any board,
            not in a room, and neither of you can open the other&rsquo;s page.
            Any follow between you is removed. They are told nothing. You can
            undo this in Settings.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void block()}
          >
            {busy ? "Blocking…" : `Block ${name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
