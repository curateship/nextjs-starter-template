import * as React from "react"
import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import {
  TeamPageNoticeCard,
  TeamPageSettingsCard,
} from "@/components/pomodoro/team-page-settings"
import { TextLink } from "@/components/pomodoro/text-link"
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
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { plural } from "@/lib/format/plural"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { contentColumn } from "@/lib/pomodoro/content-column"
import {
  groupErrorMessage,
  groupInviteLink,
  MAX_GROUPS_PER_PERSON,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_NAME_LENGTH,
} from "@/lib/pomodoro/groups"
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]
type Board = Awaited<ReturnType<typeof loadFocusGroupBoard>>
type Member = Awaited<ReturnType<typeof loadFocusGroupMembers>>[number]

/**
 * The Groups dashboard, `/groups`: your private focus groups on a page of
 * their own (Tyler, 12 Oct 2026).
 *
 * Your groups are a list on the left, with Create and Join under them. The
 * group picked fills the right: its board over the window in the address, then
 * who is in it, the invite link and its public page, each a panel on the page.
 *
 * A board is the same ranking the Leaderboard uses, filtered to the group.
 * Appearing on it takes a public display name and nothing more, so a name
 * here never reaches the global board.
 */
export function GroupsPage({
  groupId,
  boardWindow,
  createRequested,
  onSelectGroup,
  onWindowChange,
  onCreateRequestClosed,
}: {
  /** The group in the address. The first group stands in when it is missing. */
  groupId?: string
  boardWindow: LeaderboardWindow
  /** The account menu's Create a group row asked for the window. */
  createRequested: boolean
  onSelectGroup: (groupId: string | undefined) => void
  onWindowChange: (window: LeaderboardWindow) => void
  onCreateRequestClosed: () => void
}) {
  const { known, authenticated } = useProductAuth()
  const [groups, setGroups] = React.useState<Group[] | null>(null)
  const [groupsFailed, setGroupsFailed] = React.useState(false)
  // Bumped by Try again, which runs that same load once more.
  const [groupsAttempt, setGroupsAttempt] = React.useState(0)
  const [creating, setCreating] = React.useState(false)
  const [joining, setJoining] = React.useState(false)

  const refreshGroups = React.useCallback(async () => {
    const mine = await loadMyGroups()
    setGroups(mine)
    return mine
  }, [])

  React.useEffect(() => {
    if (!known || !authenticated) return
    let cancelled = false
    void loadMyGroups()
      .then((mine) => {
        if (cancelled) return
        setGroupsFailed(false)
        setGroups(mine)
      })
      .catch(() => {
        // Never an empty list on a failure: that reads as "you are in no
        // groups" and invites somebody to make one they may already have.
        if (!cancelled) setGroupsFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [known, authenticated, groupsAttempt])

  // The group in view: the one in the address, or the first. A group just
  // left or deleted falls back rather than leaving an empty page.
  const selected =
    groups?.find((group) => group.id === groupId) ?? groups?.[0] ?? null
  const atLimit = (groups?.length ?? 0) >= MAX_GROUPS_PER_PERSON

  const createButtons = atLimit ? (
    <p className="text-xs text-muted-foreground">
      You are in {MAX_GROUPS_PER_PERSON} groups, which is the most one account
      may hold.
    </p>
  ) : (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setCreating(true)}>Create a group</Button>
      <Button variant="outline" onClick={() => setJoining(true)}>
        Join with a link
      </Button>
    </div>
  )

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header className="title-halo flex flex-col gap-2">
        <h2 className="text-4xl font-bold tracking-tight">Groups</h2>
        <p className="text-muted-foreground">
          Boards of just the people you invite. You do not have to be on the
          global leaderboard to be in a group.
        </p>
      </header>

      {!known ? (
        <LoadingRow label="Loading your groups" />
      ) : !authenticated ? (
        <PanelCard label="Your groups">
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Log in to make a group or join one with an invite link.
            </p>
            <SignInButton variant="default" />
          </div>
        </PanelCard>
      ) : groupsFailed ? (
        <PanelCard label="Your groups">
          <ErrorRow
            message="Your groups could not be loaded."
            onRetry={() => {
              dismissErrorToast()
              setGroupsFailed(false)
              setGroupsAttempt((count) => count + 1)
            }}
          />
        </PanelCard>
      ) : groups === null ? (
        <PanelCard label="Your groups">
          <LoadingRow label="Loading your groups" />
        </PanelCard>
      ) : groups.length === 0 || !selected ? (
        <PanelCard label="Your groups">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="max-w-md text-muted-foreground">
              A private group is a board of just the people you invite. Make
              one and share its link, or follow a link somebody sent you.
            </p>
            {createButtons}
          </div>
        </PanelCard>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <PanelCard label="Your groups">
            <ul className="flex flex-col gap-1">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    aria-current={group.id === selected.id ? "true" : undefined}
                    onClick={() => onSelectGroup(group.id)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-[rgba(var(--p-fg-rgb),0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      group.id === selected.id &&
                        "bg-[rgba(var(--p-fg-rgb),0.1)] font-semibold"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {group.memberCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {createButtons}
          </PanelCard>

          <GroupPanels
            // A fresh set of panels per group, so one group's members or
            // board never show under another's name.
            key={selected.id}
            group={selected}
            boardWindow={boardWindow}
            onWindowChange={onWindowChange}
            onChanged={refreshGroups}
            onGone={async () => {
              await refreshGroups()
              onSelectGroup(undefined)
            }}
          />
        </div>
      )}

      <CreateGroupDialog
        key={`create-${creating || createRequested}`}
        open={creating || createRequested}
        onOpenChange={(open) => {
          setCreating(open)
          if (!open && createRequested) onCreateRequestClosed()
        }}
        onCreated={async (newId) => {
          await refreshGroups()
          onSelectGroup(newId)
        }}
      />
      <JoinGroupDialog
        key={`join-${joining}`}
        open={joining}
        onOpenChange={setJoining}
        onJoined={async (joinedId) => {
          await refreshGroups()
          onSelectGroup(joinedId)
        }}
      />
    </div>
  )
}

/**
 * The right-hand side for one group: its name and the way out, its board,
 * who is in it, the invite link and the public page.
 *
 * The owner can replace the link, take people out, set up the public page and
 * delete the group. Everyone else can copy the link and leave. The owner
 * cannot leave, because a group with no owner has nobody who can kill a
 * leaked link.
 */
function GroupPanels({
  group,
  boardWindow,
  onWindowChange,
  onChanged,
  onGone,
}: {
  group: Group
  boardWindow: LeaderboardWindow
  onWindowChange: (window: LeaderboardWindow) => void
  onChanged: () => Promise<unknown>
  onGone: () => Promise<void>
}) {
  /**
   * The board with the window it was read for, so switching windows never
   * leaves the old figures under the new tab.
   */
  const [board, setBoard] = React.useState<{
    window: LeaderboardWindow
    result: Board | null
  } | null>(null)
  const [boardAttempt, setBoardAttempt] = React.useState(0)
  const [members, setMembers] = React.useState<Member[] | null>(null)
  const [membersFailed, setMembersFailed] = React.useState(false)
  const [membersAttempt, setMembersAttempt] = React.useState(0)
  const [copied, setCopied] = React.useState(false)
  // Cleared on the way out, so leaving inside the two seconds does not set
  // state on something that has gone.
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    },
    []
  )
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const [confirmingNewLink, setConfirmingNewLink] = React.useState(false)
  // The member the owner pressed the bin beside, until they confirm or back out.
  const [removing, setRemoving] = React.useState<Member | null>(null)
  const [run, busy] = useAsyncAction(groupErrorMessage)

  React.useEffect(() => {
    let cancelled = false
    void loadFocusGroupBoard(group.id, boardWindow, browserTimezone())
      .then((result) => {
        if (!cancelled) setBoard({ window: boardWindow, result })
      })
      .catch(() => {
        // `result: null` is the failure, recorded against this window only.
        if (!cancelled) setBoard({ window: boardWindow, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [group.id, boardWindow, boardAttempt])

  const refreshMembers = React.useCallback(async () => {
    setMembers(await loadFocusGroupMembers(group.id))
  }, [group.id])

  React.useEffect(() => {
    let cancelled = false
    void loadFocusGroupMembers(group.id)
      .then((loaded) => {
        if (cancelled) return
        setMembersFailed(false)
        setMembers(loaded)
      })
      .catch(() => {
        // A group always holds its owner, so an empty list here could only
        // ever be a failure pretending to be an answer.
        if (!cancelled) setMembersFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [group.id, membersAttempt])

  const shown = board?.window === boardWindow ? board : null
  const link = groupInviteLink(
    typeof globalThis.location === "undefined" ? "" : globalThis.location.origin,
    group.joinToken
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* The group's name and the way out sit inside its card, above the
          board (Tyler's mark-up of 12 Oct 2026,
          workspace/docs/assets/pasted-image-1791818740774117000.png). */}
      <PanelCard
        label={group.name}
        header={
          <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h3 className="min-w-0 break-words text-2xl font-bold tracking-tight">
              {group.name}
            </h3>
            <span className="text-sm text-muted-foreground">
              {group.memberCount}{" "}
              {plural(group.memberCount, "person", "people")}
            </span>
            {/* Where Delete group was, on Tyler's word of 12 Oct 2026. On a
                phone the tabs wrap under the name. */}
            <Tabs
              value={boardWindow}
              onValueChange={(value) =>
                onWindowChange(value as LeaderboardWindow)
              }
              className="ml-auto"
            >
              <TabsList aria-label="Board window" className={pillTabsList}>
                {LEADERBOARD_WINDOWS.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={option}
                    className={pillTabsTrigger}
                  >
                    {LEADERBOARD_WINDOW_LABELS[option]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </header>
        }
      >
        {shown === null ? (
          <LoadingRow label="Loading the board" />
        ) : shown.result === null ? (
          <ErrorRow
            message="That group's board could not be loaded."
            onRetry={() => {
              dismissErrorToast()
              setBoard(null)
              setBoardAttempt((count) => count + 1)
            }}
          />
        ) : shown.result.leaders.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nobody in this group has picked a public display name yet. Choose
            one in{" "}
            <TextLink to="/settings" search={{ tab: "profile" }}>
              Settings
            </TextLink>{" "}
            to appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <LeaderboardRows leaders={shown.result.leaders} />
          </div>
        )}
      </PanelCard>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <PanelCard label="Who is in it">
          {membersFailed ? (
            <ErrorRow
              message="The members could not be loaded."
              onRetry={() => {
                dismissErrorToast()
                setMembersFailed(false)
                setMembersAttempt((count) => count + 1)
              }}
            />
          ) : members === null ? (
            <LoadingRow label="Loading the members" />
          ) : (
            <div className="flex flex-col gap-1">
              {members.map((member) => (
                <div
                  key={member.membershipId}
                  className="flex min-h-9 items-center gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {member.name ?? "No display name yet"}
                    {member.isOwner ? (
                      <small className="ml-2 text-muted-foreground">owner</small>
                    ) : null}
                    {member.isYou && !member.isOwner ? (
                      <small className="ml-2 text-muted-foreground">you</small>
                    ) : null}
                  </span>
                  {group.isOwner && !member.isOwner ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Remove ${member.name ?? "this person"}`}
                      onClick={() => setRemoving(member)}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {members.some((member) => member.name === null) ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  Somebody with no display name is in the group but not on its
                  board. They pick one in Settings.
                </p>
              ) : null}
            </div>
          )}
          {/* The way out of the group sits under who is in it. The owner
              cannot leave, because a group with no owner has nobody who can
              kill a leaked link, so the owner deletes it instead. */}
          {group.isOwner ? (
            <Button
              variant="destructive"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete group
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => setConfirmingLeave(true)}
            >
              Leave group
            </Button>
          )}
        </PanelCard>

        <div className="flex min-w-0 flex-col gap-6">
          <PanelCard label="Invite link">
            <div className="grid gap-2">
              <Label htmlFor={`invite-${group.id}`}>Share this address</Label>
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
                    // A browser with no clipboard, or one that refused, must
                    // not be told the link was copied: the address is
                    // selectable in the box beside this.
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
                    copiedTimer.current = setTimeout(() => setCopied(false), 2_000)
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
            <p className="text-xs text-muted-foreground">
              Anybody with this link can join the group and see its board. Only
              display names show, never real names or email addresses.
            </p>
            {group.isOwner ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmingNewLink(true)}
                >
                  New link
                </Button>
                <span className="text-xs text-muted-foreground">
                  Replaces the link, so anybody still holding the old one cannot
                  join.
                </span>
              </div>
            ) : null}
          </PanelCard>

          {group.isOwner ? (
            <TeamPageSettingsCard groupId={group.id} onChanged={onChanged} />
          ) : group.teamHandle ? (
            <TeamPageNoticeCard teamHandle={group.teamHandle} />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${group.name}?`}
        description="The group, its board and its public page go, and its link stops working for everybody. Nobody's own focus history is touched."
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
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null)
        }}
        title={`Remove ${removing?.name ?? "this person"} from ${group.name}?`}
        description="They come off the group's board straight away. They can rejoin with the invite link."
        confirmLabel={`Remove ${removing?.name ?? "them"}`}
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!removing) return
            await removeFocusGroupMember(group.id, removing.membershipId)
            setRemoving(null)
            await refreshMembers()
            await onChanged()
          }, "Removed from the group.")
        }
      />
      <ConfirmDialog
        open={confirmingNewLink}
        onOpenChange={setConfirmingNewLink}
        title="Replace the invite link?"
        description="Anyone holding the old link can no longer join with it. People already in the group stay in."
        confirmLabel="Replace link"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            await resetFocusGroupInvite(group.id)
            setConfirmingNewLink(false)
            await onChanged()
          }, "New link made. The old one no longer works.")
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
    </div>
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
  // The parent remounts this window every time it opens, so the box starts
  // empty without an effect clearing it after the fact.
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
              Give it a name, then share its invite link with the people you
              want on the board. Only people who follow that link can see it.
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
 * People paste the whole address, so the last path piece is what a link
 * means. Somebody pasting the secret on its own is handled by the same line.
 * The server refuses anything that is not a link it made, so this only has
 * to be generous.
 */
function tokenFromLink(value: string) {
  const trimmed = value.trim().replace(/[?#].*$/, "").replace(/\/+$/, "")
  return trimmed.slice(trimmed.lastIndexOf("/") + 1)
}
