import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  DumbbellIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { InviteClientDialog } from "@/components/fitness/coaching/invite-client-dialog"
import { NewProgramDialog } from "@/components/fitness/programs/new-program-dialog"
import { ProgramSettingsDialog } from "@/components/fitness/programs/program-settings-dialog"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeClients, changeMyCoach, type CoachClient, type MyCoach } from "@/lib/api/fitness/coaching"
import { saveMyTimeZone } from "@/lib/api/fitness/profile"
import { changeProgram, loadProgramsPage, type ProgramSummary } from "@/lib/api/fitness/programs"
import { formatDay } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"

type ProgramsPage = Awaited<ReturnType<typeof loadProgramsPage>>

type SortColumn = "name" | "type" | "next" | "days"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Program", column: "main", className: "min-w-40" },
  { key: "type", label: "Routine type", column: "meta", className: "hidden md:table-cell" },
  { key: "next", label: "Next workout", column: "meta", className: "hidden sm:table-cell" },
  { key: "days", label: "Workout days", column: "meta", className: "hidden lg:table-cell" },
]

function sortValue(program: ProgramSummary, column: SortColumn): string | number {
  switch (column) {
    case "name":
      return program.name.toLowerCase()
    case "type":
      return routineTypeLabel(program.routineType)
    case "next":
      return program.nextWorkout?.day ?? "9999"
    case "days":
      return program.workoutDays
  }
}

/**
 * The Programs dashboard, where everything starts. Tyler, 18 Oct 2026: "There
 * is a program dashboard. I create a program via modal, choose a routine,
 * input my starting data then create. Only then I get to the 3 panel
 * dashboard." A program is like a project: each row opens its own three-panel
 * dashboard at `/programs/<id>`.
 *
 * Above the table, only when there is something to say: a workout left
 * unfinished, coaches asking to coach the person, and the coaches they said
 * yes to. A coach also gets their clients here, and opens a client's list
 * with `?person=<client>`.
 */
