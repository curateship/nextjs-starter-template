import * as React from "react"
import { PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ActorFormDialog } from "@/components/video-assets/actor-form-dialog"
import { ExtraFormDialog } from "@/components/video-assets/extra-form-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deleteActors,
  getActorErrorMessage,
  type ActorItem,
} from "@/lib/api/video/actors"
import {
  deleteExtras,
  getExtraErrorMessage,
  type ExtraItem,
} from "@/lib/api/video/extras"
import type { ProjectItem } from "@/lib/api/video/projects"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  EXTRA_KIND_LABELS,
  EXTRA_KINDS,
  type ExtraKind,
} from "@/lib/video/extras"

export type ActorsTab = "actors" | ExtraKind

const TABS: ActorsTab[] = ["actors", ...EXTRA_KINDS]

function tabLabel(tab: ActorsTab) {
  return tab === "actors" ? "Actors" : EXTRA_KIND_LABELS[tab].tab
}

/**
 * Every actor, across every project, and on the other tabs the clothing,
 * backdrops, props and hair looks they can be dressed and placed with. Both
 * are shared: the same face and the same jacket are used in many videos, so
 * this is where one is renamed, re-posed or deleted. First frames are made
 * inside a project, on the editor's AI clip panel, where the Extras button
 * picks from these tabs.
 */
export function ActorsDashboard({
  initial,
  initialExtras,
  projects,
  tab,
  onTabChange,
}: {
  initial: { actors: ActorItem[] }
  initialExtras: ExtraItem[]
  projects: ProjectItem[]
  tab: ActorsTab
  onTabChange: (tab: ActorsTab) => void
}) {
  const [actors, setActors] = React.useState(initial.actors)
  const [extras, setExtras] = React.useState(initialExtras)
  const [search, setSearch] = React.useState("")
  const [editing, setEditing] = React.useState<ActorItem | "new" | null>(null)
  const [editingExtra, setEditingExtra] = React.useState<ExtraItem | "new" | null>(null)
  const [deleting, setDeleting] = React.useState<ActorItem | null>(null)
  const [deletingExtra, setDeletingExtra] = React.useState<ExtraItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const query = search.trim().toLowerCase()
  const visible = actors.filter((actor) =>
    `${actor.name} ${actor.prompt} ${actor.tags.join(" ")}`
      .toLowerCase()
      .includes(query)
  )
  const kind = tab === "actors" ? null : tab
  const visibleExtras = extras.filter(
    (extra) =>
      extra.kind === kind &&
      `${extra.name} ${extra.prompt}`.toLowerCase().includes(query)
  )
  const counts: Record<ActorsTab, number> = {
    actors: actors.length,
    ...(Object.fromEntries(
      EXTRA_KINDS.map((each) => [each, extras.filter((extra) => extra.kind === each).length])
    ) as Record<ExtraKind, number>),
  }
  const shown = kind ? visibleExtras.length : visible.length
  const noun = kind ? EXTRA_KIND_LABELS[kind].one : "actor"

  function handleExtraSaved(saved: ExtraItem, created: boolean) {
    setExtras((current) =>
      created
        ? [saved, ...current]
        : current.map((extra) => (extra.id === saved.id ? saved : extra))
    )
    toast.success(created ? `${saved.name} created.` : `${saved.name} saved.`)
    setEditingExtra(null)
  }

  async function confirmDeleteExtra() {
    if (!deletingExtra) return
    setDeleteBusy(true)
    try {
      await deleteExtras([deletingExtra.id])
      setExtras((current) => current.filter((extra) => extra.id !== deletingExtra.id))
      setDeletingExtra(null)
      toast.success(`${deletingExtra.name} removed. Its picture remains in Media.`)
    } catch (error) {
      showErrorToast(getExtraErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

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

  function handleSheetChanged(changed: ActorItem) {
    setActors((current) =>
      current.map((actor) => (actor.id === changed.id ? changed : actor))
    )
    setEditing(changed)
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
        count={shown}
        tabs={
          <Tabs value={tab} onValueChange={(value) => onTabChange(value as ActorsTab)}>
            <TabsList>
              {TABS.map((each) => (
                <TabsTrigger
                  key={each}
                  value={each}
                  aria-label={`${tabLabel(each)}, ${counts[each]}`}
                >
                  {tabLabel(each)}
                  <TabsCount>{counts[each]}</TabsCount>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        controls={
          <>
            <DashboardToolbarSearch
              aria-label={`Search ${tabLabel(tab).toLowerCase()}`}
              placeholder={`Search ${tabLabel(tab).toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton
              onClick={() => (kind ? setEditingExtra("new") : setEditing("new"))}
            >
              <PlusIcon /> Create {noun}
            </DashboardToolbarButton>
          </>
        }
        content={
          kind ? (
            visibleExtras.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
                {visibleExtras.map((extra) => (
                  // A click anywhere on the card opens it; the cog does the
                  // same from the keyboard.
                  <Card
                    key={extra.id}
                    size="sm"
                    className="cursor-pointer overflow-hidden"
                    onClick={() => setEditingExtra(extra)}
                  >
                    <img
                      src={extra.image_url}
                      alt={extra.name}
                      className="aspect-[3/4] w-full bg-muted object-contain"
                    />
                    <CardHeader>
                      <CardTitle>{extra.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {extra.prompt}
                      </p>
                      <div
                        className="flex flex-wrap gap-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button size="icon-sm" variant="outline" onClick={() => setEditingExtra(extra)} aria-label={`Edit ${extra.name}`}>
                          <SettingsIcon />
                        </Button>
                        <Button size="icon-sm" variant="outline" onClick={() => setDeletingExtra(extra)} aria-label={`Delete ${extra.name}`}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-muted-foreground">
                {search
                  ? `No ${tabLabel(kind).toLowerCase()} match that search.`
                  : `${EXTRA_KIND_LABELS[kind].none}. Create one from a picture in Media or a description.`}
              </div>
            )
          ) : visible.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
              {visible.map((actor) => (
                // A click anywhere on the card opens the actor; the cog does the
                // same from the keyboard.
                <Card
                  key={actor.id}
                  size="sm"
                  className="cursor-pointer overflow-hidden"
                  onClick={() => setEditing(actor)}
                >
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
                    <p className="text-xs text-muted-foreground">
                      {actor.sheet.length}{" "}
                      {actor.sheet.length === 1 ? "picture" : "pictures"} on the sheet
                    </p>
                    <div
                      className="flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
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
        footer={{
          type: "summary",
          count: shown,
          label: kind ? tabLabel(kind).toLowerCase() : "actors",
        }}
      />

      <ExtraFormDialog
        open={editingExtra !== null}
        kind={kind ?? "clothing"}
        extra={editingExtra === "new" ? null : editingExtra}
        onClose={() => setEditingExtra(null)}
        onSaved={handleExtraSaved}
      />

      <ConfirmDialog
        open={deletingExtra !== null}
        onOpenChange={(open) => { if (!open) setDeletingExtra(null) }}
        title={`Delete ${deletingExtra?.name ?? "this extra"}?`}
        description="It leaves this tab and the Extras button. Its picture stays in Media, and frames and clips already made with it keep what they were sent."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDeleteExtra()}
      />

      <ActorFormDialog
        open={editing !== null}
        actor={editing === "new" ? null : editing}
        projects={projects}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        onSheetChanged={handleSheetChanged}
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
