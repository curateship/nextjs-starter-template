import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArrowRightLeftIcon,
  LogOutIcon,
  MailPlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { HandOverDialog } from "@/components/project/hand-over-dialog"
import { InviteDialog, SentInviteCard } from "@/components/project/invite-dialog"
import { MemberDialog } from "@/components/project/member-dialog"
import { PersonAvatar } from "@/components/project/task-bits"
import { CardTop, FeedCard } from "@/components/shared/feed-card"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  cancelTeamInvites,
  leaveProjectTeam,
  removeManyFromTeam,
  resendTeamInvite,
  type BulkResult,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
  type TeamInviteRow,
  type TeamMemberRow,
} from "@/lib/api/project/teams"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  TEAM_ROLE_LABEL,
  runsTheTeam,
  type TeamRole,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Members page (`/team/members`), opened from Manage on the Team
 * dashboard: everyone on the team, the pending invites, and Leave team. The
 * owner and admins change roles, remove people and handle invites here;
 * everyone else sees the same page to read.
 */
export function TeamMembersPage({ data }: { data: TeamDashboardData }) {
  const canRun = runsTheTeam(data.myRole)
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <MembersTable data={data} canRun={canRun} />
      {canRun ? <InvitesTable invites={data.invites} /> : null}
      {data.myRole === "owner" ? null : <LeaveTeamCard teamName={data.team.name} />}
    </div>
  )
}

function useBulkReport(one: string, many: string, verb: string) {
  return React.useCallback(
    (result: BulkResult) => {
      const line = describeBulkResult({
        done: result.done.length,
        kept: result.kept.length,
        one,
        many,
        verb,
      })
      if (result.kept.length) showErrorToast(line)
      else toast.success(line)
    },
    [many, one, verb]
  )
}

type MemberColumn = "name" | "title" | "role" | "joined"
const ROLE_ORDER: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 }

