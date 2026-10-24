import * as React from "react"
import { useParams } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { NewTaskDialog, type NewTaskStart } from "@/components/project/new-task-dialog"
import { QuickNewTask } from "@/components/project/quick-new-task"
import { Button } from "@/components/ui/button"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { loadNewTaskProjects, type NewTaskProject } from "@/lib/api/project/tasks"
import type { TaskType } from "@/lib/project/task-types"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { lastProject, rememberProject } from "@/lib/project/new-task-project"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * New task in the signed-in header, on every page, so a task is written down
 * the moment it is thought of. The page under it stays as it is.
 */
export default function NewTaskHeader(_props: AppHeaderActionProps) {
  return (
    <NewTaskWithProjectPicker align="end">
      {(loading) => (
        <Button type="button" variant="outline" data-icon="inline-start" disabled={loading}>
          {loading ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          New task
        </Button>
      )}
    </NewTaskWithProjectPicker>
  )
}

/**
 * The New task dropdown with a Project picker, for wherever no one project is
 * in view: the signed-in header and My dashboard. "More options" opens the
 * full window. On a project's page it starts on that project; elsewhere, or on
 * an archived project, on the last project used (remembered in this browser).
 * The projects load on each opening, so one made a moment ago is offered.
 */
export function NewTaskWithProjectPicker({
  align,
  children,
  openAtOnce = false,
  onClosed,
}: {
  align: "start" | "end"
  /** The button, told while the projects load. */
  children: (loading: boolean) => React.ReactNode
  /** Opens as it appears, as from a right-click on empty space on My dashboard. */
  openAtOnce?: boolean
  /** Told when it shuts, or couldn't open. */
  onClosed?: () => void
}) {
  const here = useParams({ strict: false }).projectId
  const [projects, setProjects] = React.useState<NewTaskProject[] | null>(null)
  const [types, setTypes] = React.useState<TaskType[]>([])
  const [open, setOpen] = React.useState(false)
  const [full, setFull] = React.useState<{ projectId: string; start: NewTaskStart } | null>(null)
  const [run, loading] = useAsyncAction(getProjectErrorMessage)

  async function start() {
    let found: NewTaskProject[] = []
    const ok = await run(async () => {
      const loaded = await loadNewTaskProjects()
      found = loaded.projects
      setTypes(loaded.types)
    })
    if (!ok) {
      onClosed?.()
      return
    }
    if (found.length === 0) {
      showErrorToast("There's no open project to put a task in yet. Make a project first.")
      onClosed?.()
      return
    }
    setProjects(found)
    setOpen(true)
  }

  // Once, as it appears. `start` is fresh each render, so the effect reads the latest.
  const startRef = React.useRef(start)
  React.useEffect(() => {
    startRef.current = start
  })
  const started = React.useRef(false)
  React.useEffect(() => {
    if (!openAtOnce || started.current) return
    started.current = true
    void startRef.current()
  }, [openAtOnce])

  // The list holds only open projects, so an archived one on screen falls through.
  const remembered = lastProject()
  const initial =
    projects?.find((project) => project.id === here)?.id ??
    projects?.find((project) => project.id === remembered)?.id ??
    projects?.[0]?.id ??
    ""

  return (
    <>
      <QuickNewTask
        projects={projects ?? []}
        types={types}
        initialProjectId={initial}
        open={open}
        onOpenChange={(next) => {
          if (next) void start()
          else {
            setOpen(false)
            onClosed?.()
          }
        }}
        onMoreOptions={(projectId, draft) => setFull({ projectId, start: draft })}
        onCreated={rememberProject}
        align={align}
      >
        {children(loading)}
      </QuickNewTask>
      {projects ? (
        <NewTaskDialog
          projects={projects}
          types={types}
          initialProjectId={full?.projectId ?? initial}
          start={full?.start}
          open={Boolean(full)}
          onClose={() => setFull(null)}
          onCreated={rememberProject}
        />
      ) : null}
    </>
  )
}