export function ProgramsDashboard({ page, clientName }: { page: ProgramsPage; clientName: string | null }) {
  const router = useRouter()
  const viewingClient = clientName !== null
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState<ProgramSummary | null>(null)
  const [deleting, setDeleting] = React.useState<ProgramSummary[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const selection = useSelection()

  // The calendar and reminders run on the person's own clock, which only the
  // browser knows. Sent once when it differs from what the server holds.
  React.useEffect(() => {
    if (viewingClient) return
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone && zone !== page.preferences.timeZone) void saveMyTimeZone(zone).catch(() => undefined)
  }, [page.preferences.timeZone, viewingClient])

  const shown = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rows = page.programs.filter((program) => words.every((word) => program.name.toLowerCase().includes(word)))
    const order = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = sortValue(a, sort)
      const right = sortValue(b, sort)
      return (left < right ? -1 : left > right ? 1 : 0) * order
    })
  }, [page.programs, query, sort, direction])
  const visibleIds = shown.map((program) => program.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.selected.has(id))
  const someSelected = visibleIds.some((id) => selection.selected.has(id))

  async function deletePrograms(targets: ProgramSummary[]) {
    setBusy(true)
    try {
      const { done = [], kept = [] } = await changeProgram({
        action: "deleteMany",
        programIds: targets.map((program) => program.id),
      })
      const line = describeBulkResult({ done: done.length, kept: kept.length, one: "program", many: "programs", verb: "deleted" })
      if (kept.length) toast.error(line)
      else toast.success(targets.length === 1 ? `${targets[0].name} deleted.` : line)
      setDeleting(null)
      selection.clear()
      if (done.length) await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const openWorkout = page.openWorkout
  const requests = page.coaches.filter((coach) => !coach.accepted)
  const myCoaches = page.coaches.filter((coach) => coach.accepted)

  return (
    <>
      {viewingClient ? (
        <p className="text-sm text-muted-foreground">
          You're looking at {clientName}'s programs.{" "}
          <Link to="/programs" search={{}} className="font-medium text-foreground underline">
            Back to your own
          </Link>
        </p>
      ) : null}

      {openWorkout?.programId ? (
        <Card className="gap-0 py-0">
          <DashboardCardHeader>
            <DumbbellIcon className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold">Unfinished workout</h2>
          </DashboardCardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="text-sm">
              <span className="font-medium">{openWorkout.name}</span> from {formatDay(openWorkout.day)} isn't finished.
            </p>
            <Button asChild>
              <Link
                to="/programs/$programId"
                params={{ programId: openWorkout.programId }}
                search={{ workout: openWorkout.id }}
              >
                <PlayIcon className="size-4" />
                Pick up {openWorkout.name}
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <CoachRequests coaches={requests} />

      <DashboardTable
        title={viewingClient ? `${clientName}'s programs` : "Programs"}
        icon={<DumbbellIcon />}
        count={page.programs.length}
        busy={busy}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleting(page.programs.filter((program) => selection.selected.has(program.id)))}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="program-search"
              aria-label="Search programs"
              placeholder="Search programs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New program
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="programs"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          page.programs.length === 0
            ? "No programs yet. Press New program to make the first one."
            : "No program matches that search."
        }
        emptyColSpan={6}
        footer={{ type: "summary", count: shown.length, label: plural(shown.length, "program") }}
      >
        {shown.map((program) => (
          <ProgramRow
            key={program.id}
            program={program}
            selected={selection.selected.has(program.id)}
            onSelect={() => selection.toggle(program.id)}
            onSettings={() => setEditing(program)}
            onDelete={() => setDeleting([program])}
          />
        ))}
      </DashboardTable>

      {viewingClient ? null : <MyCoaches coaches={myCoaches} />}
      {page.clients ? <ClientsTable clients={page.clients} /> : null}

      <NewProgramDialog
        open={creating}
        onOpenChange={setCreating}
        personId={viewingClient ? page.personId : undefined}
        unit={page.preferences.unit}
      />
      <ProgramSettingsDialog program={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null)
        }}
        title={
          deleting && deleting.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting?.length ?? 0} programs?`
        }
        description="The week, its calendar and its rules go for good. Workouts already logged stay, and keep counting toward records."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => {
          if (deleting) void deletePrograms(deleting)
        }}
      />
    </>
  )
}

function ProgramRow({
  program,
  selected,
  onSelect,
  onSettings,
  onDelete,
}: {
  program: ProgramSummary
  selected: boolean
  onSelect: () => void
  onSettings: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const open = () => void navigate({ to: "/programs/$programId", params: { programId: program.id } })
  const next = program.paused
    ? "Paused"
    : program.archived
      ? "Archived"
      : program.nextWorkout
        ? `${program.nextWorkout.dayName}, ${formatDay(program.nextWorkout.day)}`
        : "Nothing planned yet"
  return (
    <TableRow className="group" rowAction={open}>
      <TableCell column="select">
        <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Select ${program.name}`} />
      </TableCell>
      <TableCell column="main" className="min-w-40">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="max-w-80 truncate text-left text-sm font-medium group-hover:underline"
            onClick={open}
          >
            {program.name}
          </button>
          {program.isActive ? <Badge variant="secondary">Active</Badge> : null}
          {program.paused ? <Badge variant="outline">Paused</Badge> : null}
          {program.archived ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground sm:hidden">{next}</p>
        {program.builtBy ? <p className="text-xs text-muted-foreground">Built by {program.builtBy}</p> : null}
      </TableCell>
      <TableCell column="meta" className="hidden md:table-cell">
        {routineTypeLabel(program.routineType)}
      </TableCell>
      <TableCell column="meta" className="hidden sm:table-cell">
        {next}
      </TableCell>
      <TableCell column="meta" className="hidden lg:table-cell">
        {program.workoutDays} of 7
      </TableCell>
      <TableCell column="actions">
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`${program.name} settings`} onClick={onSettings}>
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rename, make active or archive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${program.name}`} onClick={onDelete}>
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  )
}

function CoachRequests({ coaches }: { coaches: MyCoach[] }) {
  const router = useRouter()
  const [answering, setAnswering] = React.useState<string | null>(null)
  if (coaches.length === 0) return null

  async function answer(coach: MyCoach, accept: boolean) {
    setAnswering(coach.coachId)
    try {
      await changeMyCoach({ action: "answer", coachId: coach.coachId, accept })
      toast.success(accept ? `${coach.name} is now your coach.` : `You said no to ${coach.name}.`)
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setAnswering(null)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <DashboardCardHeader>
        <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Coach requests</h2>
      </DashboardCardHeader>
      <ul className="divide-y">
        {coaches.map((coach) => (
          <li key={coach.coachId} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="text-sm font-medium">{coach.name} wants to coach you</p>
              <p className="text-xs text-muted-foreground">
                A coach can change your programs and read your workouts. Photos stay hidden unless you switch them on.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={answering === coach.coachId}
                onClick={() => void answer(coach, false)}
              >
                Decline
              </Button>
              <Button type="button" disabled={answering === coach.coachId} onClick={() => void answer(coach, true)}>
                {answering === coach.coachId ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Accept
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Coaches the person said yes to: whether each may see photos, and removing one. */
function MyCoaches({ coaches }: { coaches: MyCoach[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<MyCoach | null>(null)
  if (coaches.length === 0) return null

  async function run(coach: MyCoach, change: { action: "photos"; allowed: boolean } | { action: "remove" }) {
    setBusy(coach.coachId)
    try {
      await changeMyCoach({ ...change, coachId: coach.coachId })
      toast.success(
        change.action === "remove"
          ? `${coach.name} is no longer your coach.`
          : change.allowed
            ? `${coach.name} can now see your photos.`
            : `${coach.name} can no longer see your photos.`
      )
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
      setRemoving(null)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <DashboardCardHeader>
        <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">My coaches</h2>
      </DashboardCardHeader>
      <ul className="divide-y">
        {coaches.map((coach) => (
          <li key={coach.coachId} className="grid gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{coach.name}</p>
              <Button type="button" variant="ghost" disabled={busy === coach.coachId} onClick={() => setRemoving(coach)}>
                Remove
              </Button>
            </div>
            <SettingsSwitchRow
              id={`coach-photos-${coach.coachId}`}
              checked={coach.photosAllowed}
              disabled={busy === coach.coachId}
              onCheckedChange={(allowed) => void run(coach, { action: "photos", allowed })}
              label="Let them see my before and after photos"
            />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={`Remove ${removing?.name ?? "this coach"}?`}
        description="They stop seeing your programs, workouts and photos straight away. They can ask again later."
        confirmLabel="Remove coach"
        destructive
        loading={busy !== null}
        onConfirm={() => removing && void run(removing, { action: "remove" })}
      />
    </Card>
  )
}

type ClientSort = "name" | "status"

const CLIENT_COLUMNS: TableHeaderColumn<ClientSort>[] = [
  { key: "name", label: "Client", column: "main", className: "min-w-40" },
  { key: "status", label: "Status", column: "meta" },
]

function clientStatus(client: CoachClient) {
  return client.accepted ? (client.photosAllowed ? "Linked, photos on" : "Linked") : "Waiting for an answer"
}

/** A coach's clients. Each row opens that client's Programs dashboard. */
function ClientsTable({ clients }: { clients: CoachClient[] }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [inviting, setInviting] = React.useState(false)
  const [removing, setRemoving] = React.useState<CoachClient[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<ClientSort>("name")
  const selection = useSelection()

  const shown = React.useMemo(() => {
    const order = direction === "asc" ? 1 : -1
    const value = (client: CoachClient) => (sort === "name" ? client.name.toLowerCase() : clientStatus(client))
    return [...clients].sort((a, b) => value(a).localeCompare(value(b)) * order)
  }, [clients, sort, direction])
  const visibleIds = shown.map((client) => client.userId)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.selected.has(id))
  const someSelected = visibleIds.some((id) => selection.selected.has(id))

  async function remove(targets: CoachClient[]) {
    setBusy(true)
    try {
      const { done, kept } = await changeClients({
        action: "removeClients",
        clientIds: targets.map((client) => client.userId),
      })
      const line = describeBulkResult({ done: done.length, kept: kept.length, one: "client", many: "clients", verb: "removed" })
      if (kept.length) toast.error(line)
      else toast.success(targets.length === 1 ? `${targets[0].name} removed.` : line)
      setRemoving(null)
      selection.clear()
      if (done.length) await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Clients"
        icon={<UsersIcon />}
        count={clients.length}
        busy={busy}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setRemoving(clients.filter((client) => selection.selected.has(client.userId)))}
              >
                <Trash2Icon className="size-4" />
                Remove ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton type="button" onClick={() => setInviting(true)}>
              <UserPlusIcon className="size-4" />
              Invite client
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={CLIENT_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="clients"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={
              <>
                <TableHead column="meta" className="hidden sm:table-cell">
                  Email
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </>
            }
          />
        }
        isEmpty={clients.length === 0}
        emptyText="No clients yet. A client needs an account first, then you invite them by email."
        emptyColSpan={5}
        footer={{ type: "summary", count: clients.length, label: plural(clients.length, "client") }}
      >
        {shown.map((client) => {
          const open = client.accepted
            ? () => void navigate({ to: "/programs", search: { person: client.userId } })
            : undefined
          return (
            <TableRow key={client.userId} className="group" rowAction={open}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(client.userId)}
                  onCheckedChange={() => selection.toggle(client.userId)}
                  aria-label={`Select ${client.name}`}
                />
              </TableCell>
              <TableCell column="main">
                {open ? (
                  <button type="button" className="text-left text-sm font-medium group-hover:underline" onClick={open}>
                    {client.name}
                  </button>
                ) : (
                  <span className="text-sm font-medium">{client.name}</span>
                )}
              </TableCell>
              <TableCell column="meta">
                <Badge variant={client.accepted ? "secondary" : "outline"}>{clientStatus(client)}</Badge>
              </TableCell>
              <TableCell column="meta" className="hidden sm:table-cell">
                {client.email}
              </TableCell>
              <TableCell column="actions">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${client.name}`}
                      onClick={() => setRemoving([client])}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <InviteClientDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null)
        }}
        title={
          removing && removing.length === 1 ? `Remove ${removing[0].name}?` : `Remove ${removing?.length ?? 0} clients?`
        }
        description="You stop seeing their programs, workouts and photos straight away. They keep everything."
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
      />
    </>
  )
}