function MembersTable({ data, canRun }: { data: TeamDashboardData; canRun: boolean }) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const [query, setQuery] = React.useState("")
  const [inviting, setInviting] = React.useState(false)
  const [editing, setEditing] = React.useState<TeamMemberRow | null>(null)
  const [removing, setRemoving] = React.useState<TeamMemberRow[] | null>(null)
  const [handingOver, setHandingOver] = React.useState<TeamMemberRow | null>(null)
  const { sort, direction, toggleSort } = useTableSort<MemberColumn>("role")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const report = useBulkReport("person", "people", "removed from the team")
  // A search hides people, so it clears the ticks: Remove never acts on someone out of sight.
  useClearSelectionOnListChange(selection.setSelected, query)

  // The owner and you can't be picked: neither can be removed from here.
  const removable = (member: TeamMemberRow) =>
    canRun && member.role !== "owner" && member.userId !== data.myUserId

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = query.trim().toLowerCase()
    return data.members
      .filter(
        (m) =>
          !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)
      )
      .sort((a, b) => {
        const gap =
          sort === "role"
            ? ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
            : sort === "title"
              ? (a.title ?? "~").localeCompare(b.title ?? "~")
              : sort === "joined"
              ? a.joinedAt.localeCompare(b.joinedAt)
                : 0
        return gap * sign || a.name.localeCompare(b.name)
      })
  }, [data.members, direction, query, sort])

  const { visible, footer } = useClientPage(rows, config.dashboardRowsPerPage, `${query}|${sort}|${direction}`)
  const selectableIds = visible.filter(removable).map((m) => m.userId)
  const selectedIds = [...selection.selected].filter((id) =>
    data.members.some((m) => m.userId === id && removable(m))
  )

  const columns: SortableColumn<MemberColumn>[] = [
    { key: "name", label: "Name", column: "main", className: "min-w-0 md:min-w-64" },
    { key: "title", label: "Job title", column: "preview" },
    { key: "role", label: "Role", column: "preview" },
    { key: "joined", label: "Joined", column: "preview" },
  ]

  async function remove(people: TeamMemberRow[]) {
    let result: BulkResult = { done: [], kept: [] }
    const ok = await run(async () => {
      result = await removeManyFromTeam(people.map((p) => p.userId))
    })
    if (!ok) return
    report(result)
    setRemoving(null)
    selection.clear()
    await router.invalidate()
  }

  return (
    <>
      <DashboardTable
        title="Members"
        icon={<UsersIcon className="text-muted-foreground" />}
        count={rows.length}
        selectedCount={selectedIds.length}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.length ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  setRemoving(data.members.filter((m) => selectedIds.includes(m.userId)))
                }
              >
                <Trash2Icon className="size-4" />
                Remove ({selectedIds.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="member-search"
              aria-label="Search members by name or email"
              placeholder="Search members…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {canRun ? (
              <DashboardToolbarButton type="button" onClick={() => setInviting(true)}>
                <MailPlusIcon className="size-4" />
                Invite
              </DashboardToolbarButton>
            ) : null}
          </>
        }
        header={
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="members"
                disabled={selectableIds.length === 0}
                checked={selection.selectAllState(selectableIds)}
                onCheckedChange={() => selection.toggleVisible(selectableIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText="Nobody matches that search."
        emptyColSpan={6}
        footer={footer}
      >
        {visible.map((member) => {
          const isMe = member.userId === data.myUserId
          const canEdit = canRun && member.role !== "owner" && !isMe
          return (
            <TableRow
              key={member.userId}
              className="group"
              rowAction={() => setEditing(member)}
            >
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(member.userId)}
                  disabled={!removable(member)}
                  onCheckedChange={() => selection.toggle(member.userId)}
                  aria-label={`Select ${member.name}`}
                />
              </TableCell>
              <TableCell column="main">
                <span className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} size="default" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {member.name}
                      {isMe ? " (you)" : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell column="preview">
                {member.title}
              </TableCell>
              <TableCell column="preview">{TEAM_ROLE_LABEL[member.role]}</TableCell>
              <TableCell column="preview">{formatDate(member.joinedAt)}</TableCell>
              <TableCell column="actions">
                {canEdit || (data.myRole === "owner" && !isMe) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Change ${member.name}'s role`}
                    onClick={() => setEditing(member)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                ) : null}
                {canRun ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hand over all of ${member.name}'s tasks`}
                    onClick={() => setHandingOver(member)}
                  >
                    <ArrowRightLeftIcon className="size-4" />
                  </Button>
                ) : null}
                {removable(member) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${member.name} from the team`}
                    onClick={() => setRemoving([member])}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <MemberDialog
        member={editing}
        myRole={data.myRole}
        myUserId={data.myUserId}
        onClose={() => setEditing(null)}
        onHandOver={setHandingOver}
      />
      <HandOverDialog from={handingOver} members={data.members} onClose={() => setHandingOver(null)} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={
          removing?.length === 1
            ? `Remove ${removing[0].name} from the team?`
            : `Remove ${removing?.length ?? 0} people from the team?`
        }
        description={
          <>
            They lose access at once. Their tasks stay, with nobody assigned and a note saying whose
            they were.
            {removing?.length === 1 ? (
              <>
                {" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    setHandingOver(removing[0])
                    setRemoving(null)
                  }}
                >
                  Hand over their tasks first
                </Button>
              </>
            ) : null}
          </>
        }
        confirmLabel="Remove"
        loading={busy}
        onConfirm={async () => {
          if (removing) await remove(removing)
        }}
      />
    </>
  )
}

type InviteColumn = "email" | "role" | "expires"

function InvitesTable({ invites }: { invites: TeamInviteRow[] }) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const { sort, direction, toggleSort } = useTableSort<InviteColumn>("email")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [cancelling, setCancelling] = React.useState<string[] | null>(null)
  const [resent, setResent] = React.useState<{ sent: SentInvite; email: string } | null>(null)
  const report = useBulkReport("invite", "invites", "cancelled")

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    return [...invites].sort((a, b) => {
      const gap =
        sort === "role"
          ? a.role.localeCompare(b.role)
          : sort === "expires"
            ? a.expiresAt.localeCompare(b.expiresAt)
            : a.email.localeCompare(b.email)
      return gap * sign || a.email.localeCompare(b.email)
    })
  }, [direction, invites, sort])
  const { visible, footer } = useClientPage(rows, config.dashboardRowsPerPage, `${sort}|${direction}`)
  const visibleIds = visible.map((invite) => invite.id)
  const selectedIds = [...selection.selected].filter((id) => invites.some((i) => i.id === id))

  const columns: SortableColumn<InviteColumn>[] = [
    { key: "email", label: "Email", column: "main", className: "min-w-0 md:min-w-64" },
    { key: "role", label: "Role", column: "preview" },
    { key: "expires", label: "Expires", column: "preview" },
  ]

  async function resend(invite: TeamInviteRow) {
    let sent: SentInvite | null = null
    const ok = await run(async () => {
      sent = await resendTeamInvite(invite.id)
    })
    if (!ok || !sent) return
    setResent({ sent, email: invite.email })
    await router.invalidate()
  }

  async function cancel(ids: string[]) {
    let result: BulkResult = { done: [], kept: [] }
    const ok = await run(async () => {
      result = await cancelTeamInvites(ids)
    })
    if (!ok) return
    report(result)
    setCancelling(null)
    selection.clear()
    await router.invalidate()
  }

  return (
    <>
      <DashboardTable
        title="Pending invites"
        icon={<MailPlusIcon className="text-muted-foreground" />}
        count={rows.length}
        selectedCount={selectedIds.length}
        onClearSelection={selection.clear}
        controls={
          selectedIds.length ? (
            <DashboardToolbarButton
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setCancelling(selectedIds)}
            >
              <Trash2Icon className="size-4" />
              Cancel ({selectedIds.length})
            </DashboardToolbarButton>
          ) : null
        }
        header={
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="invites"
                disabled={visibleIds.length === 0}
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText="No invites waiting. Invite someone from the Members table."
        emptyColSpan={5}
        footer={footer}
      >
        {visible.map((invite) => (
          <TableRow key={invite.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(invite.id)}
                onCheckedChange={() => selection.toggle(invite.id)}
                aria-label={`Select the invite to ${invite.email}`}
              />
            </TableCell>
            <TableCell column="main">
              <span className="block truncate font-medium">{invite.email}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {invite.invitedByName ? `Invited by ${invite.invitedByName}` : "Invited"} on{" "}
                {formatDate(invite.sentAt)}
              </span>
            </TableCell>
            <TableCell column="preview">{TEAM_ROLE_LABEL[invite.role]}</TableCell>
            <TableCell column="preview">
              {invite.expired ? (
                <span className="text-destructive">Expired</span>
              ) : (
                formatDate(invite.expiresAt)
              )}
            </TableCell>
            <TableCell column="actions">
              {/* The tooltip says it before the press: resending stops the old link. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Resend the invite to ${invite.email}. The old link stops working.`}
                    disabled={busy}
                    onClick={() => void resend(invite)}
                  >
                    <RefreshCwIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resend the invite. The old link stops working.</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Cancel the invite to ${invite.email}`}
                disabled={busy}
                onClick={() => setCancelling([invite.id])}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => {
          if (!open) setCancelling(null)
        }}
        title={cancelling?.length === 1 ? "Cancel this invite?" : `Cancel ${cancelling?.length ?? 0} invites?`}
        description="The invite link stops working. You can invite the same address again later."
        confirmLabel="Cancel invite"
        cancelLabel="Keep it"
        loading={busy}
        onConfirm={async () => {
          if (cancelling) await cancel(cancelling)
        }}
      />
      <Dialog open={Boolean(resent)} onOpenChange={(open) => (open ? null : setResent(null))}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite sent again</DialogTitle>
            <DialogDescription>The old link no longer works. This one lasts seven days.</DialogDescription>
          </DialogHeader>
          <DialogBody>{resent ? <SentInviteCard sent={resent.sent} email={resent.email} /> : null}</DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setResent(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LeaveTeamCard({ teamName }: { teamName: string }) {
  const router = useRouter()
  const me = getRouteApi("/_authenticated").useLoaderData().user
  const [confirming, setConfirming] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  return (
    <FeedCard>
      <CardTop icon={LogOutIcon} title="Leave team" />
      <div className="grid gap-4 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">
          You'll lose access to {teamName}'s projects at once. Your tasks stay, with nobody assigned.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            <LogOutIcon className="size-4" />
            Leave {teamName}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Leave ${teamName}?`}
        description={`${me.name}, you'd need a new invite to come back.`}
        confirmLabel="Leave team"
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => leaveProjectTeam(), `You left ${teamName}.`)
          if (ok) {
            setConfirming(false)
            await router.invalidate()
          }
        }}
      />
    </FeedCard>
  )
}
