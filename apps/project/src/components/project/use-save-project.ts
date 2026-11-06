import { useRouter } from "@tanstack/react-router"

import { archiveProject, saveProject, type ProjectPage } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"

type Fields = Omit<Parameters<typeof saveProject>[0], "projectId">

/** Saves some of the project's fields, says so, and redraws the page. */
export function useSaveProject(projectId: string) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function save(fields: Fields, done = "Saved.") {
    const ok = await run(() => saveProject({ projectId, ...fields }), done)
    if (ok) await router.invalidate()
    return ok
  }
  return { save, run, busy, router }
}

/** Archive, or Bring back an archived project. */
export function useArchiveProject(project: ProjectPage["project"]) {
  const { run, busy, router } = useSaveProject(project.id)
  async function toggle() {
    const ok = await run(
      () => archiveProject(project.id, !project.archived),
      project.archived ? "Project brought back." : "Project archived."
    )
    if (ok) await router.invalidate()
  }
  return { toggle, busy }
}
