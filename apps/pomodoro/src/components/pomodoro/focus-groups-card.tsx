import * as React from "react"
import { CheckIcon, CopyIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import {
  createFocusGroup,
  deleteFocusGroup,
  joinFocusGroup,
  leaveFocusGroup,
  loadFocusGroupBoard,
  loadFocusGroupMembers,
  loadMyGroups,
  removeFocusGroupMember,
  resetFocusGroupInvite,
} from "@/lib/api/pomodoro/groups"
import {
  groupErrorMessage,
  groupInviteLink,
  MAX_GROUPS_PER_PERSON,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_NAME_LENGTH,
} from "@/lib/pomodoro/groups"
import {
  LEADERBOARD_WINDOW_NOTES,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]
type Board = Awaited<ReturnType<typeof loadFocusGroupBoard>>
type Member = Awaited<ReturnType<typeof loadFocusGroupMembers>>[number]

/**
 * Private focus groups on the leaderboard page: the group you are looking at,
 * its board, and the window that makes a group.
 *
 * The board is the same ranking the global one is, over whatever window the page
 * has selected, filtered to this group's members. Appearing on it takes a public
 * display name and nothing more: being in a group is a separate thing from being
 * on the global board, so a name here never reaches that one.
 *
 * Somebody in no group sees an invitation to make one and nothing else, which is
 * what keeps the page as it was for everyone who does not want this.
 */
export function FocusGroupsCard({
  boardWindow,
}: {
  boardWindow: LeaderboardWindow
}) {
  const [groups, setGroups] = React.useState<Group[] | null>(null)
  const [groupsFailed, setGroupsFailed] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState("")
  /**
   * The board, with the group and window it belongs to. Kept together so a board
   * is only ever drawn beside the group it was read for: on a switch the old
   * figures would otherwise sit under the new group's name for a moment.
   */
  const [board, setBoard] = React.useState<{
    groupId: string
    window: LeaderboardWindow
    result: Board | null
  } | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [joining, setJoining] = React.useState(false)
  const [managing, setManaging] = React.useState(false)

  const refreshGroups = React.useCallback(async () => {
    const mine = await loadMyGroups()
    setGroups(mine)
    return mine
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void loadMyGroups()
      .then((mine) => {
        if (!cancelled) setGroups(mine)
      })
      .catch(() => {
        // Never an empty list on a failure: that reads as "you are in no
        // groups" and invites somebody to make one they may already have.
        if (!cancelled) setGroupsFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The group in view: whatever was picked, or the first one. A group that was
  // just left or deleted falls back rather than leaving an empty board.
  const selected =
    groups?.find((group) => group.id === selectedId) ?? groups?.[0] ?? null

  const selectedId_ = selected?.id
  React.useEffect(() => {
    if (!selectedId_) return
    let cancelled = false
    void loadFocusGroupBoard(selectedId_, boardWindow, browserTimezone())
      .then((result) => {
        if (!cancelled)
          setBoard({ groupId: selectedId_, window: boardWindow, result })
      })
      .catch(() => {
        // `result: null` is the failure. The group and window are still recorded,
        // so the message replaces that board rather than every board.
        if (!cancelled)
          setBoard({ groupId: selectedId_, window: boardWindow, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [selectedId_, boardWindow])

  // Only the board that was read for the group and window now on screen.
  const shown =
    board && board.groupId === selected?.id && board.window === boardWindow
      ? board
      : null

  const atLimit = (groups?.length ?? 0) >= MAX_GROUPS_PER_PERSON

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Your groups</CardTitle>
        <span className="text-xs text-muted-foreground">
          {LEADERBOARD_WINDOW_NOTES[boardWindow]}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groupsFailed ? (
          <p role="alert" className="py-2 text-sm text-destructive">
            Your groups could not be loaded. Reload to try again.
          </p>
        ) : groups === null ? (
          <LoadingRow label="Loading your groups" />
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-sm text-muted-foreground">
              A private group is a board of just the people you invite. Make one
              and share its link, or follow a link somebody sent you. You do not
              have to be on the global board to be in a group.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-full font-bold"
                onClick={() => setCreating(true)}
              >
                Create a group
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full font-bold"
                onClick={() => setJoining(true)}
              >
                Join with a link
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={selected?.id ?? ""}
                onValueChange={(value) => setSelectedId(value)}
              >
                <TabsList aria-label="Your groups">
                  {groups.map((group) => (
                    <TabsTrigger key={group.id} value={group.id}>
                      {group.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selected?.memberCount === 1
                    ? "1 person"
                    : `${selected?.memberCount ?? 0} people`}
                </span>
                {/* Icon-only outside a repeated row, so it carries a tooltip
                    as well as its name. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Manage ${selected?.name ?? "group"}`}
                      onClick={() => setManaging(true)}
                    >
                      <SettingsIcon aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    The invite link, who is in it, and the way out
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {shown === null ? (
              <LoadingRow label="Loading the board" />
            ) : shown.result === null ? (
              <p role="alert" className="py-2 text-sm text-destructive">
                That group's board could not be loaded. Reload to try again.
              </p>
            ) : shown.result.leaders.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nobody in this group has picked a public display name yet. Choose
                one in Settings to appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <LeaderboardRows leaders={shown.result.leaders} />
              </div>
            )}

            {atLimit ? (
              <p className="text-xs text-muted-foreground">
                You are in {MAX_GROUPS_PER_PERSON} groups, which is the most one
                account may hold.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full font-bold"
                  onClick={() => setCreating(true)}
                >
                  Create a group
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full font-bold"
                  onClick={() => setJoining(true)}
                >
                  Join with a link
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>

      <CreateGroupDialog
        key={`create-${creating}`}
        open={creating}
        onOpenChange={setCreating}
        onCreated={async (groupId) => {
          await refreshGroups()
          setSelectedId(groupId)
        }}
      />
      <JoinGroupDialog
        key={`join-${joining}`}
        open={joining}
        onOpenChange={setJoining}
        onJoined={async (groupId) => {
          await refreshGroups()
          setSelectedId(groupId)
        }}
      />
      {selected ? (
        <ManageGroupDialog
          key={selected.id}
          group={selected}
          open={managing}
          onOpenChange={setManaging}
          onChanged={refreshGroups}
          onGone={async () => {
            setManaging(false)
            const mine = await refreshGroups()
            setSelectedId(mine[0]?.id ?? "")
          }}
        />
      ) : null}
    </Card>
  )
}

/** Making a group. Its owner is put in it, so the board is never empty. */
function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (groupId: string) => Promise<void>
}) {
  // The parent remounts this window every time it opens, so the box starts empty
  // without an effect clearing it after the fact.
  const [name, setName] = React.useState("")
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const tooShort = name.trim().length < MIN_GROUP_NAME_LENGTH

  return (
    <FormDialog
      open={open}
      dirty={name.trim().length > 0}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Create a group</DialogTitle>
            <DialogDescription>
              Give it a name, then share its invite link with the people you want
              on the board. Only people who follow that link can see it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="new-group-name">Group name</Label>
                  <Input
                    id="new-group-name"
                    value={name}
                    maxLength={MAX_GROUP_NAME_LENGTH}
                    aria-invalid={name.length > 0 && tooShort}
                    placeholder="Morning crew"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                // The button stays live and says what is wrong, rather than
                // going dead and leaving somebody clicking at nothing.
                if (tooShort) {
                  showErrorToast(
                    `A group's name needs at least ${MIN_GROUP_NAME_LENGTH} characters.`
                  )
                  return
                }
                const created = await run(async () => {
                  const { groupId } = await createFocusGroup(name.trim())
                  await onCreated(groupId)
                }, "Group created.")
                if (created) onOpenChange(false)
              }}
            >
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** Following an invite link somebody pasted in. */
function JoinGroupDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoined: (groupId: string) => Promise<void>
}) {
  // Remounted on every open by the parent, so the box starts empty.
  const [link, setLink] = React.useState("")
  const [run, busy] = useAsyncAction(groupErrorMessage)

  return (
    <FormDialog
      open={open}
      dirty={link.trim().length > 0}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Join a group</DialogTitle>
            <DialogDescription>
              Paste the invite link you were sent. Joining shows your display
              name to that group only.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="join-group-link">Invite link</Label>
                  <Input
                    id="join-group-link"
                    value={link}
                    placeholder="https://…/groups/join/…"
                    onChange={(event) => setLink(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const joined = await run(async () => {
                  const { id } = await joinFocusGroup(tokenFromLink(link))
                  await onJoined(id)
                }, "You are in the group.")
                if (joined) onOpenChange(false)
              }}
            >
              Join group
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The secret out of a pasted invite link.
 *
 * People paste the whole address, so the last path piece is what a link means.
 * Somebody pasting the secret on its own is handled by the same line. The server
 * refuses anything that is not a link it made, so this only has to be generous.
 */
function tokenFromLink(value: string) {
  const trimmed = value.trim().replace(/[?#].*$/, "").replace(/\/+$/, "")
  return trimmed.slice(trimmed.lastIndexOf("/") + 1)
}

/**
 * The group's own window: its invite link, who is in it, and the way out.
 *
 * The owner can replace the link, take people out and delete the group. Everyone
 * else can copy the link and leave. The owner cannot leave, because a group with
 * no owner has nobody who can kill a leaked link.
 */
function ManageGroupDialog({
  group,
  open,
  onOpenChange,
  onChanged,
  onGone,
}: {
  group: Group
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<unknown>
  onGone: () => Promise<void>
}) {
  const [members, setMembers] = React.useState<Member[] | null>(null)
  const [membersFailed, setMembersFailed] = React.useState(false)
  const [token, setToken] = React.useState(group.joinToken)
  const [copied, setCopied] = React.useState(false)
  // Cleared on the way out, so a window closed inside the two seconds does not
  // set state on something that has gone.
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    },
    []
  )
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const [run, busy] = useAsyncAction(groupErrorMessage)

  const refreshMembers = React.useCallback(async () => {
    setMembers(await loadFocusGroupMembers(group.id))
  }, [group.id])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadFocusGroupMembers(group.id)
      .then((loaded) => {
        if (!cancelled) setMembers(loaded)
      })
      .catch(() => {
        // A group always holds its owner, so an empty list here could only ever
        // be a failure pretending to be an answer.
        if (!cancelled) setMembersFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [group.id, open])

  const link = groupInviteLink(
    typeof globalThis.location === "undefined"
      ? ""
      : globalThis.location.origin,
    token
  )

  return (
    <>
      <FormDialog
        open={open}
        dirty={false}
        busy={busy}
        onClose={() => onOpenChange(false)}
      >
        {() => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>{group.name}</DialogTitle>
              <DialogDescription>
                Anybody with this link can join the group and see its board. Only
                display names show, never real names or email addresses.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="grid gap-6">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Invite link</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor={`invite-${group.id}`}>
                        Share this address
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`invite-${group.id}`}
                          readOnly
                          value={link}
                          onFocus={(event) => event.target.select()}
                        />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            // A browser with no clipboard, or one that refused,
                            // must not be told the link was copied: the address
                            // is selectable in the box beside this.
                            try {
                              await navigator.clipboard.writeText(link)
                            } catch {
                              showErrorToast(
                                "The link could not be copied. Select it in the box and copy it by hand."
                              )
                              return
                            }
                            setCopied(true)
                            if (copiedTimer.current !== null)
                              clearTimeout(copiedTimer.current)
                            copiedTimer.current = setTimeout(
                              () => setCopied(false),
                              2_000
                            )
                          }}
                        >
                          {copied ? (
                            <CheckIcon aria-hidden="true" />
                          ) : (
                            <CopyIcon aria-hidden="true" />
                          )}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>
                    {group.isOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const { joinToken } =
                                await resetFocusGroupInvite(group.id)
                              setToken(joinToken)
                              await onChanged()
                            }, "New link made. The old one no longer works.")
                          }
                        >
                          New link
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Replaces the link, so anybody still holding the old one
                          cannot join.
                        </span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Who is in it</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {membersFailed ? (
                      <p role="alert" className="text-sm text-destructive">
                        The members could not be loaded. Close this and open it
                        again to retry.
                      </p>
                    ) : members === null ? (
                      <LoadingRow label="Loading the members" />
                    ) : (
                      members.map((member) => (
                        <div
                          key={member.membershipId}
                          className="flex min-h-9 items-center gap-2 text-sm"
                        >
                          <span className="flex-1 truncate">
                            {member.name ?? "No display name yet"}
                            {member.isOwner ? (
                              <small className="ml-2 text-muted-foreground">
                                owner
                              </small>
                            ) : null}
                            {member.isYou && !member.isOwner ? (
                              <small className="ml-2 text-muted-foreground">
                                you
                              </small>
                            ) : null}
                          </span>
                          {group.isOwner && !member.isOwner ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`Remove ${member.name ?? "this person"}`}
                              onClick={() =>
                                void run(async () => {
                                  await removeFocusGroupMember(
                                    group.id,
                                    member.membershipId
                                  )
                                  await refreshMembers()
                                  await onChanged()
                                }, "Removed from the group.")
                              }
                            >
                              <Trash2Icon aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                    {members?.some((member) => member.name === null) ? (
                      <p className="text-xs text-muted-foreground">
                        Somebody with no display name is in the group but not on
                        its board. They pick one in Settings.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              {group.isOwner ? (
                <Button
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete group
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => setConfirmingLeave(true)}
                >
                  Leave group
                </Button>
              )}
              <Button disabled={busy} onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${group.name}?`}
        description="The group and its board go, and its link stops working for everybody. Nobody's own focus history is touched."
        confirmLabel="Delete group"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            await deleteFocusGroup(group.id)
            setConfirmingDelete(false)
            await onGone()
          }, "Group deleted.")
        }
      />
      <ConfirmDialog
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        title={`Leave ${group.name}?`}
        description="You come off its board straight away. You can join again with the same link if you still have it."
        confirmLabel="Leave group"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            await leaveFocusGroup(group.id)
            setConfirmingLeave(false)
            await onGone()
          }, "You left the group.")
        }
      />
    </>
  )
}
