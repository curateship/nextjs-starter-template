import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, FilmIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NewVideoPopover } from "@/components/video-editor/new-video-popover"
import { type ProjectItem } from "@/lib/api/video/projects"

/**
 * A project whose videos have all been deleted. Opening it writes nothing
 * (a link can open a page just by being pointed at), so the first video is
 * made here, by pressing New video and naming it. A guest sent from Project can't make one.
 */
export function EmptyProject({ project, guest }: { project: ProjectItem; guest: boolean }) {
  const navigate = useNavigate()

  async function openMade(videoId: string, panel?: "templates") {
    await navigate({
      to: "/admin/video-editor/$projectId",
      params: { projectId: project.id },
      search: { video: videoId, ...(panel ? { panel } : {}) },
    })
  }

  return (
    <div className="grid h-full place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilmIcon className="size-4 text-muted-foreground" />
            {project.name} has no videos
          </CardTitle>
          <CardDescription>
            {guest
              ? "Every video in this project was deleted. Ask the project's owner to make one."
              : "Every video in this project was deleted. Make a new one to start editing."}
          </CardDescription>
        </CardHeader>
        {guest ? null : (
          <CardContent className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/video-editor">
                <ArrowLeftIcon />
                Projects
              </Link>
            </Button>
            <NewVideoPopover
              projectId={project.id}
              aspect={project.aspects[0] ?? "9:16"}
              side="bottom"
              withTemplates
              onCreated={openMade}
            >
              <Button type="button">
                <PlusIcon />
                New video
              </Button>
            </NewVideoPopover>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
