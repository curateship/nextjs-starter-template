import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BookmarkIcon, BookmarkPlusIcon, CheckIcon, Loader2Icon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteView, saveView, updateView } from "@/lib/api/saved-views"
import { describeAuthError } from "@/lib/api/error-message"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { SAVED_VIEW_LIMITS, type SavedView, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** What a screen tells the views about itself. */
export type SavedViewsScreen = {
  /** `<kind>:<record id>`, the key the app registered in `savedViews.screens`. */
  screen: string
  /** "Stuck · Leo · Bug": what a view shows, said before it is opened. */
  describe: (filters: SavedViewValues, names: Record<string, string>) => string
  /** The filters worth keeping out of the ones given: only the ones set. */
  kept: (filters: SavedViewValues) => SavedViewValues
  /** A server refusal as a sentence. Defaults to the message itself. */
  describeError?: (error: unknown) => string
}

function defaultDescribeError(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? (message || "The view could not be saved. Try again.")
}

/**
 * Save view and the Views menu, at the end of a dashboard's toolbar. A view is
 * a person's own named filters on one screen; opening it sets the same
 * filters, and so the same address, as picking them by hand. The screen opens
 * it (`onOpen`), so it can say what a view names that has gone and open with
 * the rest. Each row's cog opens Edit view, to rename it or change what it
 * shows. Started in Project, moved here on 20 Oct 2026 for every app.
 */
export function SavedViewsControls({
  here,
  views,
  filters,
  onOpen,
  editFields,
  saveButton = true,
  buttonVariant = "outline",
}: {
  here: SavedViewsScreen
  views: SavedView[]
  /** The filters showing now, for Save view. */
  filters: SavedViewValues
  onOpen: (view: SavedView) => void
  /** Edit view's "What it shows" rows, given the filters being edited and a way to change them. */
  editFields?: EditFields
  /** Off where Save as view sits elsewhere, as in a Filter popover. */
  saveButton?: boolean
  /** Ghost in a dashboard's header, where every control is. */
  buttonVariant?: "outline" | "ghost"
}) {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [run, busy] = useAsyncAction(here.describeError ?? defaultDescribeError)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  // "Delete views…" turns the menu's rows into delete buttons until it closes.
  const [removing, setRemoving] = React.useState(false)
  const [editing, setEditing] = React.useState<SavedView | null>(null)

  async function remove(view: SavedView) {
    setDeleting(view.id)
    const ok = await run(() => deleteView(view.id), `"${view.name}" deleted.`)
    setDeleting(null)
    if (ok) await router.invalidate()
  }

  return (
    <>
      {saveButton && Object.keys(here.kept(filters)).length ? (
        <DashboardToolbarButton type="button" variant="ghost" onClick={() => setSaving(true)}>
          <BookmarkPlusIcon className="size-4" />
          Save view
        </DashboardToolbarButton>
      ) : null}
      <DropdownMenu onOpenChange={(open) => (open ? undefined : setRemoving(false))}>
        <DropdownMenuTrigger asChild>
          <DashboardToolbarButton type="button" variant={buttonVariant}>
            <BookmarkIcon className="size-4" />
            {/* The header is the container: in a narrow one the icon stays and the word goes. */}
            <span className="@max-4xl:sr-only">Views</span>
            {views.length ? <span className="text-muted-foreground">{views.length}</span> : null}
          </DashboardToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>My views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              None yet. Search or pick filters, then save them as a view.
            </p>
          ) : (
            <>
              {views.map((view) => (
                <div key={view.id} className="flex items-center gap-1">
                  <DropdownMenuItem
                    className={cn("flex min-w-0 flex-1 items-center gap-2", removing && "text-destructive")}
                    aria-label={removing ? `Delete ${view.name}` : undefined}
                    onSelect={(event) => {
                      if (!removing) return onOpen(view)
                      // Deleting keeps the menu open for the next one.
                      event.preventDefault()
                      void remove(view)
                    }}
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{view.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {here.describe(view.filters, view.names)}
                      </span>
                    </span>
                    {removing ? (
                      busy && deleting === view.id ? (
                        <Loader2Icon className="animate-spin" aria-hidden />
                      ) : (
                        <Trash2Icon aria-hidden />
                      )
                    ) : null}
                  </DropdownMenuItem>
                  {removing || !editFields ? null : (
                    <DropdownMenuItem
                      className="shrink-0 self-stretch text-muted-foreground"
                      aria-label={`Edit ${view.name}`}
                      onSelect={() => setEditing(view)}
                    >
                      <SettingsIcon aria-hidden />
                    </DropdownMenuItem>
                  )}
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setRemoving((on) => !on)
                }}
              >
                {removing ? <CheckIcon aria-hidden /> : <Trash2Icon aria-hidden />}
                {removing ? "Done deleting" : "Delete views…"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveViewDialog open={saving} here={here} filters={filters} onClose={() => setSaving(false)} />
      {editFields ? (
        <EditViewDialog view={editing} here={here} editFields={editFields} onClose={() => setEditing(null)} />
      ) : null}
    </>
  )
}

/** Edit view's rows for one screen's filters. */
export type EditFields = (input: {
  filters: SavedViewValues
  /** Sets or clears values; `undefined` clears one. */
  change: (patch: Record<string, string | number | boolean | undefined>) => void
  names: Record<string, string>
}) => React.ReactNode

/** The Save view window, also for a screen that puts its own Save as view button somewhere else. */
export function SaveViewDialog({
  open,
  here,
  filters,
  onClose,
}: {
  open: boolean
  here: SavedViewsScreen
  filters: SavedViewValues
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(here.describeError ?? defaultDescribeError)
  const kept = here.kept(filters)
  const summary = here.describe(kept, {})

  // Each opening starts with the filters as its name, ready to be typed over.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(summary.slice(0, SAVED_VIEW_LIMITS.name))
      setInvalid(false)
    }
  }

  async function save() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the view a name.")
      return
    }
    const ok = await run(() => saveView({ screen: here.screen, name: next, filters: kept }))
    if (!ok) return
    toast.success(`Saved "${next}". It's in Views.`)
    onClose()
    await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={name.trim() !== summary} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Only you see your views. Opening one sets these filters again: {summary}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>View</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="saved-view-name">Name</Label>
                  <Input
                    id="saved-view-name"
                    value={name}
                    maxLength={SAVED_VIEW_LIMITS.name}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Edit view, from the cog on a view's row: its name, and the screen's own
 * filter rows. It stays on the screen where it was saved.
 */
function EditViewDialog({
  view,
  here,
  editFields,
  onClose,
}: {
  view: SavedView | null
  here: SavedViewsScreen
  editFields: EditFields
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [filters, setFilters] = React.useState<SavedViewValues>({})
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(here.describeError ?? defaultDescribeError)

  // Each opening starts from the view as it is saved.
  const [shown, setShown] = React.useState<SavedView | null>(null)
  if (!view && shown) setShown(null)
  if (view && view !== shown) {
    setShown(view)
    setName(view.name)
    setFilters(view.filters)
    setInvalid(false)
  }

  const kept = here.kept(filters)
  const dirty =
    view !== null &&
    (name.trim() !== view.name || JSON.stringify(kept) !== JSON.stringify(here.kept(view.filters)))
  const change = (patch: Record<string, string | number | boolean | undefined>) =>
    setFilters((was) => {
      const next: SavedViewValues = { ...was }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key]
        else next[key] = value
      }
      return next
    })

  async function save() {
    if (!view) return
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the view a name.")
      return
    }
    if (Object.keys(kept).length === 0) {
      showErrorToast("Search or pick a filter, so the view shows something.")
      return
    }
    const ok = await run(() => updateView({ viewId: view.id, name: next, filters: kept }))
    if (!ok) return
    toast.success(`Saved changes to "${next}".`)
    onClose()
    await router.invalidate()
  }

  return (
    <FormDialog open={view !== null} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit view</DialogTitle>
            <DialogDescription>Only you see your views. Opening it sets these filters again.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>View</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="edit-view-name">Name</Label>
                  <Input
                    id="edit-view-name"
                    value={name}
                    maxLength={SAVED_VIEW_LIMITS.name}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>What it shows</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {editFields({ filters, change, names: view?.names ?? {} })}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
