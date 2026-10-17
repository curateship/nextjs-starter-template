import * as React from "react"
import { PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ActorFormDialog } from "@/components/video-assets/actor-form-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  deleteActors,
  getActorErrorMessage,
  type ActorItem,
} from "@/lib/api/video/actors"
import type { ProjectItem } from "@/lib/api/video/projects"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Every actor, across every project. An actor is shared: the same face is
 * used in many videos, so this is where one is renamed, re-posed or deleted.
 * First frames of an actor are made inside a project, on the editor's AI clip
 * panel.
 */
export function ActorsDashboard({
  initial,
  projects,
}: {
  initial: { actors: ActorItem[] }
  projects: ProjectItem[]
}) {
  const [actors, setActors] = React.useState(initial.actors)
  const [search, setSearch] = React.useState("")
  const [editing, setEditing] = React.useState<ActorItem | "new" | null>(null)
  const [deleting, setDeleting] = React.useState<ActorItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const visible = actors.filter((actor) =>
    `${actor.name} ${actor.prompt} ${actor.tags.join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  function handleSaved(saved: ActorItem, reposed: boolean) {
    if (editing === "new") {
      setActors((current) => [saved, ...current])
      toast.success("Actor created.")
    } else {
      setActors((current) =>
        current.map((actor) => (actor.id === saved.id ? saved : actor))
      )
      toast.success(reposed ? "Actor re-posed." : "Actor saved.")
    }
    setEditing(null)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteActors([deleting.id])
      setActors((current) => current.filter((actor) => actor.id !== deleting.id))
      setDeleting(null)
      toast.success("Actor removed. Its generated files remain in Media.")
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Actors"
        icon={<SparklesIcon className="text-muted-foreground" />}
        count={visible.length}
        controls={
          <>
            <DashboardToolbarSearch
              aria-label="Search actors"
              placeholder="Search actors"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={() => setEditing("new")}>
              <PlusIcon /> Create actor
            </DashboardToolbarButton>
          </>
        }
        content={
          visible.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
              {visible.map((actor) => (
                <Card key={actor.id} size="sm" className="overflow-hidden">
                  <img
                    src={actor.image_url}
                    alt={actor.name}
                    className="aspect-[3/4] w-full bg-muted object-cover"
                  />
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{actor.name}</CardTitle>
                      <Badge variant="secondary">{actor.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {actor.prompt}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="icon-sm" variant="outline" onClick={() => setEditing(actor)} aria-label={`Edit ${actor.name}`}>
                        <SettingsIcon />
                      </Button>
                      <Button size="icon-sm" variant="outline" onClick={() => setDeleting(actor)} aria-label={`Delete ${actor.name}`}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-muted-foreground">
              {search ? "No actors match that search." : "No actors yet. Create one from a description or reference photo."}
            </div>
          )
        }
        footer={{ type: "summary", count: visible.length, label: "actors" }}
      />

      <ActorFormDialog
        open={editing !== null}
        actor={editing === "new" ? null : editing}
        look={{ projects }}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Delete actor?"
        description="The actor goes, and so do its first frames in every project and the AI clips made from them. Pictures and clips already on a timeline stay there."
        confirmLabel="Delete actor"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
