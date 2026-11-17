import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react"

import { CopyProjectDialog } from "@/components/project/copy-project-dialog"
import { NewProjectDialog } from "@/components/project/new-project-dialog"
import { ProjectPaceMark } from "@/components/project/project-pace"
import { ProjectProgress } from "@/components/project/project-progress"
import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { PinButton } from "@/components/project/pin-button"
import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { FilterRow } from "@/components/project/task-filter-popover"
import { TeamStart } from "@/components/project/team-start"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { FilterPopover } from "@/components/shared/filter-popover"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { TableCell, TableGroupRow, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  archiveProjects,
  type ProjectListRow,
  type ProjectPage,
  type ProjectsPage,
} from "@/lib/api/project/projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { clientChoices, matchesClient, NO_CLIENT_FILTER } from "@/lib/project/clients"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { type ProjectsFilter, useRememberedProjectsFilter } from "@/lib/project/projects-filter"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { runsTheTeam } from "@/lib/project/rules"
import { TeamScope } from "@/lib/project/team-scope"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "name" | "team" | "progress" | "status" | "lead" | "open"
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
]

const openTasks = (row: ProjectListRow) => row.counts.todo + row.counts.doing + row.counts.stuck

/** Sorting by status puts Behind first, then the most late tasks; a "Just me" list has no status and goes last. */
const PACE_RANK = { behind: 3, slowing: 2, on_track: 1 } as const

/** The status from late tasks, counted on the reader's own clock. */
function paceOf(row: ProjectListRow) {
  if (row.personal) return null
  const late = countLate(row.dated)
  return { late, pace: projectPace(late, row) }
}

function paceRank(row: ProjectListRow) {
  const pace = paceOf(row)
  return pace ? PACE_RANK[pace.pace] * 1000 + pace.late : 0
}

const ALL_TEAMS = "all"
const ALL_CLIENTS = "all"
// "-" as in the address, so the choice and the address read the same.
const NO_CLIENT = NO_CLIENT_FILTER
const NO_CLIENT_LABEL = "No client"
const ALL_CATEGORIES = "all"
const NO_CATEGORY = NO_CLIENT_FILTER

/**
 * The names offered and the one to show as picked. A pick spelled with other
 * capitals shows as the name in the list; one no project has any more (a
 * remembered filter or a pasted link) is added, so the choice never reads
 * blank and can still be cleared.
 */
function choicesWith(names: readonly string[], picked: string, all: string) {
  if (picked === all || picked === NO_CLIENT_FILTER) return { names, value: picked }
  const known = names.find((name) => matchesClient(name, picked))
  return known ? { names, value: known } : { names: [...names, picked], value: picked }
}

/** Clients A to Z, then "No client" last. */
function compareClients(a: string | null, b: string | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

export function ProjectsDashboard({
  page,
  settings,
  filter,
  onFilter,
  onSettings,
}: {
  page: ProjectsPage
  /** The project whose settings window is open (`?settings=<id>`), loaded by the route. */
  settings: ProjectPage | null
  /** Filter's choices, kept in the address and remembered by this browser. */
  filter: ProjectsFilter
  /** Changes some of them; an undefined value clears that one. */
  onFilter: (patch: ProjectsFilter) => void
  /** Opens a project's settings window, or shuts it with null; done once it has loaded. */
  onSettings: (projectId: string | null) => Promise<void>
}) {
  if (page.siteAdmin ? page.teams.length === 0 : !page.team) return <TeamStart />
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <ProjectsTable
        projects={page.projects}
        siteAdmin={page.siteAdmin || (page.team ? runsTheTeam(page.team.myRole) : false)}
        teams={page.siteAdmin ? page.teams : []}
        teamFilter={page.teamFilter}
        filter={filter}
        onFilter={onFilter}
        onSettings={onSettings}
      />
      {settings ? (
        // The same window as the project page's cog, over the table (Tyler, 19 Oct 2026).
        <TeamScope teamId={settings.project.teamId}>
          <ProjectSettingsDialog page={settings} open onClose={() => void onSettings(null)} />
        </TeamScope>
      ) : null}
    </div>
  )
}

