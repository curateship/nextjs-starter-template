import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { PersonPages } from "@/components/project/person-pages"
import { ProjectMilestoneSide, ProjectMilestonesMiddle } from "@/components/project/project-milestones"
import { ProjectNoteSide, ProjectNotesMiddle } from "@/components/project/project-notes-panel"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { PROJECT_PANEL_LAYOUT_KEY, projectOpenTaskKey } from "@/lib/project/panel-keys"
import { projectSectionKey, sectionOfAddress, shownRow, type ProjectSection } from "@/lib/project/project-sections"
import { useProjectNotes } from "@/lib/project/use-project-notes"
import type { TaskFilters } from "@/lib/project/task-filters"
import { useProjectLive } from "@/lib/project/use-project-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"

const PROJECT_ROUTE_ID = "/_authenticated/projects/$projectId"

/** The middle and right panels' names on a narrow screen's tabs, per dashboard. */
const SECTION_LIST: Record<ProjectSection, string> = { tasks: "Tasks", notes: "Notes", milestones: "Milestones" }
const SECTION_ROW: Record<ProjectSection, string> = { tasks: "Task", notes: "Note", milestones: "Milestone" }

/**
 * The project page: details on the left, tasks in the middle,
 * the open task on the right. Tyler asked for the four-panel dashboard
 * without its bottom panel; the layout is the CRM screen's
 * (`crm-workspace.tsx`), which already has three resizable panels and
 * nothing along the bottom. The task moved from the middle panel to the
 * right on 13 Oct 2026, from Tyler's drawing, so the Board stays in view
 * beside it.
 *
 * The open task lives in the address (`?task=<id>`), so a bell notice or a
 * pasted link opens it. So do the search and filters, including whose tasks
 * show, picked in the tasks panel's header.
 *
 * The page is a dashboard of sections (Tyler, 16 Nov 2026: "remove the notes
 * and milestone block and instead create a dashboards for it"): the fixed
 * Dashboards block on the left page picks Tasks, Notes or Milestones, and the
 * middle and right panels change while the left page stays as it is. The
 * address says which (`?section=`, or what it opens: `?note=` for Notes,
 * `?milestone=` for Milestones), and this browser remembers the last one per
 * project. A "Just me" list has no page, so it is always on Tasks.
 */
