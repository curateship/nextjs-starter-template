import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, ImagesIcon, PlusIcon } from "lucide-react"

import { NewCarouselDialog } from "@/components/carousel-studio/new-carousel-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CarouselProjectItem } from "@/lib/api/video/carousel-projects"

/**
 * A carousel project with no carousels in it. Opening it writes nothing (a
 * link can open a page just by being pointed at), so the first carousel is
 * made here, by pressing New carousel and naming it.
 */
export function EmptyCarouselProject({ project }: { project: CarouselProjectItem }) {
  const navigate = useNavigate()
  const [creating, setCreating] = React.useState(false)

  return (
    <div className="grid h-full place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImagesIcon className="size-4 text-muted-foreground" />
            {project.name} has no carousels
          </CardTitle>
          <CardDescription>Make a carousel to start editing.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              to="/admin/video-carousels"
              search={{ q: undefined, sort: undefined, direction: undefined, page: undefined, folder: undefined }}
            >
              <ArrowLeftIcon />
              Projects
            </Link>
          </Button>
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            New carousel
          </Button>
        </CardContent>
      </Card>
      <NewCarouselDialog
        open={creating}
        carouselProjectId={project.id}
        onClose={() => setCreating(false)}
        onCreated={(carousel) =>
          void navigate({
            to: "/admin/video-carousels/$projectId",
            params: { projectId: project.id },
            search: { carousel: carousel.id },
          })
        }
      />
    </div>
  )
}
