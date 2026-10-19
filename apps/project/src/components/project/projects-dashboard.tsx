import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, ChevronDownIcon, CopyIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CopyProjectDialog } from "@/components/project/copy-project-dialog"
import { NewProjectDialog } from "@/components/project/new-project-dialog"
import { HealthWithInfo } from "@/components/project/project-health"
import { ProjectProgress } from "@/components/project/project-progress"
import { StarButton } from "@/components/project/star-button"
import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { TeamStart } from "@/components/project/team-start"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  archiveProjects,
  type ProjectListRow,
  type ProjectsPage,
} from "@/lib/api/project/projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { runsTheTeam } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "name" | "team" | "progress" | "status" | "lead" | "open" | "stuck" | "members"
type Group = "active" | "archived"

const NAME_COLUMN: SortableColumn<Column> = {
  key: "name",
  label: "Project",
  column: "main",
  className: "min-w-0 md:min-w-72",
}
/** The site admin sees every team's projects, so each row names its team. */
const TEAM_COLUMN: SortableColumn<Column> = { key: "team", label: "Team", column: "preview" }
const OTHER_COLUMNS: SortableColumn<Column>[] = [
  { key: "progress", label: "Progress", column: "preview" },
  { key: "status", label: "Status", column: "preview" },
  { key: "lead", label: "Lead", column: "preview" },
  { key: "open", label: "Open tasks", column: "preview" },
  { key: "stuck", label: "Stuck", column: "preview" },
  { key: "members", label: "Members", column: "preview" },
]

const openTasks = (row: ProjectListRow) => row.counts.todo + row.counts.doing + row.counts.stuck

/** Sorting by status puts the projects in most trouble first, and no status last. */
const HEALTH_RANK = { off_track: 3, at_risk: 2, on_track: 1 } as const

const ALL_TEAMS = "all"
const ALL_CLIENTS = "all"
const NO_CLIENT = "none"
const NO_CLIENT_LABEL = "No client"

/** Clients A to Z, then "No client" last. */
function compareClients(a: string | null, b: string | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

export function ProjectsDashboard({
  page,
  onTeamFilter,
}: {
  page: ProjectsPage
  /** The site admin's team filter, kept in the address; null is every team. */
  onTeamFilter: (teamId: string | null) => void
}) {
  if (page.siteAdmin ? page.teams.length === 0 : !page.team) return <TeamStart />
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <ProjectsTable
        projects={page.projects}
        siteAdmin={page.siteAdmin || (page.team ? runsTheTeam(page.team.myRole) : false)}
        teams={page.siteAdmin ? page.teams : []}
        teamFilter={page.teamFilter}
        onTeamFilter={onTeamFilter}
      />
    </div>
  )
}

/**
 * Making, copying and archiving projects are the site admin's alone (Tyler,
 * 16 Oct 2026: "only I create projects"), so employees get the list to read
 * and open, with stars.
 */
