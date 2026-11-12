import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { SKY_COVER } from "@/lib/notes/page-cover"
import {
  ArrowUpRightIcon,
  BanIcon,
  EyeIcon,
  FolderOpenIcon,
  PauseIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { NewProjectDialog } from "@/components/social/projects/project-dialogs"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell } from "@/components/ui/table"
import {
  getProjectErrorMessage,
  loadProject,
  pauseProject,
  pinProject,
  removeProjects,
  type ProjectRow,
  type ProjectView,
} from "@/lib/api/social/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { NETWORK_NAMES } from "@/lib/social/networks"
import type { ProjectsSearch } from "@/lib/social/projects-dashboard-search"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "name" | "accounts" | "posts" | "last"

const time = (value: Date | string | null) => (value ? new Date(value).getTime() : 0)

/**
 * The Projects section (Tyler, 12 Nov 2026): every project, pinned ones
 * first, in the dashboard's one header and table shape. Each row has its
 * name and the first line of what it makes, its accounts, its own posts that
 * went out and when the newest did, and the red bans mark (Bans task, part
 * 18). Pressing a row, or its name, opens the project's own page, where its
 * posting and commenting happen; the eye in its actions column shows its
 * summary on the right, with Open project at its foot, and the bin deletes it
 * after asking (Tyler, 12 Nov 2026).
 */