/**
 * Making, copying and archiving projects are the site admin's alone (Tyler,
 * 16 Oct 2026: "only I create projects"), so employees get the list to read
 * and open, with pins.
 */
function ProjectsTable({
  projects,
  siteAdmin,
  teams,
  teamFilter,
  filter,
  onFilter,
  onSettings,
}: {
  projects: ProjectListRow[]
  siteAdmin: boolean
  /** Every team, for the site admin; empty for an employee, who has one. */
  teams: { id: string; name: string }[]
  teamFilter: string | null
  filter: ProjectsFilter
  onFilter: (patch: ProjectsFilter) => void
  onSettings: (projectId: string) => Promise<void>
}) {
  const columns = [NAME_COLUMN, ...(teams.length ? [TEAM_COLUMN] : []), ...OTHER_COLUMNS]
  const navigate = useNavigate()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [group, setGroup] = React.useState<Group>("active")
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [copyingRow, setCopyingRow] = React.useState<ProjectListRow | null>(null)
  // The cog spins until the project's settings have loaded and their window opens.
  const [opening, setOpening] = React.useState<string | null>(null)
  const client = filter.client ?? ALL_CLIENTS
  const category = filter.category ?? ALL_CATEGORIES
  const byClient = filter.group === "client"
  const onTeamFilter = (team: string | null) => onFilter({ team: team ?? undefined })
  const setClient = (value: string) => onFilter({ client: value === ALL_CLIENTS ? undefined : value })
  const setCategory = (value: string) => onFilter({ category: value === ALL_CATEGORIES ? undefined : value })
  const setByClient = (on: boolean) => onFilter({ group: on ? "client" : undefined })
  useRememberedProjectsFilter(filter, onFilter)
  // Grouping is not a filter, so it adds nothing to the count.
  const filterCount = [teamFilter !== null, client !== ALL_CLIENTS, category !== ALL_CATEGORIES].filter(Boolean).length
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

  // One list for the whole site, matched as client names are.
  const categories = React.useMemo(() => clientChoices(projects.map((row) => row.category)), [projects])
  const clientChoice = choicesWith(clients, client, ALL_CLIENTS)
  const categoryChoice = choicesWith(categories, category, ALL_CATEGORIES)

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = query.trim().toLowerCase()
    const valueOf = (row: ProjectListRow) =>
      sort === "progress"
        ? row.counts.done / Math.max(1, openTasks(row) + row.counts.done)
        : sort === "status"
          ? paceRank(row)
          : openTasks(row)
    return projects
      .filter((row) => row.archived === (group === "archived"))
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .filter((row) =>
        client === ALL_CLIENTS ? true : matchesClient(row.client, client)
      )
      .filter((row) =>
        category === ALL_CATEGORIES ? true : matchesClient(row.category, category)
      )
      .sort((a, b) => {
        // Grouped by client, the groups come first, then pinned projects inside each.
        if (byClient) {
          const byGroup = compareClients(a.client, b.client)
          if (byGroup) return byGroup
        }
        // Pinned projects come first whatever the sort, as each person's own shortcut.
        if (a.starred !== b.starred) return a.starred ? -1 : 1
        if (sort === "name") return a.name.localeCompare(b.name) * sign
        if (sort === "team") return a.team.name.localeCompare(b.team.name) * sign || a.name.localeCompare(b.name)
        if (sort === "lead") {
          return (a.lead?.name ?? "").localeCompare(b.lead?.name ?? "") * sign || a.name.localeCompare(b.name)
        }
        return (valueOf(a) - valueOf(b)) * sign || a.name.localeCompare(b.name)
      })
  }, [byClient, category, client, direction, group, projects, query, sort])

  const { visible, footer } = useClientPage(
    rows,
    config.dashboardRowsPerPage,
    `${group}|${query}|${client}|${category}|${byClient}|${sort}|${direction}`
  )
  // A "Just me" list can't be archived, so it can't be ticked either.
  const visibleIds = siteAdmin ? visible.filter((row) => !row.personal).map((row) => row.id) : []
  // The team filter too: ticks on another team's rows would be archived unseen.
  useClearSelectionOnListChange(selection.setSelected, `${group}|${query}|${client}|${category}|${teamFilter}`)

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
            {/* Team, Client and Category sit in one Filter, as on the other dashboards (Tyler, 16 Nov 2026:
                "change the 2 dropdown into a filter instead"). Shown while there is something to pick or
                something is still set, so it can be turned off. */}
            {teams.length || clients.length || categories.length || filterCount || byClient ? (
              <FilterPopover
                contentClassName="w-72"
                count={filterCount}
                onClear={() =>
                  onFilter({ team: undefined, client: undefined, category: undefined, group: undefined })
                }
                save={null}
              >
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                  {teams.length ? (
                    <FilterRow id="projects-filter-team" label="Team">
                      <Select
                        value={teamFilter ?? ALL_TEAMS}
                        onValueChange={(value) => onTeamFilter(value === ALL_TEAMS ? null : value)}
                      >
                        <SelectTrigger id="projects-filter-team" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterRow>
                  ) : null}
                  {clients.length || client !== ALL_CLIENTS ? (
                    <FilterRow id="projects-filter-client" label="Client">
                      <Select value={clientChoice.value} onValueChange={setClient}>
                        <SelectTrigger id="projects-filter-client" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[ALL_CLIENTS, ...clientChoice.names, NO_CLIENT].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value === ALL_CLIENTS ? "All clients" : value === NO_CLIENT ? NO_CLIENT_LABEL : value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterRow>
                  ) : null}
                  {/* Tyler, 2 Nov 2026: "Add category selection and creation for projects and add the filter dropdown". */}
                  {categories.length || category !== ALL_CATEGORIES ? (
                    <FilterRow id="projects-filter-category" label="Category">
                      <Select value={categoryChoice.value} onValueChange={setCategory}>
                        <SelectTrigger id="projects-filter-category" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[ALL_CATEGORIES, ...categoryChoice.names, NO_CATEGORY].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value === ALL_CATEGORIES ? "All categories" : value === NO_CATEGORY ? "No category" : value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterRow>
                  ) : null}
                </div>
                {/* Group by client was the last row of the client dropdown (Tyler, 19 Oct 2026); it is
                    Filter's Group row now, as on the task dashboards. */}
                {clients.length || byClient ? (
                  <>
                    <Separator className="-mx-3 w-auto" />
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3">
                      <FilterRow id="projects-filter-group" label="Group">
                        <Select
                          value={byClient ? "client" : "none"}
                          onValueChange={(value) => setByClient(value === "client")}
                        >
                          <SelectTrigger id="projects-filter-group" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No grouping</SelectItem>
                            <SelectItem value="client">By client</SelectItem>
                          </SelectContent>
                        </Select>
                      </FilterRow>
                    </div>
                  </>
                ) : null}
              </FilterPopover>
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
          query || filterCount
            ? "No projects match that search or filter."
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
          const pace = paceOf(row)
          return (
            <React.Fragment key={row.id}>
            {groupStarts ? (
              <TableGroupRow
                colSpan={columns.length + 2}
                label={<span className="text-muted-foreground">{row.client ?? NO_CLIENT_LABEL}</span>}
              />
            ) : null}
            {/* A pinned row is yellow, so the pins at the top read as a group (Tyler, 19 Oct 2026). */}
            <TableRow
              className={cn("group", row.starred && "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/15")}
              rowAction={open}
            >
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
                <ProjectProgress counts={row.counts} />
              </TableCell>
              <TableCell column="preview">
                {pace ? <ProjectPaceMark pace={pace.pace} late={pace.late} /> : null}
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
              <TableCell column="actions">
                <PinButton project={row} />
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
                    {/* Settings last, as the shell's tables end their rows (Tyler, 19 Oct 2026). */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${row.name} settings`}
                      disabled={opening !== null}
                      onClick={() => {
                        setOpening(row.id)
                        void onSettings(row.id).finally(() => setOpening(null))
                      }}
                    >
                      {opening === row.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <SettingsIcon className="size-4" />
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
