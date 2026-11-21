import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  EyeIcon,
  FilmIcon,
  FlameIcon,
  FolderInputIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import { CoverImage } from "@/components/viral/cover-image"
import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { ProjectPreview } from "@/components/viral/dashboard/project-preview"
import { NoMatches, useOpenFirstRow, type SectionProps } from "@/components/viral/dashboard/section-parts"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  addSampleViralProject,
  archiveViralProjectsFn,
  deleteViralProjectsFn,
  duplicateViralProjectFn,
  loadViralDeleteSummary,
  pinViralProjectFn,
  viralFolderApi,
  type ViralDeleteSummary,
} from "@/lib/api/viral/viral-projects"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount, type CreatorPlatform } from "@/lib/viral/creators"
import type { ViralProjectSort } from "@/lib/viral/dashboard-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/viral/project-folders"
import { countVideos, type ViralProjectItem } from "@/lib/viral/viral"

type Data = Extract<ViralLoaded, { section: "projects" }>

/** How often the list looks again while a project is searching. */
const SEARCHING_POLL_MS = 5000

function compare(a: ViralProjectItem, b: ViralProjectItem, column: ViralProjectSort) {
  switch (column) {
    case "videos":
      return a.result_count - b.result_count
    case "units":
      return a.units_spent - b.units_spent
    case "updated":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at)
    default:
      return a.name.localeCompare(b.name)
  }
}

