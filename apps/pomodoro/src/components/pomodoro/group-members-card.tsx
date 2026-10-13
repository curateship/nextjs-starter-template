import * as React from "react"
import { Link } from "@tanstack/react-router"
import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { WindowQuestion } from "@/components/pomodoro/group-window-question"
import { PanelCard } from "@/components/pomodoro/panel-card"
import {
  answerFocusGroupRequest,
  handOverFocusGroup,
  letFocusGroupBanBackIn,
  loadFocusGroupKeptOut,
  loadFocusGroupMembers,
  loadFocusGroupRequests,
  removeFocusGroupMember,
  type loadMyGroups,
} from "@/lib/api/pomodoro/groups"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { groupErrorMessage } from "@/lib/pomodoro/groups"
import { dismissErrorToast } from "@/lib/toast/error-toast"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]
type Member = Awaited<ReturnType<typeof loadFocusGroupMembers>>[number]
type Request = Awaited<ReturnType<typeof loadFocusGroupRequests>>[number]
type KeptOut = Awaited<ReturnType<typeof loadFocusGroupKeptOut>>[number]

/**
 * One of the group's lists, read on arrival and again whenever `version`
 * moves, with its own failure and Try again. `enabled` false reads nothing,
 * for the owner's lists on a member's page.
 */
