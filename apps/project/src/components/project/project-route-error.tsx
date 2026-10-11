import { Link, type ErrorComponentProps } from "@tanstack/react-router"
import { FolderXIcon } from "lucide-react"

import { routeErrorComponent } from "@/components/shell/route-error"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PROJECT_ERRORS, getProjectErrorMessage } from "@/lib/project/errors"

const RetryableError = routeErrorComponent(getProjectErrorMessage)

/**
 * The project page's error screen. A project that doesn't exist, or that this
 * person can't see, offers Back to Projects, because Try again can't change
 * that answer and a red toast would only repeat it. Any other failure gets the
 * shell's usual card with Try again.
 */
export function ProjectRouteError(props: ErrorComponentProps) {
  if (getProjectErrorMessage(props.error) !== PROJECT_ERRORS.projectNotFound) {
    return <RetryableError {...props} />
  }
  return (
    <Card size="sm">
      <div className="grid min-h-32 justify-items-center gap-3 px-4 py-8 text-center">
        <FolderXIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">That project doesn't exist or you can't see it.</p>
        <Button asChild variant="outline">
          <Link to="/projects">Back to Projects</Link>
        </Button>
      </div>
    </Card>
  )
}
