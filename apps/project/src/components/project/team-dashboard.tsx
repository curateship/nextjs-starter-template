import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  LogOutIcon,
  MailPlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { InviteDialog, SentInviteCard } from "@/components/project/invite-dialog"
import { MemberDialog } from "@/components/project/member-dialog"
import { PersonAvatar } from "@/components/project/task-bits"
import { TeamStart } from "@/components/project/team-start"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  cancelTeamInvites,
  leaveProjectTeam,
  removeManyFromTeam,
  resendTeamInvite,
  updateProjectTeam,
  type BulkResult,
  type InviteForMe,
  type SentInvite,
  type TeamDashboard as TeamDashboardData,
  type TeamInviteRow,
  type TeamMemberRow,
} from "@/lib/api/project/teams"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  TEAM_ROLE_LABEL,
  WEEK_DAYS,
  runsTheTeam,
  type TeamRole,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Team dashboard: the team's settings, its people and its pending
 * invites. The owner and admins change things here; everyone else sees the
 * same page to read.
 */
export function TeamDashboard({
  data,
  invites,
}: {
  data: TeamDashboardData | null
  invites: InviteForMe[]
}) {
  if (!data) return <TeamStart invites={invites} />
  const canRun = runsTheTeam(data.myRole)
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <TeamSettingsCard data={data} canEdit={canRun} />
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

/** Each field saves when it is left or picked. There is no Save button. */
function TeamSettingsCard({ data, canEdit }: { data: TeamDashboardData; canEdit: boolean }) {
  const router = useRouter()
  const { team } = data
  const [name, setName] = useSyncedDraft(team.name)
  const [checkinTime, setCheckinTime] = useSyncedDraft(team.checkinTime)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const zones = React.useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
    return all.includes(team.timeZone) ? all : [team.timeZone, ...all]
  }, [team.timeZone])

  async function save(patch: Parameters<typeof updateProjectTeam>[0]) {
    const ok = await run(() => updateProjectTeam(patch))
    if (ok) await router.invalidate()
  }

  function commitName() {
    const next = name.trim()
    if (next === team.name) return
    if (!next) {
      setNameInvalid(true)
      showErrorToast("The team name can't be empty.")
      return
    }
    void save({ name: next })
  }

  function commitTime() {
    if (checkinTime === team.checkinTime) return
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(checkinTime)) {
      setCheckinTime(team.checkinTime)
      showErrorToast("Pick a time like 09:00.")
      return
    }
    void save({ checkinTime })
  }

  function toggleDay(day: number, on: boolean) {
    const next = on ? [...team.workDays, day] : team.workDays.filter((d) => d !== day)
    if (next.length === 0) {
      showErrorToast("Pick at least one work day.")
      return
    }
    void save({ workDays: next })
  }

  const readOnly = !canEdit || busy

  return (
    <FeedCard>
      <CardTop icon={SettingsIcon} title="Team settings" />
      <div className="grid gap-4 p-4 sm:p-5">
        {canEdit ? null : (
          <p className="text-sm text-muted-foreground">
            Only the team's owner and admins can change these.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="team-settings-name">Team name</Label>
            <Input
              id="team-settings-name"
              value={name}
              maxLength={LIMITS.teamName}
              disabled={!canEdit}
              aria-invalid={nameInvalid || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setNameInvalid(false)
              }}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="team-settings-checkin">Daily check-in time</Label>
            <Input
              id="team-settings-checkin"
              type="time"
              className="w-full sm:w-36"
              value={checkinTime}
              disabled={!canEdit}
              onChange={(event) => setCheckinTime(event.target.value)}
              onBlur={commitTime}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="team-settings-zone">Time zone</Label>
            <Select
              value={team.timeZone}
              onValueChange={(timeZone) => void save({ timeZone })}
              disabled={readOnly}
            >
              <SelectTrigger id="team-settings-zone" className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Work days</legend>
          {WEEK_DAYS.map(({ day, short }) => {
            const id = `team-day-${day}`
            return (
              <div key={day} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={team.workDays.includes(day)}
                  disabled={readOnly}
                  onCheckedChange={(checked) => toggleDay(day, checked === true)}
                />
                <Label htmlFor={id} className="font-normal">
                  {short}
                </Label>
              </div>
            )
          })}
        </fieldset>
      </div>
    </FeedCard>
  )
}

type MemberColumn = "name" | "role" | "joined"
const ROLE_ORDER: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 }

function MembersTable({ data, canRun }: { data: TeamDashboardData; canRun: boolean }) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const [query, setQuery] = React.useState("")
  const [inviting, setInviting] = React.useState(false)
  const [editing, setEditing] = React.useState<TeamMemberRow | null>(null)
  const [removing, setRemoving] = React.useState<TeamMemberRow[] | null>(null)
  const { sort, direction, toggleSort } = useTableSort<MemberColumn>("role")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const report = useBulkReport("person", "people", "removed from the team")

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
        emptyColSpan={5}
        footer={footer}
      >
        {visible.map((member) => {
          const isMe = member.userId === data.myUserId
          const canEdit = canRun && member.role !== "owner" && !isMe
          return (
            <TableRow
              key={member.userId}
              className="group"
              rowAction={canEdit || (data.myRole === "owner" && !isMe) ? () => setEditing(member) : undefined}
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
      <MemberDialog member={editing} myRole={data.myRole} onClose={() => setEditing(null)} />
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
        description="They lose access at once. Their tasks stay, with nobody assigned and a note saying whose they were."
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Resend the invite to ${invite.email}`}
                disabled={busy}
                onClick={() => void resend(invite)}
              >
                <RefreshCwIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Cancel the invite to ${invite.email}`}
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
