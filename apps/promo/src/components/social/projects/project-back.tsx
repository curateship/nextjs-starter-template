import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The project the arrow leads back from, or null on a guest's page, which
 * has no Projects dashboard to go back to.
 */
const ProjectBack = React.createContext<string | null>(null)

export const ProjectBackProvider = ProjectBack.Provider

/**
 * The arrow back to the Projects dashboard, with this project's row open, at
 * the start of the middle's header before its tabs (Tyler, 12 Nov 2026: "put
 * the arrow back again", pointing at the middle's first tab). Every network's
 * middle header draws it, so it is in the same place whichever row is picked.
 * Nothing on a guest's page.
 */
export function ProjectBackButton() {
  const projectId = React.useContext(ProjectBack)
  const navigate = useNavigate()
  if (!projectId) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0"
          aria-label="Back to the Projects dashboard"
          onClick={() => void navigate({ to: "/admin/projects", search: { open: projectId } })}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Back to the Projects dashboard</TooltipContent>
    </Tooltip>
  )
}
