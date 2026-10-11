import { useRouter } from "@tanstack/react-router"
import { StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { starProject } from "@/lib/api/project/sorting"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { cn } from "@/lib/utils"

/**
 * Stars a project for me alone. Starred projects sit first on the Projects
 * page. The star is filled when on, so it never relies on colour alone.
 */
export function StarButton({
  project,
}: {
  project: { id: string; name: string; starred: boolean }
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={project.starred ? `Unstar ${project.name}` : `Star ${project.name}`}
      aria-pressed={project.starred}
      disabled={busy}
      onClick={async () => {
        if (await run(() => starProject(project.id, !project.starred))) await router.invalidate()
      }}
    >
      <StarIcon
        className={cn("size-4", project.starred && "fill-amber-400 text-amber-500")}
        aria-hidden
      />
    </Button>
  )
}