/** "120 videos, 3 hidden channels and 2 followed creators", leaving out none. */
function describeGoing(summary: ViralDeleteSummary) {
  const parts = [
    summary.videos ? countVideos(summary.videos) : null,
    summary.hidden_channels ? `${summary.hidden_channels} ${plural(summary.hidden_channels, "hidden channel")}` : null,
    summary.creators ? `the links to ${summary.creators} ${plural(summary.creators, "followed creator")}` : null,
    summary.vault_items ? `${summary.vault_items} ${plural(summary.vault_items, "idea")} in its vault` : null,
  ].filter((part): part is string => part !== null)
  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/**
 * The Projects row (task features/03), which was the Projects page: every
 * project, pinned ones first, one niche each, on the shell's table.
 *
 * - **A row, or its name,** opens the project's own dashboard (Tyler, 19 Nov
 *   2026: "The link should go straight to the project dashboard and there
 *   should be an eye icon in action col to show a preview in the right panel
 *   for that project's details"). The eye shows the preview on the right.
 * - **Actions:** the eye, Pin, Duplicate, Archive, then the bin. The cog is
 *   gone, since the row already opens the project.
 * - **The search** finds projects, and under a Videos heading the videos of
 *   every project that match, as the old Today page's search did. Pressing
 *   one opens it on its project's dashboard.
 * - **Select** ticks projects to move to a folder, archive or delete
 *   together. The Folders block on the left narrows the list.
 */
export function ProjectsSection({
  data,
  search,
  frame,
  onChanged,
  onNewProject,
}: SectionProps<Data> & { onNewProject: () => void }) {
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const q = search.q ?? ""
  const folder = search.folder
  const showingArchived = folder === ARCHIVED_PROJECTS
  const sort: ViralProjectSort = search.sort ?? "updated"
  const direction = search.direction ?? "desc"
  const toggleSort = useListSort<ViralProjectSort>({ sort, direction })
  const [selecting, setSelecting] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<ViralProjectItem[]>([])
  const [deleteSummary, setDeleteSummary] = React.useState<ViralDeleteSummary | null>(null)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const folds = useFolds()

  // A project searching in the background changes its count and cover when
  // it finishes, so the list looks again until none is searching.
  const anySearching = data.projects.some((project) => project.searching)
  React.useEffect(() => {
    if (!anySearching) return
    const timer = setInterval(() => void onChanged(), SEARCHING_POLL_MS)
    return () => clearInterval(timer)
  }, [anySearching, onChanged])

  const rows = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    // The Projects block on the left narrows the list to one project, as Promo's does.
    const narrowed = search.project ? data.projects.filter((project) => project.id === search.project) : data.projects
    return [...narrowed].sort((a, b) => Number(b.pinned) - Number(a.pinned) || factor * compare(a, b, sort))
  }, [data.projects, direction, search.project, sort])
  const ids = rows.map((project) => project.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openProject = rows.find((project) => project.id === openId) ?? null
  const rightClicked = rightClick ? rows.find((project) => project.id === rightClick.id) : undefined
  const ticked = rows.filter((project) => selection.selected.has(project.id))

  const deleteKey = deleteTargets.map((project) => project.id).join(",")
  React.useEffect(() => {
    if (!deleteKey) return
    let active = true
    loadViralDeleteSummary(deleteKey.split(","))
      .then((summary) => {
        if (active) setDeleteSummary(summary)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [deleteKey])

  const openDashboard = (project: { id: string }) =>
    void navigate({ to: "/admin/projects/$projectId", params: { projectId: project.id } })

  const pin = (project: ViralProjectItem) =>
    void run(async () => {
      await pinViralProjectFn(project.id, !project.pinned)
      await onChanged()
    })
  const duplicate = (project: ViralProjectItem) =>
    void run(async () => {
      await duplicateViralProjectFn(project.id)
      await onChanged()
    })
  const archive = (targets: ViralProjectItem[]) =>
    void run(async () => {
      await archiveViralProjectsFn(
        targets.map((project) => project.id),
        !showingArchived
      )
      selection.clear()
      await onChanged()
    })
  const moveTo = (folderId: string | null) =>
    void run(async () => {
      await viralFolderApi.move(
        ticked.map((project) => project.id),
        folderId
      )
      selection.clear()
      await onChanged()
    })

  async function confirmDelete() {
    await run(async () => {
      const { deleted_ids: deleted } = await deleteViralProjectsFn(deleteTargets.map((project) => project.id))
      if (!deleted.length) {
        showErrorToast("Nothing was deleted. Those projects may already be gone.")
        return
      }
      selection.clear()
      setDeleteTargets([])
      setDeleteSummary(null)
      await onChanged()
    })
  }

  const toggleSelecting = () => {
    setSelecting((on) => !on)
    selection.clear()
  }

  const folders = data.folders
  const empty = q.trim() ? (
    data.hits.length ? null : (
      <NoMatches words={q} noun="projects or videos" onClear={() => setListSearch({ q: undefined })} />
    )
  ) : showingArchived ? (
    "Nothing is archived. Archive keeps a project out of the list without deleting anything."
  ) : folder === NO_FOLDER ? (
    "Every project is in a folder."
  ) : folder ? (
    "Nothing in this folder yet. Tick projects with Select and move them here."
  ) : (
    <span className="grid justify-items-center gap-2">
      No projects yet. Make one for a niche: describe it, add a few keywords, and press Search.
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void run(async () => openDashboard(await addSampleViralProject()))}
      >
        Add a sample project
      </Button>
    </span>
  )

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={FlameIcon} label="Projects" />}
        end={<PanelReopenButton side="right" label="Show the project" />}
        menuLabel="More for projects"
        selected={
          ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              main={(menu) => (
                <>
                  <SelectedMenuRow page="folder" onClick={() => menu.step("folder")}>
                    <FolderInputIcon className="size-4 text-muted-foreground" />
                    Move to folder
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      archive(ticked)
                    }}
                  >
                    {showingArchived ? (
                      <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <ArchiveIcon className="size-4 text-muted-foreground" />
                    )}
                    {showingArchived ? "Bring back" : "Archive"}
                  </SelectedMenuRow>
                  <SelectedMenuSeparator />
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setDeleteTargets(ticked)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
              pages={{
                folder: {
                  title: "Move to folder",
                  content: (menu) => (
                    <>
                      {folders.map((one) => (
                        <SelectedMenuRow
                          key={one.id}
                          onClick={() => {
                            menu.close()
                            moveTo(one.id)
                          }}
                        >
                          <span className="truncate">{one.name}</span>
                        </SelectedMenuRow>
                      ))}
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          moveTo(null)
                        }}
                      >
                        <span className="text-muted-foreground">No folder</span>
                      </SelectedMenuRow>
                    </>
                  ),
                },
              }}
            />
          ) : null
        }
        search={{
          name: "viral-project-search",
          label: "Search projects and every project's videos",
          placeholder: "Search projects and videos",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, open: undefined }),
        }}
        massSelect={rows.length ? { on: selecting, onToggle: toggleSelecting } : null}
        primary={
          <DashboardToolbarButton type="button" aria-label="New project" onClick={onNewProject}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New project</span>
          </DashboardToolbarButton>
        }
      />
      <CrmTable<ViralProjectSort>
        columns={[
          { key: "name", label: "Project", column: "main", className: "min-w-40" },
          { key: "videos", label: "Videos", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "units", label: "YouTube allowance used", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
          { key: "updated", label: "Changed", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          selecting
            ? {
                noun: "projects",
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={rows.length ? null : empty}
      >
        {rows.map((project) => (
          <CrmTableRow
            key={project.id}
            open={project.id === openId}
            label={project.name}
            tick={selecting ? { shown: true, ticked: selection.selected.has(project.id), onToggle: () => selection.toggle(project.id) } : null}
            onOpen={() => openDashboard(project)}
            onRightClick={(x, y) => setRightClick({ id: project.id, x, y })}
            cog={false}
            buttons={[
              { label: `Show ${project.name} here`, icon: <EyeIcon className="size-4" />, onPress: () => setListSearch({ open: project.id }) },
              ...(showingArchived
                ? []
                : [
                    {
                      label: project.pinned ? `Unpin ${project.name}` : `Pin ${project.name} to the top`,
                      icon: project.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />,
                      onPress: () => pin(project),
                    },
                  ]),
              { label: `Duplicate ${project.name}`, icon: <CopyIcon className="size-4" />, onPress: () => duplicate(project) },
              {
                label: showingArchived ? `Bring back ${project.name}` : `Archive ${project.name}`,
                icon: showingArchived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />,
                onPress: () => archive([project]),
              },
            ]}
            onDelete={() => setDeleteTargets([project])}
          >
            <MainCell
              lead={
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <CoverImage src={project.cover_url} className="size-full object-cover" fallback={<FlameIcon className="size-3.5 text-muted-foreground" />} />
                </span>
              }
              name={project.name}
              line={project.keywords.length ? project.keywords.join(", ") : project.sample ? "Sample project" : "No keywords yet"}
            >
              {project.pinned ? <PinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
              {project.searching ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" /> : null}
            </MainCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
              {project.result_count.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @4xl:table-cell">
              {project.units_spent.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatDate(project.updated_at)}
            </TableCell>
          </CrmTableRow>
        ))}
        {data.hits.length ? (
          <>
            <CrmGroupRow label="Videos" count={data.hits.length} folded={folds.folded("videos")} onToggle={() => folds.toggle("videos")} />
            {(folds.folded("videos") ? [] : data.hits).map((hit) => (
              <CrmTableRow
                key={`${hit.projectId}:${hit.key}`}
                open={false}
                label={hit.title}
                tick={selecting ? { shown: true, ticked: false, onToggle: () => undefined, none: true } : null}
                cog={false}
                onOpen={() =>
                  void navigate({ to: "/admin/projects/$projectId", params: { projectId: hit.projectId }, search: { open: hit.key } })
                }
              >
                <MainCell
                  lead={
                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      <CoverImage src={hit.thumbnailUrl} className="size-full object-cover" fallback={<FilmIcon className="size-3.5 text-muted-foreground" />} />
                    </span>
                  }
                  name={hit.title}
                  line={[hit.projectName, hit.channelName || creatorPlatformLabels[hit.platform as CreatorPlatform]].filter(Boolean).join(" · ")}
                />
                <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
                  {formatCount(hit.views)}
                </TableCell>
                <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell" />
                <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell" />
              </CrmTableRow>
            ))}
          </>
        ) : null}
      </CrmTable>
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{
            on: selecting,
            onToggle: () => {
              const on = !selecting
              setSelecting(on)
              selection.clear()
              if (on) selection.toggle(rightClicked.id)
            },
          }}
          items={[
            { label: "Show here", icon: <EyeIcon className="size-4" />, onSelect: () => setListSearch({ open: rightClicked.id }) },
            { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(rightClicked) },
            {
              label: showingArchived ? "Bring back" : "Archive",
              icon: showingArchived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />,
              onSelect: () => archive([rightClicked]),
            },
            { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleteTargets([rightClicked]) },
          ]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${q}|${folder ?? ""}|${sort}|${direction}`,
    showRightFor: openId,
    middle,
    right: {
      label: "Project",
      showLabel: "Show the project",
      content: openProject ? (
        <ProjectPreview key={openProject.id} project={openProject} onChanged={onChanged} />
      ) : (
        <EmptyRecord
          title="Project"
          icon={<FlameIcon aria-hidden />}
          line="Press the eye on a project to see it here."
          hideLabel="Hide the project"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(shown) => {
          if (!shown) {
            setDeleteTargets([])
            setDeleteSummary(null)
          }
        }}
        title={deleteTargets.length > 1 ? `Delete ${deleteTargets.length} projects?` : "Delete this project?"}
        description={(() => {
          const going = deleteSummary ? describeGoing(deleteSummary) : null
          const goes = going ? `Its keywords go for good, and so do ${going}.` : "Its keywords go for good."
          return `${goes} Saved videos and their breakdowns stay, and so do creators followed in other projects.`
        })()}
        confirmLabel={deleteTargets.length > 1 ? "Delete projects" : "Delete project"}
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    ),
  })
}
