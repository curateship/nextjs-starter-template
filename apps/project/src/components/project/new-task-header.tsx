import * as React from "react"
import { useParams } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { Button } from "@/components/ui/button"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { loadNewTaskProjects, type NewTaskProject } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { lastProject, rememberProject } from "@/lib/project/new-task-project"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * New task in the signed-in header, on every page, so a task is written down
 * the moment it is thought of. It opens the project page's own window with a
 * Project picker. On a project's page it starts on that project; elsewhere,
 * or on an archived project, on the last project used (remembered in this
 * browser). The page under the window stays as it is.
 */
export default function NewTaskHeader(_props: AppHeaderActionProps) {
  const here = useParams({ strict: false }).projectId
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

  // The list holds only open projects, so an archived one on screen falls through.
  const remembered = lastProject()
  const initial =
    projects?.find((project) => project.id === here)?.id ??
    projects?.find((project) => project.id === remembered)?.id ??
    projects?.[0]?.id ??
    ""

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
