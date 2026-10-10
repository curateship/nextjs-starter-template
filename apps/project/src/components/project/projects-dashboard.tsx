import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { NewProjectDialog } from "@/components/project/new-project-dialog"
import { ProjectDot } from "@/components/project/task-bits"
import { InvitesForMe, TeamStart } from "@/components/project/team-start"
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
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  archiveProjects,
  type ProjectListRow,
  type ProjectsPage,
} from "@/lib/api/project/projects"
import type { InviteForMe } from "@/lib/api/project/teams"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "name" | "open" | "stuck" | "members"
type Group = "active" | "archived"

const COLUMNS: SortableColumn<Column>[] = [
  { key: "name", label: "Project", column: "main", className: "min-w-0 md:min-w-72" },
  { key: "open", label: "Open tasks", column: "preview" },
  { key: "stuck", label: "Stuck", column: "preview" },
  { key: "members", label: "Members", column: "preview" },
]

const openTasks = (row: ProjectListRow) => row.counts.todo + row.counts.doing + row.counts.stuck

export function ProjectsDashboard({
  page,
}: {
  page: ProjectsPage & { invites: InviteForMe[] }
}) {
  if (!page.team) return <TeamStart invites={page.invites} />
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      {page.invites.length ? <InvitesForMe invites={page.invites} /> : null}
      <ProjectsTable projects={page.projects} />
    </div>
  )
}

function ProjectsTable({ projects }: { projects: ProjectListRow[] }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [group, setGroup] = React.useState<Group>("active")
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<Column>("name")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  const counts = {
    active: projects.filter((p) => !p.archived).length,
    archived: projects.filter((p) => p.archived).length,
  }

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = query.trim().toLowerCase()
    const valueOf = (row: ProjectListRow) =>
      sort === "open" ? openTasks(row) : sort === "stuck" ? row.counts.stuck : row.memberCount
    return projects
      .filter((row) => row.archived === (group === "archived"))
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name) * sign
        return (valueOf(a) - valueOf(b)) * sign || a.name.localeCompare(b.name)
      })
  }, [direction, group, projects, query, sort])

  const { visible, footer } = useClientPage(
    rows,
    config.dashboardRowsPerPage,
    `${group}|${query}|${sort}|${direction}`
  )
  const visibleIds = visible.map((row) => row.id)
  useClearSelectionOnListChange(selection.setSelected, `${group}|${query}`)

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
            <DashboardToolbarSearch
              name="project-search"
              aria-label="Search projects by name"
              placeholder="Search projects…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New project
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
                noun="projects"
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
              : "No projects yet. Make one with New project."
        }
        emptyColSpan={6}
        footer={footer}
      >
        {visible.map((row) => {
          const open = () =>
            void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })
          return (
            <TableRow key={row.id} className="group" rowAction={open}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={() => selection.toggle(row.id)}
                  aria-label={`Select ${row.name}`}
                />
              </TableCell>
              <TableCell column="main">
                <span className="flex min-w-0 items-center gap-2">
                  <ProjectDot color={row.color} />
                  <span className="truncate font-medium">{row.name}</span>
                </span>
              </TableCell>
              <TableCell column="preview">{openTasks(row)}</TableCell>
              <TableCell column="preview">{row.counts.stuck}</TableCell>
              <TableCell column="preview">{row.memberCount}</TableCell>
              <TableCell column="actions">
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
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