export function ProjectsSectionList({
  projects,
  search,
  projectId,
  frame,
}: {
  projects: ProjectRow[]
  search: ProjectsSearch
  /** The project picked in the Projects block: the table shows only its row. */
  projectId: string
  frame: CrmFrame
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const [sort, setSort] = React.useState<Column>("name")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "name" ? "asc" : "desc")
    }
  }
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<ProjectRow[] | null>(null)
  const closingDeleting = useLastValue(deleting)
  const shownDeleting = deleting ?? closingDeleting
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = q.trim().toLowerCase()
    return projects
      .filter((project) => !projectId || project.id === projectId)
      .filter((project) => !needle || `${project.name} ${project.description}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        // Pinned projects come first whatever the sort, as in Project.
        const pins = Number(b.pinned) - Number(a.pinned)
        if (pins) return pins
        if (sort === "accounts") return (a.accountCount - b.accountCount) * sign || a.name.localeCompare(b.name)
        if (sort === "posts") return (a.postCount - b.postCount) * sign || a.name.localeCompare(b.name)
        if (sort === "last") return (time(a.lastPostAt) - time(b.lastPostAt)) * sign || a.name.localeCompare(b.name)
        return a.name.localeCompare(b.name) * sign
      })
  }, [direction, projectId, projects, q, sort])
  const ids = rows.map((project) => project.id)
  const openId = search.open
  const openProject = projects.find((project) => project.id === openId) ?? null

  // The right panel is never left empty: a search that leaves the open
  // project out of the list opens the list's first row instead.
  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((project) => project.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  useClearSelectionOnListChange(selection.setSelected, `${q}|${projectId}`)
  const selected = projects.filter((project) => selection.selected.has(project.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const goToProject = (id: string) => void navigate({ to: "/admin/projects/$projectId", params: { projectId: id } })

  /** Deletes the empty ones and keeps any that still hold accounts or keywords, saying what each holds. */
  async function remove(list: ProjectRow[]) {
    const ok = await run(async () => {
      const { kept } = await removeProjects(list.map((project) => project.id))
      if (kept.length) showErrorToast(kept.map((one) => one.reason).join(" "))
      selection.setSelected(new Set(kept.map((one) => one.id)))
      await router.invalidate()
    })
    if (ok) setDeleting(null)
  }

  const pin = (project: ProjectRow) =>
    void run(async () => {
      await pinProject(project.id, !project.pinned)
      await router.invalidate()
    })

  /** What a project can do, for its right-click menu and its ⋮ on the right. */
  const actionsFor = (project: ProjectRow): RowMenuItem[] => [
    { label: "Open project", icon: <ArrowUpRightIcon className="size-4" />, onSelect: () => goToProject(project.id) },
    {
      label: project.pinned ? "Unpin" : "Pin",
      icon: project.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />,
      onSelect: () => pin(project),
    },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting([project]) },
  ]

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
<MiddleHeading icon={FolderOpenIcon} label="Projects" />
        }
        end={<PanelReopenButton side="right" label="Show the project" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    setDeleting(selected)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for projects"
        search={{
          name: "project-search",
          label: "Search projects by name or description",
          placeholder: "Search projects",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        primary={
          <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New project</span>
          </DashboardToolbarButton>
        }
      />
      <CrmTable<Column>
        columns={[
          { key: "name", label: "Project", column: "main", className: "min-w-40" },
          { key: "accounts", label: "Accounts", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "posts", label: "Posts", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
          { key: "last", label: "Last post", column: "preview", className: "hidden md:hidden @lg:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions
        select={
          massSelect
            ? {
                noun: "projects",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : q
              ? "No projects match that search."
              : "No projects yet. A project is one thing you promote. Make one with New project."
        }
      >
        {rows.map((project) => (
          <CrmTableRow
            key={project.id}
            open={project.id === openId}
            label={project.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(project.id), onToggle: () => selection.toggle(project.id) }}
            // The name, or anywhere on the row, opens the project's own page; the
            // eye shows its summary on the right, and the bin deletes it (Tyler,
            // 12 Nov 2026: "clicking on the name goes straight to project. Add an
            // action col here with a preview icon ... and a delete icon").
            onOpen={() => goToProject(project.id)}
            cog={{ label: `Preview ${project.name}`, icon: <EyeIcon className="size-4" />, onPress: () => pick(project.id) }}
            onDelete={() => setDeleting([project])}
            onRightClick={(x, y) => setRightClick({ id: project.id, x, y })}
          >
            <MainCell
              name={project.name}
              lead={project.pinned ? <PinIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Pinned" /> : undefined}
            >
              {project.bannedRecently ? (
                <Chip className="shrink-0 whitespace-nowrap text-destructive">{project.bannedRecently} banned</Chip>
              ) : null}
            </MainCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
              {project.accountCount}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
              {project.postCount}
            </TableCell>
            <TableCell column="preview" className="hidden md:hidden @lg:table-cell">
              {project.lastPostAt ? postedDateText(new Date(project.lastPostAt)) : <span className="text-muted-foreground">Never</span>}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const project = projects.find((each) => each.id === rightClick.id)
            return project ? actionsFor(project) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${q}|${projectId}`,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Project",
      showLabel: "Show the project",
      content: openProject ? (
        <ProjectSummary
          key={openProject.id}
          row={openProject}
          busy={busy}
          actions={actionsFor(openProject)}
          onOpenProject={() => goToProject(openProject.id)}
          onChanged={() => router.invalidate()}
        />
      ) : (
        <EmptyRecord
          title="Project"
          icon={<FolderOpenIcon aria-hidden />}
          line={projects.length ? "Click a project to see it here." : "Make a project with New project to see it here."}
          hideLabel="Hide the project"
        />
      ),
    },
    windows: (
      <>
        <NewProjectDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false)
            await router.invalidate()
            setOpen(id)
          }}
        />
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title={
            shownDeleting && shownDeleting.length === 1
              ? `Delete ${shownDeleting[0].name}?`
              : `Delete ${shownDeleting?.length ?? 0} projects?`
          }
          description="A project that still holds accounts or keywords is kept, and says what it holds. Nothing is deleted along with a project."
          confirmLabel="Delete"
          destructive
          loading={busy}
          onConfirm={() => {
            if (deleting) void remove(deleting)
          }}
        />
      </>
    ),
  })
}

/**
 * One project on the right: its picture and what it makes, its networks
 * with what needs you on each, and its Archive. The ⋮ holds Pin, Pause and
 * Delete; Open project at the foot leads to the project's own page.
 */