function ProjectsTable({
  projects,
  siteAdmin,
  teams,
  teamFilter,
  onTeamFilter,
}: {
  projects: ProjectListRow[]
  siteAdmin: boolean
  /** Every team, for the site admin; empty for an employee, who has one. */
  teams: { id: string; name: string }[]
  teamFilter: string | null
  onTeamFilter: (teamId: string | null) => void
}) {
  const columns = teams.length ? [NAME_COLUMN, TEAM_COLUMN, ...OTHER_COLUMNS] : [NAME_COLUMN, ...OTHER_COLUMNS]
  const navigate = useNavigate()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [group, setGroup] = React.useState<Group>("active")
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [copyingRow, setCopyingRow] = React.useState<ProjectListRow | null>(null)
  const [client, setClient] = React.useState<string>(ALL_CLIENTS)
  const clientLabel = client === ALL_CLIENTS ? "All clients" : client === NO_CLIENT ? NO_CLIENT_LABEL : client
  const [byClient, setByClient] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<Column>("name")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  const counts = {
    active: projects.filter((p) => !p.archived).length,
    archived: projects.filter((p) => p.archived).length,
  }

  const clients = React.useMemo(
    () =>
      [...new Set(projects.map((row) => row.client).filter((name): name is string => Boolean(name)))].sort(
        compareClients
      ),
    [projects]
  )

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = query.trim().toLowerCase()
    const valueOf = (row: ProjectListRow) =>
      sort === "progress"
        ? row.counts.done / Math.max(1, openTasks(row) + row.counts.done)
        : sort === "status"
          ? row.health ? HEALTH_RANK[row.health.value] : 0
          : sort === "open"
            ? openTasks(row)
            : sort === "stuck"
              ? row.counts.stuck
              : row.memberCount
    return projects
      .filter((row) => row.archived === (group === "archived"))
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .filter((row) =>
        client === ALL_CLIENTS ? true : client === NO_CLIENT ? !row.client : row.client === client
      )
      .sort((a, b) => {
        // Grouped by client, the groups come first, then stars inside each.
        if (byClient) {
          const byGroup = compareClients(a.client, b.client)
          if (byGroup) return byGroup
        }
        // Starred projects come first whatever the sort, as each person's own shortcut.
        if (a.starred !== b.starred) return a.starred ? -1 : 1
        if (sort === "name") return a.name.localeCompare(b.name) * sign
        if (sort === "team") return a.team.name.localeCompare(b.team.name) * sign || a.name.localeCompare(b.name)
        if (sort === "lead") {
          return (a.lead?.name ?? "").localeCompare(b.lead?.name ?? "") * sign || a.name.localeCompare(b.name)
        }
        return (valueOf(a) - valueOf(b)) * sign || a.name.localeCompare(b.name)
      })
  }, [byClient, client, direction, group, projects, query, sort])

  const { visible, footer } = useClientPage(
    rows,
    config.dashboardRowsPerPage,
    `${group}|${query}|${client}|${byClient}|${sort}|${direction}`
  )
  // A "Just me" list can't be archived, so it can't be ticked either.
  const visibleIds = siteAdmin ? visible.filter((row) => !row.personal).map((row) => row.id) : []
  // The team filter too: ticks on another team's rows would be archived unseen.
  useClearSelectionOnListChange(selection.setSelected, `${group}|${query}|${client}|${teamFilter}`)

  async function setArchived(ids: string[], archived: boolean) {
    let result = { done: [] as string[], kept: [] as string[] }
    const ok = await run(async () => {
      result = await archiveProjects(ids, archived)
    })
    if (!ok) return
    const line = describeBulkResult({
      done: result.done.length,
      kept: result.kept.length,
      one: "project",
      many: "projects",
      verb: archived ? "archived" : "brought back",
    })
    if (result.kept.length) showErrorToast(line)
    else toast.success(line)
    selection.clear()
    await router.invalidate()
  }

  const selectedIds = [...selection.selected]

  return (
    <>
      <DashboardTable
        title="Projects"
        count={rows.length}
        tabs={
          <Tabs value={group} onValueChange={(value) => setGroup(value as Group)}>
            <TabsList>
              <TabsTrigger value="active">
                Active <TabsCount>{counts.active}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="archived">
                Archived <TabsCount>{counts.archived}</TabsCount>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {/* Search first, then the rest (Tyler, 19 Oct 2026). */}
            <DashboardToolbarSearch
              name="project-search"
              aria-label="Search projects by name"
              placeholder="Search projects…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {selectedIds.length ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void setArchived(selectedIds, group === "active")}
              >
                {group === "active" ? (
                  <ArchiveIcon className="size-4" />
                ) : (
                  <ArchiveRestoreIcon className="size-4" />
                )}
                {group === "active" ? "Archive" : "Bring back"} ({selectedIds.length})
              </DashboardToolbarButton>
            ) : null}
            {teams.length ? (
              <Select
                value={teamFilter ?? ALL_TEAMS}
                onValueChange={(value) => onTeamFilter(value === ALL_TEAMS ? null : value)}
              >
                <DashboardToolbarSelectTrigger aria-label="Team">
                  <SelectValue />
                </DashboardToolbarSelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {/* Group by client sits in the client dropdown, under the clients (Tyler, 19 Oct 2026). */}
            {/* Kept while a client or grouping is on, so either can still be turned off. */}
            {clients.length || client !== ALL_CLIENTS || byClient ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <DashboardToolbarButton type="button" variant="outline" aria-label={`Client: ${clientLabel}`}>
                    {clientLabel}
                    <ChevronDownIcon className="size-4 text-muted-foreground" />
                  </DashboardToolbarButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {[ALL_CLIENTS, ...clients, NO_CLIENT].map((value) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={client === value}
                      onCheckedChange={() => setClient(value)}
                    >
                      {value === ALL_CLIENTS ? "All clients" : value === NO_CLIENT ? NO_CLIENT_LABEL : value}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={byClient}
                    // A setting, not a choice, so the menu stays open to show it changed.
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => setByClient(checked === true)}
                  >
                    Group by client
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {siteAdmin ? (
              <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
                <PlusIcon className="size-4" />
                New project
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
                noun="projects"
                disabled={visibleIds.length === 0}
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText={
          query
            ? "No projects match that search."
            : group === "archived"
              ? "No archived projects."
              : siteAdmin
                ? "No projects yet. Make one with New project."
                : "You aren't on any projects yet. The site admin adds you to them."
        }
        emptyColSpan={columns.length + 2}
        footer={footer}
      >
        {visible.map((row, index) => {
          const open = () =>
            void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })
          // A heading row starts each client's group, and the top of each page.
          const groupStarts = byClient && (index === 0 || visible[index - 1].client !== row.client)
          return (
            <React.Fragment key={row.id}>
            {groupStarts ? (
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={columns.length + 2} className="py-1.5 text-xs font-medium text-muted-foreground">
                  {row.client ?? NO_CLIENT_LABEL}
                </TableCell>
              </TableRow>
            ) : null}
            <TableRow className="group" rowAction={open}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  disabled={!siteAdmin || row.personal}
                  onCheckedChange={() => selection.toggle(row.id)}
                  aria-label={`Select ${row.name}`}
                />
              </TableCell>
              <TableCell column="main">
                <span className="flex min-w-0 items-center gap-2">
                  <ProjectDot color={row.color} />
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{row.name}</span>
                    {row.client && !byClient ? (
                      <span className="truncate text-xs text-muted-foreground">{row.client}</span>
                    ) : null}
                  </span>
                </span>
              </TableCell>
              {teams.length ? (
                <TableCell column="preview" className="truncate">
                  {row.team.name}
                </TableCell>
              ) : null}
              <TableCell column="preview">
                <ProjectProgress counts={row.counts} dueDate={row.dueDate} />
              </TableCell>
              <TableCell column="preview">
                {row.health ? <HealthWithInfo health={row.health} /> : null}
              </TableCell>
              <TableCell column="preview">
                {row.lead ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <PersonAvatar name={row.lead.name} avatarUrl={row.lead.avatarUrl} />
                    <span className="truncate">{row.lead.name}</span>
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="preview">{openTasks(row)}</TableCell>
              <TableCell column="preview">{row.counts.stuck}</TableCell>
              <TableCell column="preview">{row.memberCount}</TableCell>
              <TableCell column="actions">
                <StarButton project={row} />
                {siteAdmin && !row.personal ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${row.name}`}
                      onClick={() => setCopyingRow(row)}
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={row.archived ? `Bring back ${row.name}` : `Archive ${row.name}`}
                      disabled={busy}
                      onClick={() => void setArchived([row.id], !row.archived)}
                    >
                      {row.archived ? (
                        <ArchiveRestoreIcon className="size-4" />
                      ) : (
                        <ArchiveIcon className="size-4" />
                      )}
                    </Button>
                  </>
                ) : null}
              </TableCell>
            </TableRow>
            </React.Fragment>
          )
        })}
      </DashboardTable>
      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        teams={teams}
        startTeamId={teamFilter}
      />
      {copyingRow ? (
        <CopyProjectDialog project={copyingRow} open onClose={() => setCopyingRow(null)} />
      ) : null}
    </>
  )
}
