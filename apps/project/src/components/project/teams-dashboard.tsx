import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon, UsersIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { TeamSettingsDialog } from "@/components/project/team-settings-dialog"
import { useCreateTeam } from "@/components/project/use-create-team"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SortableTableHeader, type SortableColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { FormDialog } from "@/components/ui/form-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { deleteProjectTeam, type TeamDashboard, type TeamListRow } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TeamScope } from "@/lib/project/team-scope"

type Column = "name" | "people" | "projects" | "checkin"

const COLUMNS: SortableColumn<Column>[] = [
  { key: "name", label: "Team", column: "main" },
  { key: "people", label: "People", column: "preview" },
  { key: "projects", label: "Projects", column: "preview" },
  { key: "checkin", label: "Check-in", column: "preview" },
]

function compare(a: TeamListRow, b: TeamListRow, column: Column) {
  switch (column) {
    case "people":
      return a.people - b.people
    case "projects":
      return a.openProjects - b.openProjects || a.archivedProjects - b.archivedProjects
    case "checkin":
      return a.checkinTime.localeCompare(b.checkinTime)
    default:
      return a.name.localeCompare(b.name)
  }
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The site admin's Teams dashboard (Tyler, 19 Oct 2026: "There should be a
 * team dashboard to create, edit and delete teams and there should be no team
 * dropdown in the navigation"). A row opens that team's own dashboard; its cog
 * opens the team's settings and its bin deletes it, which is refused while the
 * team still has people or open projects.
 */
export function TeamsDashboard({
  teams,
  settings,
}: {
  teams: TeamListRow[]
  /** The team whose settings window is open (`?settings=<id>`), loaded by the route. */
  settings: TeamDashboard | null
}) {
  const navigate = useNavigate()
  const { sort, direction, toggleSort } = useTableSort<Column>("name")
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<TeamListRow | null>(null)
  // The cog spins until the team's settings have loaded and their window opens.
  const [opening, setOpening] = React.useState<string | null>(null)
  const openSettings = (teamId: string | undefined) =>
    void navigate({ to: "/teams", search: teamId ? { settings: teamId } : {} }).finally(() => setOpening(null))

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    return [...teams].sort((a, b) => compare(a, b, sort) * sign || a.name.localeCompare(b.name))
  }, [direction, sort, teams])

  return (
    <>
      <DashboardTable
        title="Teams"
        icon={<UsersIcon />}
        count={teams.length}
        controls={
          <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            New team
          </DashboardToolbarButton>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={teams.length === 0}
        emptyText="No teams yet. Make one with New team."
        emptyColSpan={COLUMNS.length + 1}
        footer={{ type: "summary", count: teams.length, label: "teams" }}
      >
        {rows.map((team) => {
          const open = () => void navigate({ to: "/teams/$teamId", params: { teamId: team.id } })
          return (
            <TableRow key={team.id} className="group" rowAction={open}>
              <TableCell column="main">
                <span className="flex min-w-0 items-center gap-2">
                  <PersonAvatar name={team.name} avatarUrl={team.avatarUrl ?? undefined} />
                  <span className="truncate font-medium">{team.name}</span>
                </span>
              </TableCell>
              <TableCell column="preview">{team.people}</TableCell>
              <TableCell column="preview">
                {team.openProjects}
                {team.archivedProjects ? (
                  <span className="text-muted-foreground"> · {team.archivedProjects} archived</span>
                ) : null}
              </TableCell>
              <TableCell column="preview">
                {team.checkinTime}
                <span className="text-muted-foreground"> · {team.timeZone}</span>
              </TableCell>
              <TableCell column="actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${team.name} settings`}
                  onClick={() => {
                    setOpening(team.id)
                    openSettings(team.id)
                  }}
                >
                  {opening === team.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SettingsIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${team.name}`}
                  className="hover:text-destructive"
                  onClick={() => setDeleting(team)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <NewTeamDialog open={creating} onClose={() => setCreating(false)} />
      {settings ? (
        <TeamScope teamId={settings.team.id}>
          <TeamSettingsDialog
            team={settings.team}
            labels={settings.labels}
            stepLists={settings.stepLists}
            templates={settings.templates}
            joinLink={settings.joinLink}
            holidays={settings.holidays}
            canEdit
            open
            onClose={() => openSettings(undefined)}
          />
        </TeamScope>
      ) : null}
      {deleting ? <DeleteTeam team={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  )
}

function NewTeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const team = useCreateTeam(onClose)
  return (
    <FormDialog open={open} dirty={team.dirty} busy={team.busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>You run it without being on it.</DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void team.create(event)}>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Team</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">{team.fields}</CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={team.busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={team.busy}>
                {team.busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create team
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Asks before deleting an empty team. A team with people or open projects
 * can't go, so the window says what is left and links to where it is moved.
 */
function DeleteTeam({ team, onClose }: { team: TeamListRow; onClose: () => void }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  if (team.people || team.openProjects) {
    const left = [
      team.people ? plural(team.people, "person", "people") : null,
      team.openProjects ? plural(team.openProjects, "open project", "open projects") : null,
    ].filter(Boolean)
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{team.name} can't be deleted yet</DialogTitle>
            <DialogDescription>
              It still has {left.join(" and ")}. Remove the people and archive the projects first,
              so no live work goes with the team.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-2 text-sm">
                {team.people ? (
                  <Link
                    to="/teams/$teamId/members"
                    params={{ teamId: team.id }}
                    className="underline-offset-4 hover:underline"
                  >
                    Remove its {plural(team.people, "person", "people")} on Members
                  </Link>
                ) : null}
                {team.openProjects ? (
                  <Link
                    to="/projects"
                    search={{ team: team.id }}
                    className="underline-offset-4 hover:underline"
                  >
                    Archive its {plural(team.openProjects, "open project", "open projects")} on Projects
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open || busy ? undefined : onClose())}
      title={`Delete ${team.name}?`}
      description={
        team.archivedProjects
          ? `It goes for good, with its ${plural(team.archivedProjects, "archived project", "archived projects")} and their tasks, check-ins, meetings, labels and task types. This can't be undone.`
          : "It goes for good, with its check-ins, meetings, labels and task types. This can't be undone."
      }
      confirmLabel="Delete team"
      loading={busy}
      onConfirm={() =>
        void run(() => deleteProjectTeam(team.id), `${team.name} deleted.`).then(async (ok) => {
          if (!ok) return
          onClose()
          await router.invalidate()
        })
      }
    />
  )
}
