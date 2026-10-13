import * as React from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { FlagIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { GroupReportDialog } from "@/components/pomodoro/group-report-dialog"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import {
  joinFocusGroup,
  lookupFocusGroupInvite,
} from "@/lib/api/pomodoro/groups"
import {
  loadPomodoroProfile,
  updatePomodoroProfile,
} from "@/lib/api/pomodoro/profile"
import {
  GROUP_JOIN_TOKEN_LENGTH,
  groupErrorMessage,
} from "@/lib/pomodoro/groups"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { showErrorToast } from "@/lib/toast/error-toast"

type Invite = Awaited<ReturnType<typeof lookupFocusGroupInvite>>

/**
 * The group invite page at `/groups/join/$token`.
 *
 * Joining a group needs an account, so a signed-out visitor is asked to sign in
 * and lands back here. Nothing about the group is shown before that: the link is
 * the only thing keeping strangers out, and a page that named the group to
 * anybody holding it would be a second, weaker door.
 */
export function GroupInvitePage() {
  const { known, authenticated } = useProductAuth()
  const { token } = useParams({ from: "/_pomodoro/groups_/join/$token" })
  const navigate = useNavigate()
  const [invite, setInvite] = React.useState<Invite | null>(null)
  const [failure, setFailure] = React.useState("")
  const [joining, setJoining] = React.useState(false)
  // The display name typed here by somebody who has none (part 9).
  const [displayName, setDisplayName] = React.useState("")
  const [reporting, setReporting] = React.useState(false)

  // An address of the wrong length is not a link this app ever made, so it is
  // refused without asking the server. Worked out from the address rather than
  // stored, so there is no state to get out of step with it.
  const badAddress = token.length !== GROUP_JOIN_TOKEN_LENGTH
  const problem = badAddress
    ? groupErrorMessage(new Error("GROUP_NOT_FOUND"))
    : failure

  React.useEffect(() => {
    if (!known || !authenticated || badAddress) return
    let cancelled = false
    void lookupFocusGroupInvite(token)
      .then((found) => {
        if (!cancelled) {
          setInvite(found)
          setFailure("")
        }
      })
      .catch((cause) => {
        if (!cancelled) setFailure(groupErrorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [known, authenticated, token, badAddress])

  /**
   * Saves a display name typed on this page, with every other profile
   * setting left as it was, so "Show me on the leaderboard" is never
   * switched on as a side effect.
   */
  const saveDisplayName = async (name: string) => {
    const profile = await loadPomodoroProfile(browserTimezone())
    await updatePomodoroProfile({
      publicDisplayName: name,
      timezone: profile.timezone,
      leaderboardOptIn: profile.leaderboardOptIn,
      shareTaskInRooms: profile.shareTaskInRooms,
    })
  }

  const join = async () => {
    setJoining(true)
    setFailure("")
    try {
      const typedName = displayName.trim()
      if (invite?.needsName && typedName) {
        try {
          await saveDisplayName(typedName)
        } catch {
          // The join still goes ahead; the name can be picked in Settings.
          showErrorToast("Your display name could not be saved. Pick one in Settings.")
        }
      }
      const result = await joinFocusGroup(token)
      if (result.status === "requested") {
        setInvite((shown) => (shown ? { ...shown, waiting: true } : shown))
        setJoining(false)
        return
      }
      // The same words the Join window says, and Groups opens on the group
      // just joined rather than the first one.
      toast.success("You are in the group.")
      void navigate({ to: "/groups", search: { group: result.id } })
    } catch (cause) {
      setFailure(groupErrorMessage(cause))
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-16">
      <Card>
        <CardContent
          className="flex flex-col items-start gap-3 py-8"
          aria-label="Group invite"
        >
          {!known ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking this invite…
            </p>
          ) : !authenticated ? (
            <>
              <h2 className="text-xl font-bold">Log in to join</h2>
              <p className="text-sm text-muted-foreground">
                A focus group is a board of the people in it, so joining needs an
                account. Log in and this link will still work.
              </p>
              <SignInButton size="default" variant="default" />
            </>
          ) : problem ? (
            <>
              <h2 className="text-xl font-bold">This invite did not work</h2>
              <p role="alert" className="text-sm text-muted-foreground">
                {problem}
              </p>
              <Button
                asChild
                variant="outline"
              >
                <Link to="/groups">Back to Groups</Link>
              </Button>
            </>
          ) : !invite ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking this invite…
            </p>
          ) : (
            <>
              <h2 className="break-words text-xl font-bold">{invite.name}</h2>
              {invite.description ? (
                <p className="break-words">{invite.description}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {invite.memberCount === 1
                  ? "1 person is in this group."
                  : `${invite.memberCount} people are in this group.`}{" "}
                Joining shows your display name on its board
                {invite.teamHandle ? "." : " and nowhere else."}
              </p>
              {invite.teamHandle ? (
                <p className="text-sm text-muted-foreground">
                  The group also has a public page at /team/{invite.teamHandle}.
                  You appear there only as your own public page already shows
                  you, and not by name at all if you have no public page.
                </p>
              ) : null}
              {invite.alreadyIn ? (
                <>
                  <p role="status" className="text-sm">
                    You are already in this group.
                  </p>
                  <Button asChild>
                    <Link to="/groups" search={{ group: invite.id }}>
                      Open it on Groups
                    </Link>
                  </Button>
                </>
              ) : invite.waiting ? (
                <p role="status" className="text-sm">
                  Your request is waiting for {invite.ownerName ?? "the owner"}{" "}
                  to let you in. You hear in the bell when they answer.
                </p>
              ) : invite.joinsPaused ? (
                <p role="status" className="text-sm">
                  {invite.name} isn&apos;t taking new people right now. Try the
                  link again later.
                </p>
              ) : (
                <>
                  {invite.needsName ? (
                    <div className="grid w-full gap-2">
                      <FieldLabel
                        htmlFor="group-invite-name"
                        hint="You can change it any time in Settings."
                      >
                        Your display name
                      </FieldLabel>
                      <Input
                        id="group-invite-name"
                        value={displayName}
                        maxLength={50}
                        placeholder="Sam"
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        You have no display name yet, so you would be in the
                        group but not on its board. The name shows on this
                        group&apos;s board and on any board you are on.
                      </p>
                    </div>
                  ) : null}
                  {invite.approveJoins ? (
                    <p className="text-sm text-muted-foreground">
                      {invite.ownerName ?? "The owner"} lets each person in, so
                      this sends a request.
                    </p>
                  ) : null}
                  <Button disabled={joining} onClick={() => void join()}>
                    {joining
                      ? invite.approveJoins
                        ? "Asking…"
                        : "Joining…"
                      : invite.approveJoins
                        ? "Ask to join"
                        : "Join this group"}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => setReporting(true)}
              >
                <FlagIcon aria-hidden="true" />
                Report this group
              </Button>
              <GroupReportDialog
                open={reporting}
                onOpenChange={setReporting}
                groupName={invite.name}
                target={{ token }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