function ProjectSummary({
  row,
  busy,
  actions,
  onOpenProject,
  onChanged,
}: {
  row: ProjectRow
  busy: boolean
  actions: RowMenuItem[]
  onOpenProject: () => void
  onChanged: () => Promise<unknown>
}) {
  const view = useLoad(() => loadProject(row.id), getProjectErrorMessage, { keys: [row.id] })
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [pausing, setPausing] = React.useState(false)
  const project = view.data?.project ?? null
  const paused = Boolean(project?.pausedAt)

  async function togglePause() {
    setPausing(true)
    try {
      await pauseProject(row.id, !paused)
      view.retry()
      await onChanged()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setPausing(false)
    }
  }

  const runAction = (action: RowMenuItem) => () => {
    setMenuOpen(false)
    action.onSelect()
  }

  return (
    <RecordFrame
      avatar={
        row.pinned ? <PinIcon aria-hidden className="fill-amber-400 text-amber-500" /> : <FolderOpenIcon aria-hidden />
      }
      title={row.name}
      line={paused ? "Paused" : row.pinned ? "Pinned" : null}
      hideLabel="Hide the project"
      actions={
        <TabbedMenu
          label="Project menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid p-3">
                  {actions
                    .filter((action) => !action.destructive && action.label !== "Open project")
                    .map((action) => (
                      <ActionRow key={action.label} icon={action.icon} disabled={busy} onClick={runAction(action)}>
                        {action.label}
                      </ActionRow>
                    ))}
                  <ActionRow
                    icon={paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
                    disabled={pausing || !project}
                    onClick={() => {
                      setMenuOpen(false)
                      void togglePause()
                    }}
                  >
                    {paused ? "Resume this project" : "Pause this project"}
                  </ActionRow>
                  <div aria-hidden className="-mx-3 my-1.5 border-t" />
                  {actions
                    .filter((action) => action.destructive)
                    .map((action) => (
                      <ActionRow key={action.label} destructive icon={action.icon} disabled={busy} onClick={runAction(action)}>
                        {action.label}
                      </ActionRow>
                    ))}
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-3.75">
          {view.error ? (
            <ErrorRow message={view.error} onRetry={view.retry} />
          ) : !view.data || !project ? (
            <LoadingRow label="Opening the project…" />
          ) : (
            <>
              {/* A picture cover shows; the drawn sky is the project page's own. */}
              {project.imageUrl && project.imageUrl !== SKY_COVER ? (
                <img src={project.imageUrl} alt="" className="aspect-[16/9] w-full rounded-xl object-cover" />
              ) : null}
              {row.description ? (
                <p className="text-sm whitespace-pre-line">{row.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description yet. Open the project to write what you make.</p>
              )}
              <PickGroup title="Networks">
                {project.networks.length ? (
                  project.networks.map((network) => (
                    <NetworkLine key={network} name={NETWORK_NAMES[network]} view={view.data!} network={network} />
                  ))
                ) : (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">No networks yet.</p>
                )}
              </PickGroup>
              <PickGroup title="Archive">
                <FactLine label="Items" value={project.archiveCount.toLocaleString()} />
              </PickGroup>
              {project.bannedRecently ? (
                <Link
                  to="/admin/bans"
                  search={{ project: row.id, since: 30 }}
                  className="flex w-fit items-center gap-1 text-xs text-destructive hover:underline"
                >
                  <BanIcon className="size-3" aria-hidden="true" />
                  {project.bannedRecently} {project.bannedRecently === 1 ? "account" : "accounts"} banned in the last 30 days
                </Link>
              ) : null}
            </>
          )}
        </div>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">
              {row.accountCount} {row.accountCount === 1 ? "account" : "accounts"}
            </span>
          </FooterState>
          <Button type="button" onClick={onOpenProject}>
            Open project
            <ArrowUpRightIcon />
          </Button>
        </>
      }
    />
  )
}

/** A network's line: what needs you on its posts and what is waiting on its commenting. */
function NetworkLine({ name, view, network }: { name: string; view: ProjectView; network: keyof typeof NETWORK_NAMES }) {
  const needYou = view.postCounts?.[network] ?? 0
  const toAnswer = view.networkCounts?.[network] ?? 0
  const paused = view.project.pausedNetworks.includes(network)
  const words = [needYou ? `${needYou} need you` : "", toAnswer ? `${toAnswer} to answer` : ""].filter(Boolean).join(" · ")
  return <FactLine label={name} value={paused ? "Paused" : words || "Nothing waiting"} muted={!words || paused} />
}

/** A name on the left and its value on the right; in a narrow panel the value gives way, never the name. */
function FactLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={muted ? "ml-auto min-w-0 truncate text-right text-muted-foreground/70" : "ml-auto min-w-0 truncate text-right"}>{value}</span>
    </div>
  )
}
