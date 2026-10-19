import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowRightLeftIcon,
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
  removeManyFromTeam,
  resendTeamInvite,
  type BulkResult,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
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
import { runsTheTeam } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * The Members page (`/team/members`), opened from Manage on the Team
 * dashboard: everyone on the team. The site admin invites, resends a
 * "Set your password" email, hands tasks on and removes people here;
 * employees see the same page to read. Team roles give no powers since
 * 16 Oct 2026 ("Only me, the site admin"), so there are no roles to change,
 * no owner to hand over to and no Leave team.
 */
export function TeamMembersPage({ data }: { data: TeamDashboardData }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <MembersTable data={data} canRun={runsTheTeam(data.myRole)} />
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

type MemberColumn = "name" | "title" | "status" | "joined"

function MembersTable({ data, canRun }: { data: TeamDashboardData; canRun: boolean }) {
  const teamId = useTeamId()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [query, setQuery] = React.useState("")
  const [inviting, setInviting] = React.useState(false)
  const [editing, setEditing] = React.useState<TeamMemberRow | null>(null)
  const [removing, setRemoving] = React.useState<TeamMemberRow[] | null>(null)
  const [handingOver, setHandingOver] = React.useState<TeamMemberRow | null>(null)
  const [resent, setResent] = React.useState<{ sent: SentInvite; email: string } | null>(null)
  const { sort, direction, toggleSort } = useTableSort<MemberColumn>("name")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const report = useBulkReport("person", "people", "removed from the team")
  // A search hides people, so it clears the ticks: Remove never acts on someone out of sight.
  useClearSelectionOnListChange(selection.setSelected, query)


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
          sort === "status"
            ? Number(b.invited) - Number(a.invited)
            : sort === "title"
              ? (a.title ?? "~").localeCompare(b.title ?? "~")
              : sort === "joined"
              ? a.joinedAt.localeCompare(b.joinedAt)
                : 0
        return gap * sign || a.name.localeCompare(b.name)
      })
  }, [data.members, direction, query, sort])

  const { visible, footer } = useClientPage(rows, config.dashboardRowsPerPage, `${query}|${sort}|${direction}`)
  // Only the site admin removes people, and the site admin is never in this list.
  const selectableIds = canRun ? visible.map((m) => m.userId) : []
  const selectedIds = [...selection.selected].filter((id) =>
    canRun && data.members.some((m) => m.userId === id)
  )

  const columns: SortableColumn<MemberColumn>[] = [
    { key: "name", label: "Name", column: "main", className: "min-w-0 md:min-w-64" },
    { key: "title", label: "Job title", column: "preview" },
    { key: "status", label: "Status", column: "preview" },
    { key: "joined", label: "Joined", column: "preview" },
  ]

  async function resend(member: TeamMemberRow) {
    let sent: SentInvite | null = null
    const ok = await run(async () => {
      sent = await resendTeamInvite(member.userId, teamId)
    })
    if (ok && sent) setResent({ sent, email: member.email })
  }

  async function remove(people: TeamMemberRow[]) {
    let result: BulkResult = { done: [], kept: [] }
    const ok = await run(async () => {
      result = await removeManyFromTeam(people.map((p) => p.userId), teamId)
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
          return (
            <TableRow
              key={member.userId}
              className="group"
              rowAction={() => setEditing(member)}
            >
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(member.userId)}
                  disabled={!canRun}
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
              <TableCell column="preview">
                {member.invited ? <span className="text-muted-foreground">Invited</span> : "Active"}
              </TableCell>
              <TableCell column="preview">{formatDate(member.joinedAt)}</TableCell>
              <TableCell column="actions">
                {canRun && !isMe ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Open ${member.name}'s page`}
                    onClick={() => setEditing(member)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                ) : null}
                {canRun && member.invited ? (
                  // The tooltip says it before the press: a fresh email stops the old link.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Send ${member.name} a fresh link to set their password. The old link stops working.`}
                        disabled={busy}
                        onClick={() => void resend(member)}
                      >
                        <RefreshCwIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send the invite again. The old link stops working.</TooltipContent>
                  </Tooltip>
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
                {canRun ? (
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
      <InviteResentDialog resent={resent} onClose={() => setResent(null)} />
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
            They lose access to the team at once and keep their account. Their tasks stay, with
            nobody assigned and a note saying whose they were.
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

/**
 * After Resend: whether the fresh "Set your password" email went. Here and on
 * the Team dashboard's Members card, which resends the same way.
 */
export function InviteResentDialog({
  resent,
  onClose,
}: {
  resent: { sent: SentInvite; email: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(resent)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite sent again</DialogTitle>
          <DialogDescription>The old link no longer works.</DialogDescription>
        </DialogHeader>
        <DialogBody>{resent ? <SentInviteCard sent={resent.sent} email={resent.email} /> : null}</DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
