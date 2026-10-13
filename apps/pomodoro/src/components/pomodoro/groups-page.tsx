import * as React from "react"
import {
  Loader2Icon,
  PartyPopperIcon,
  SettingsIcon,
} from "lucide-react"

import { toast } from "sonner"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
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
import { GroupEditDialog } from "@/components/pomodoro/group-edit-dialog"
import { InvitePeopleButton } from "@/components/pomodoro/group-invite-people"
import { GroupMembersCard } from "@/components/pomodoro/group-members-card"
import {
  GroupActivityCard,
  GroupStanding,
  PastWeeksCard,
} from "@/components/pomodoro/group-score-panels"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { TeamPageNoticeCard } from "@/components/pomodoro/team-page-settings"
import { TextLink } from "@/components/pomodoro/text-link"
import {
  acceptFocusGroupInvite,
  cheerFocusGroupMember,
  createFocusGroup,
  declineFocusGroupInvite,
  joinFocusGroup,
  leaveFocusGroup,
  loadFocusGroupBoard,
  loadMyFocusGroupInvites,
  loadMyGroups,
} from "@/lib/api/pomodoro/groups"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { plural } from "@/lib/format/plural"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { CHEERS, cheerErrorMessage } from "@/lib/pomodoro/cheers"
import { contentColumn } from "@/lib/pomodoro/content-column"
import {
  GROUP_BOARD_ORDERS,
  GROUP_BOARD_ORDER_LABELS,
  groupErrorMessage,
  MAX_GROUPS_PER_PERSON,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_NAME_LENGTH,
  type GroupBoardOrder,
} from "@/lib/pomodoro/groups"
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]
type Board = Awaited<ReturnType<typeof loadFocusGroupBoard>>
type Invite = Awaited<ReturnType<typeof loadMyFocusGroupInvites>>[number]

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
  boardOrder,
  createRequested,
  onSelectGroup,
  onWindowChange,
  onOrderChange,
  onCreateRequestClosed,
}: {
  /** The group in the address. The first group stands in when it is missing. */
  groupId?: string
  boardWindow: LeaderboardWindow
  boardOrder: GroupBoardOrder
  /** The account menu's Create a group row asked for the window. */
  createRequested: boolean
  onSelectGroup: (groupId: string | undefined) => void
  onWindowChange: (window: LeaderboardWindow) => void
  onOrderChange: (order: GroupBoardOrder) => void
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

      {known && authenticated ? (
        <GroupInvitesPanel
          onJoined={async (joinedId) => {
            await refreshGroups()
            onSelectGroup(joinedId)
          }}
        />
      ) : null}

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
            boardOrder={boardOrder}
            onWindowChange={onWindowChange}
            onOrderChange={onOrderChange}
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
 * The right-hand side for one group: its card with the name, the line under
 * it, the streak, the weekly goal and the board; then who is in it, the
 * invite link, the public page, past weeks and, for the owner, the activity.
 *
 * The owner runs the group: settings, the link's switches, who is in it,
 * handing it on and deleting it. Everyone else can copy the link, invite
 * people they follow, cheer from the board and leave.
 */
function GroupPanels({
  group,
  boardWindow,
  boardOrder,
  onWindowChange,
  onOrderChange,
  onChanged,
  onGone,
}: {
  group: Group
  boardWindow: LeaderboardWindow
  boardOrder: GroupBoardOrder
  onWindowChange: (window: LeaderboardWindow) => void
  onOrderChange: (order: GroupBoardOrder) => void
  onChanged: () => Promise<unknown>
  onGone: () => Promise<void>
}) {
  /**
   * The board with the window and order it was read for, so switching never
   * leaves the old figures under the new tab.
   */
  const [board, setBoard] = React.useState<{
    key: string
    result: Board | null
  } | null>(null)
  const [boardAttempt, setBoardAttempt] = React.useState(0)
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  // Handing the group on makes this account a member, so Edit group closes
  // and stays closed rather than opening again if it ever comes back.
  if (editing && !group.isOwner) setEditing(false)
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const boardKey = `${boardWindow}:${boardOrder}`

  React.useEffect(() => {
    let cancelled = false
    const key = `${boardWindow}:${boardOrder}`
    void loadFocusGroupBoard(group.id, boardWindow, boardOrder)
      .then((result) => {
        if (!cancelled) setBoard({ key, result })
      })
      .catch(() => {
        // `result: null` is the failure, recorded against this choice only.
        if (!cancelled) setBoard({ key, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [group.id, boardWindow, boardOrder, boardAttempt, group.memberCount])

  const shown = board?.key === boardKey ? board : null
  // The streak, goal and past weeks are read again when the members or the
  // goal change.
  const scoreVersion = `${group.memberCount}:${group.weeklyGoalHours}:${group.timezone}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* The group's name and its tabs sit inside its card, above the board
          (Tyler's mark-up of 12 Oct 2026,
          workspace/docs/assets/pasted-image-1791818740774117000.png). */}
      <PanelCard
        label={group.name}
        header={
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <h3 className="min-w-0 break-words text-2xl font-bold tracking-tight">
                {group.name}
              </h3>
              {/* Tyler, 13 Oct 2026: the cog reads Edit group, and Invite
                  people beside it opens the invite link card. */}
              <span className="flex flex-wrap gap-2">
                {group.isOwner ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <SettingsIcon aria-hidden="true" />
                    Edit group
                  </Button>
                ) : null}
                <InvitePeopleButton group={group} onChanged={onChanged} />
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
            </div>
            {group.description ? (
              <p className="break-words text-muted-foreground">
                {group.description}
              </p>
            ) : null}
          </header>
        }
      >
        <GroupStanding groupId={group.id} version={scoreVersion} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {boardWindow === "week"
              ? "This week runs from Monday"
              : boardWindow === "month"
                ? "This calendar month"
                : "Every day so far"}
            , in {group.timezone.replaceAll("_", " ")} time.
          </span>
          {/* What orders the board (part 17). Hours is the default. */}
          <Tabs
            value={boardOrder}
            onValueChange={(value) => onOrderChange(value as GroupBoardOrder)}
          >
            <TabsList aria-label="Rank by" className={pillTabsList}>
              {GROUP_BOARD_ORDERS.map((option) => (
                <TabsTrigger key={option} value={option} className={pillTabsTrigger}>
                  {GROUP_BOARD_ORDER_LABELS[option]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
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
            <LeaderboardRows
              leaders={shown.result.leaders}
              detail={boardOrder === "days" ? "days" : "sessions"}
              action={(leader) =>
                leader.isYou || !leader.membershipId ? null : (
                  <CheerButton
                    groupId={group.id}
                    membershipId={leader.membershipId}
                    name={leader.name ?? "them"}
                  />
                )
              }
            />
          </div>
        )}
      </PanelCard>

      {/* The owner's Who is in it and public page are inside Edit group.
          A member, who has no Edit group, keeps both on the page. */}
      {group.isOwner ? null : (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <GroupMembersCard
            group={group}
            busy={busy}
            onLeave={() => setConfirmingLeave(true)}
          />
          {group.teamHandle ? (
            <TeamPageNoticeCard teamHandle={group.teamHandle} />
          ) : null}
        </div>
      )}

      <div className="grid items-start gap-6 md:grid-cols-2">
        <PastWeeksCard groupId={group.id} version={scoreVersion} />
        {group.isOwner ? (
          <GroupActivityCard
            groupId={group.id}
            version={`${group.memberCount}:${group.name}:${group.joinToken}:${group.joinsPaused}`}
          />
        ) : null}
      </div>

      {/* Only the owner has Edit group. Handing the group on makes this
          account a member, which takes the window away with it. */}
      {group.isOwner ? (
        <GroupEditDialog
          key={`edit-${editing}`}
          group={group}
          open={editing}
          onOpenChange={setEditing}
          onSaved={onChanged}
          onGone={onGone}
        />
      ) : null}
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

/**
 * A cheer from a row on the board (part 15): the same canned lines and the
 * same daily limit as a cheer on a public page.
 */
function CheerButton({
  groupId,
  membershipId,
  name,
}: {
  groupId: string
  membershipId: string
  name: string
}) {
  const [sending, setSending] = React.useState(false)
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={sending}
              aria-label={`Cheer ${name} on`}
            >
              {sending ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : (
                <PartyPopperIcon aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Send {name} a cheer</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {CHEERS.map((cheer) => (
          <DropdownMenuItem
            key={cheer.id}
            onSelect={async () => {
              setSending(true)
              dismissErrorToast()
              try {
                await cheerFocusGroupMember(groupId, membershipId, cheer.id)
                toast.success(`Cheer sent to ${name}.`)
              } catch (cause) {
                showErrorToast(cheerErrorMessage(cause))
              } finally {
                setSending(false)
              }
            }}
          >
            {cheer.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Invites waiting for you (groups task 01, part 7): somebody you follow
 * asked you into their group from the bell. Join runs the same rules as the
 * link, so a paused group says so and a group that asks first turns the
 * Join into a request. Nothing is drawn when nothing is waiting.
 */
function GroupInvitesPanel({
  onJoined,
}: {
  onJoined: (groupId: string) => Promise<void>
}) {
  const [invites, setInvites] = React.useState<Invite[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [run, busy] = useAsyncAction(groupErrorMessage)

  React.useEffect(() => {
    let cancelled = false
    void loadMyFocusGroupInvites()
      .then((rows) => {
        if (cancelled) return
        setFailed(false)
        setInvites(rows)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (failed)
    return (
      <PanelCard label="Invites">
        <ErrorRow
          message="Your invites could not be loaded."
          onRetry={() => {
            dismissErrorToast()
            setFailed(false)
            setAttempt((count) => count + 1)
          }}
        />
      </PanelCard>
    )
  if (!invites || invites.length === 0) return null

  const reload = () => setAttempt((count) => count + 1)
  return (
    <PanelCard label="Invites">
      <ul className="flex flex-col gap-3">
        {invites.map((invite) => (
          <li key={invite.inviteId} className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="min-w-0 break-words font-semibold">
                {invite.groupName}
              </span>
              <span className="text-sm text-muted-foreground">
                {invite.inviterName} invited you · {invite.memberCount}{" "}
                {plural(invite.memberCount, "person", "people")}
                {invite.description ? ` · ${invite.description}` : ""}
              </span>
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await acceptFocusGroupInvite(invite.inviteId)
                  reload()
                  if (result.status === "requested") {
                    toast.success(
                      `${result.name} lets each person in. Your request is waiting for the owner.`
                    )
                    return
                  }
                  toast.success("You are in the group.")
                  await onJoined(result.id)
                })
              }
            >
              Join
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await declineFocusGroupInvite(invite.inviteId)
                  reload()
                }, "Invite declined.")
              }
            >
              Decline
            </Button>
          </li>
        ))}
      </ul>
    </PanelCard>
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
                  const result = await joinFocusGroup(tokenFromLink(link))
                  if (result.status === "requested") {
                    toast.success(
                      `${result.name} lets each person in. Your request is waiting for the owner.`
                    )
                    return
                  }
                  toast.success("You are in the group.")
                  await onJoined(result.id)
                })
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