function useGroupList<T>(
  load: (groupId: string) => Promise<T>,
  groupId: string,
  enabled: boolean,
  version: string | number
) {
  const [value, setValue] = React.useState<T | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void load(groupId)
      .then((loaded) => {
        if (cancelled) return
        setFailed(false)
        setValue(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [load, groupId, enabled, version, attempt])
  const retry = () => {
    dismissErrorToast()
    setFailed(false)
    setAttempt((count) => count + 1)
  }
  return { value, failed, retry, refresh: () => setAttempt((count) => count + 1) }
}

/**
 * Who is in a group, for a member: the same list as the owner's, and the way
 * out at the foot. The owner's copy, with its tools, is inside Edit group
 * (Tyler, 13 Oct 2026).
 */
export function GroupMembersCard({
  group,
  onLeave,
  busy,
}: {
  group: Group
  onLeave: () => void
  busy: boolean
}) {
  return (
    <PanelCard label="Who is in it">
      <GroupMembersList group={group} onChanged={async () => undefined} />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={busy}
        onClick={onLeave}
      >
        Leave group
      </Button>
    </PanelCard>
  )
}

/**
 * Who is in a group (groups task 01, parts 2, 3, 6 and 13): when each person
 * joined, and a link to their public page when they have one switched on.
 * With `ask`, which only the owner's Edit group window passes, it also has
 * the owner's tools: a menu per person with Make owner and Remove, the
 * people waiting to be let in, and the people kept out.
 *
 * Make owner and Remove ask first, through `ask`, so the question takes the
 * window's place instead of opening a second window on top of it.
 */
export function GroupMembersList({
  group,
  onChanged,
  ask,
}: {
  group: Group
  /** Refreshes the groups list: the count, the owner, the waiting number. */
  onChanged: () => Promise<unknown>
  ask?: (question: WindowQuestion) => void
}) {
  const owner = group.isOwner && Boolean(ask)
  // Read again when the count, the owner or the waiting number changes, so
  // a join elsewhere or a hand-over shows without a reload.
  const version = `${group.memberCount}:${group.isOwner}:${group.waitingCount}`
  const members = useGroupList(loadFocusGroupMembers, group.id, true, version)
  const requests = useGroupList(loadFocusGroupRequests, group.id, owner, version)
  const keptOut = useGroupList(loadFocusGroupKeptOut, group.id, owner, version)
  const [run, busy] = useAsyncAction(groupErrorMessage)

  const refreshAll = async () => {
    members.refresh()
    requests.refresh()
    keptOut.refresh()
    await onChanged()
  }

  const memberName = (member: { name: string | null }) =>
    member.name ?? "this person"

  const askRemove = (member: Member) =>
    ask?.({
      title: `Remove ${memberName(member)} from ${group.name}?`,
      description:
        "They come off the group's board straight away. They can rejoin with the invite link.",
      option: {
        label: "Don't let them back in with the link",
        descriptionWhenTicked:
          "They come off the group's board straight away, and the invite link will not let them back in until you let them.",
      },
      confirmLabel: `Remove ${member.name ?? "them"}`,
      onConfirm: (keepOut) =>
        run(async () => {
          await removeFocusGroupMember(group.id, member.membershipId, keepOut)
          await refreshAll()
        }, keepOut ? "Removed and kept out." : "Removed from the group."),
    })

  const askHandOver = (member: Member) =>
    ask?.({
      title: `Hand ${group.name} to ${memberName(member)}?`,
      description: [
        `${memberName(member)} becomes the owner, who can remove people, replace the link and delete the group. You become an ordinary member and can leave.`,
        group.teamHandle
          ? "The group's public page stays up only while the new owner is on Pro."
          : null,
        group.ownerHasWeeklyRoom
          ? "The weekly group room you booked stays yours."
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: `Make ${member.name ?? "them"} owner`,
      destructive: false,
      onConfirm: () =>
        run(async () => {
          await handOverFocusGroup(group.id, member.membershipId)
          await onChanged()
        }, `${memberName(member)} owns the group now.`),
    })

  return (
    <div className="flex flex-col gap-4">
      {members.failed ? (
        <ErrorRow message="The members could not be loaded." onRetry={members.retry} />
      ) : members.value === null ? (
        <LoadingRow label="Loading the members" />
      ) : (
        <div className="flex flex-col gap-1">
          {members.value.map((member) => (
            <div key={member.membershipId} className="flex min-h-10 items-center gap-2 text-sm">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="min-w-0 truncate">
                  {member.name && member.handle ? (
                    <Link
                      to="/u/$handle"
                      params={{ handle: member.handle }}
                      className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {member.name}
                    </Link>
                  ) : (
                    (member.name ?? "No display name yet")
                  )}
                  {member.isOwner ? (
                    <small className="ml-2 text-muted-foreground">owner</small>
                  ) : null}
                  {member.isYou && !member.isOwner ? (
                    <small className="ml-2 text-muted-foreground">you</small>
                  ) : null}
                </span>
                <small className="text-xs text-muted-foreground">
                  Joined {formatDate(member.joinedAt)}
                </small>
              </span>
              {owner && !member.isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Choices for ${memberName(member)}`}
                    >
                      <MoreHorizontalIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => askHandOver(member)}>
                      Make owner
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => askRemove(member)}
                    >
                      Remove from the group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ))}
          {members.value.some((member) => member.name === null) ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Somebody with no display name is in the group but not on its
              board. They pick one in Settings.
            </p>
          ) : null}
        </div>
      )}

      {owner && (requests.failed || (requests.value?.length ?? 0) > 0) ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Waiting to join</h4>
          {requests.failed ? (
            <ErrorRow message="The people waiting could not be loaded." onRetry={requests.retry} />
          ) : (
            requests.value?.map((request: Request) => (
              <div key={request.requestId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {request.name}
                  <small className="ml-2 text-xs text-muted-foreground">
                    asked {formatDate(request.createdAt)}
                  </small>
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await answerFocusGroupRequest(group.id, request.requestId, true)
                      await refreshAll()
                    }, `${request.name} is in the group.`)
                  }
                >
                  Let in
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await answerFocusGroupRequest(group.id, request.requestId, false)
                      await refreshAll()
                    }, "Request turned down.")
                  }
                >
                  Turn down
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {owner && (keptOut.failed || (keptOut.value?.length ?? 0) > 0) ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Kept out</h4>
          <p className="text-xs text-muted-foreground">
            The invite link does not let these people back in.
          </p>
          {keptOut.failed ? (
            <ErrorRow message="The people kept out could not be loaded." onRetry={keptOut.retry} />
          ) : (
            keptOut.value?.map((person: KeptOut) => (
              <div key={person.banId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await letFocusGroupBanBackIn(group.id, person.banId)
                      keptOut.refresh()
                    }, `${person.name} can join with the link again.`)
                  }
                >
                  Let back in
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