export function ProjectWorkspace({
  page,
  openTaskId,
  filters,
  openChat = false,
  address = {},
}: {
  page: ProjectPage
  openTaskId: string | undefined
  filters: TaskFilters
  /** A chat notice's link: open the Chat tab. */
  openChat?: boolean
  /** Which dashboard, and the note or milestone open on it. */
  address?: { section?: ProjectSection; note?: string; milestone?: string }
}) {
  const taskAddress = useTaskAddress()
  const navigate = useNavigate()
  const router = useRouter()
  // The right panel always holds a task: the one last open on this project in
  // this browser, or the list's first row on a first visit or once that task is
  // gone (Tyler, 6 Nov 2026: "it should always land on the first task on the
  // list"), the same rule as My dashboard.
  const [rows, setRows] = React.useState<string[] | null>(null)
  const shared = !page.project.personal
  // A "Just me" list has no page and no Dashboards block, so it stays on Tasks; only a
  // # link to one of its notes opens its Notes.
  const section: ProjectSection = shared ? sectionOfAddress(address) : address.note ? "notes" : "tasks"
  // Only on Tasks: Notes and Milestones keep the open task in the address untouched, so
  // going back to Tasks shows it again.
  const quietTask = useRememberedTask({
    storageKey: projectOpenTaskKey(page.project.id),
    taskId: openTaskId,
    ids: section === "tasks" ? rows : null,
  })

  // A task changed by someone else moves on the Board and List as it happens.
  // Only this page's own data reloads.
  const reloadBoard = React.useCallback(
    () => void router.invalidate({ filter: (match) => match.routeId === PROJECT_ROUTE_ID }),
    [router]
  )
  useProjectLive(page.project.id, (change) => change !== "chat", reloadBoard)

  // Opening a task reads its chat, so its card's "3 new" goes once it has loaded.
  const tasksRef = React.useRef(page.tasks)
  React.useEffect(() => {
    tasksRef.current = page.tasks
  }, [page.tasks])
  const taskLoaded = React.useCallback(
    (taskId: string) => {
      if (tasksRef.current.some((task) => task.id === taskId && task.unread > 0)) reloadBoard()
    },
    [reloadBoard]
  )

  const chatOpened = React.useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, chat: undefined }),
      }),
    [navigate]
  )
  const setFilters = React.useCallback(
    (patch: Partial<TaskFilters>) =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  const notes = useProjectNotes(page.project.id, shared || section === "notes")
  // The right panel is never empty: with nothing in the address it shows the first row.
  const note =
    section === "notes" && notes.loaded.state === "ready" ? shownRow(notes.loaded.list.notes, address.note) : undefined
  const milestone = section === "milestones" ? shownRow(page.milestones, address.milestone) : undefined
  const readOnly = page.project.archived

  // The dashboard comes back when the project is opened again from a bare address.
  React.useEffect(() => {
    if (!shared) return
    try {
      window.localStorage.setItem(projectSectionKey(page.project.id), section)
    } catch {
      // A browser that keeps nothing opens on Tasks.
    }
  }, [shared, page.project.id, section])

  /** Moves to another dashboard, or opens a row on this one, keeping the task filters. */
  const go = React.useCallback(
    (next: { section: ProjectSection; note?: string; milestone?: string }) =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => {
          // The open task stays, for the way back to Tasks; Notes and Milestones ignore it.
          const { chat: _chat, note: _note, milestone: _milestone, section: _section, ...rest } = previous
          return {
            ...rest,
            ...(next.section === "tasks" ? {} : { section: next.section }),
            ...(next.note ? { note: next.note } : {}),
            ...(next.milestone ? { milestone: next.milestone } : {}),
          }
        },
      }),
    [navigate]
  )
  const blocks = React.useMemo(
    () => ({
      section,
      onPick: (next: ProjectSection) => go({ section: next }),
      counts: {
        tasks: page.tasks.length,
        notes: notes.loaded.state === "ready" ? notes.loaded.list.notes.length : undefined,
        milestones: page.milestones.length,
      },
    }),
    [section, go, page.tasks.length, notes.loaded, page.milestones.length]
  )

  const openNote = (noteId: string) => go({ section: "notes", note: noteId })
  // A deleted note gives way to the first one left.
  const noteDeleted = (noteId: string) => {
    if (note?.id === noteId) go({ section: "notes" })
  }

  const middle =
    section === "notes" ? (
      <ProjectNotesMiddle state={notes} openId={note?.id} onOpen={openNote} onDeleted={noteDeleted} />
    ) : section === "milestones" ? (
      <ProjectMilestonesMiddle
        projectId={page.project.id}
        milestones={page.milestones}
        openId={milestone?.id}
        readOnly={readOnly}
        onOpen={(milestoneId) => go({ section: "milestones", milestone: milestoneId })}
      />
    ) : (
      <ProjectTasksPanel
        page={page}
        filters={filters}
        onFilters={setFilters}
        onOpenTask={taskAddress.open}
        openTaskId={openTaskId}
        openChat={openChat}
        onChatOpened={chatOpened}
        onRows={setRows}
      />
    )
  const right =
    section === "notes" ? (
      <ProjectNoteSide state={notes} note={note} onDeleted={noteDeleted} />
    ) : section === "milestones" ? (
      <ProjectMilestoneSide
        projectId={page.project.id}
        milestone={milestone}
        tasks={page.tasks}
        readOnly={readOnly}
        // As New task does: me when I'm on the project, or the site admin viewing it.
        newTaskAssignee={page.members.some((member) => member.userId === page.myUserId) || page.siteAdminMe ? page.myUserId : null}
      />
    ) : (
      <TaskSidePanel taskId={openTaskId} onClose={taskAddress.back} onLoaded={taskLoaded} />
    )

  return (
    <PersonPages>
      <ThreePanels
        reopenInHeader
        layoutKey={PROJECT_PANEL_LAYOUT_KEY}
        // A task opened on arrival leaves a narrow screen on the list.
        showRightFor={
          section === "notes"
            ? address.note
            : section === "milestones"
              ? address.milestone
              : openTaskId === quietTask
                ? undefined
                : openTaskId
        }
        left={{
          label: "Details",
          showLabel: "Show the project details",
          content: <ProjectDetailsPanel page={page} blocks={blocks} />,
        }}
        middle={{ label: SECTION_LIST[section], content: middle }}
        right={{
          label: SECTION_ROW[section],
          showLabel: `Show the ${SECTION_ROW[section].toLowerCase()}`,
          content: (
            // The project's cover carried on behind the right panel's header.
            <RightCoverProvider value={page.project.personal ? null : page.project.bannerUrl}>{right}</RightCoverProvider>
          ),
        }}
      />
    </PersonPages>
  )
}
