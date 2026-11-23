import type * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { starProject } from "@/lib/api/project/sorting"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { cn } from "@/lib/utils"

/**
 * Pins a project for me alone, so it sits first on the Projects page. It was
 * a star until Tyler renamed it on 19 Oct 2026 ("That should be pinned"); the
 * saved choice is still called a star in the code and the database
 * (`project_project_stars`), so every star became a pin.
 */
export function PinButton({
  project,
  size = "icon",
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onChange" | "onClick" | "size"> & {
  project: { id: string; name: string; starred: boolean }
  size?: "icon" | "icon-xs"
  /** Told once the pin has saved, before the page loads again. */
  onChange?: (starred: boolean) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    // A tooltip's trigger reaches the button through `props`.
    <Button
      {...props}
      type="button"
      variant="ghost"
      size={size}
      aria-label={project.starred ? `Unpin ${project.name}` : `Pin ${project.name}`}
      aria-pressed={project.starred}
      disabled={busy || props.disabled}
      onClick={async () => {
        if (!(await run(() => starProject(project.id, !project.starred)))) return
        onChange?.(!project.starred)
        await router.invalidate()
      }}
    >
      {/* Yellow while pinned (Tyler, 19 Oct 2026), and filled, so it never relies on colour alone. */}
      <PinIcon className={cn("size-4", project.starred && "fill-amber-400 text-amber-500")} aria-hidden />
    </Button>
  )
}
