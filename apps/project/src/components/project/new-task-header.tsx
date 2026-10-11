import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { Button } from "@/components/ui/button"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { loadNewTaskProjects, type NewTaskProject } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { NEW_TASK_PROJECT_KEY } from "@/lib/project/panel-keys"
import { showErrorToast } from "@/lib/toast/error-toast"

function lastProject() {
  try {
    return localStorage.getItem(NEW_TASK_PROJECT_KEY)
  } catch {
    return null
  }
}

function rememberProject(projectId: string) {
  try {
    localStorage.setItem(NEW_TASK_PROJECT_KEY, projectId)
  } catch {
    // A browser that keeps nothing just starts on the first project next time.
  }
}

/**
 * New task in the signed-in header, on every page, so a task is written down
 * the moment it is thought of. It opens the project page's own window with a
 * Project picker, the last project used chosen first (remembered in this
 * browser). The page under the window stays as it is.
 */
export default function NewTaskHeader(_props: AppHeaderActionProps) {
  const [projects, setProjects] = React.useState<NewTaskProject[] | null>(null)
  const [open, setOpen] = React.useState(false)
  const [run, loading] = useAsyncAction(getProjectErrorMessage)

  async function start() {
    let found: NewTaskProject[] = []
    const ok = await run(async () => {
      found = await loadNewTaskProjects()
    })
    if (!ok) return
    if (found.length === 0) {
      showErrorToast("There's no open project to put a task in yet. Make a project first.")
      return
    }
    setProjects(found)
    setOpen(true)
  }

  const remembered = lastProject()
  const initial =
    projects?.find((project) => project.id === remembered)?.id ?? projects?.[0]?.id ?? ""

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-icon="inline-start"
        disabled={loading}
        onClick={() => void start()}
      >
        {loading ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
        New task
      </Button>
      {projects ? (
        <NewTaskDialog
          projects={projects}
          initialProjectId={initial}
          open={open}
          onClose={() => setOpen(false)}
          onCreated={rememberProject}
        />
      ) : null}
    </>
  )
}
