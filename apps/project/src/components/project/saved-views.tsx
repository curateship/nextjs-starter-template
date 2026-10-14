import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BookmarkIcon, BookmarkPlusIcon, CheckIcon, Loader2Icon, Trash2Icon } from "lucide-react"
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
import { deleteProjectView, saveProjectView, type SavedView } from "@/lib/api/project/finding"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { openView, viewFilters, viewHasFilters } from "@/lib/project/saved-views"
import { NOBODY_FILTER, type TaskFilters } from "@/lib/project/task-filters"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Here = {
  /** Null is My tasks. */
  projectId: string | null
  /** The project's members, for the Person filter. My tasks has none. */
  people?: { id: string; name: string }[]
  labels: { id: string; name: string }[]
  types: { id: string; name: string }[]
}

/**
 * Save view and the Views menu, at the end of a task filter bar. A view is a
 * person's own named filters on one project or on My tasks; opening it sets
 * the same filters, and so the same address, as picking them by hand. A view
 * naming someone no longer on the project, or a deleted label, says so and
 * opens with the rest.
 */
export function SavedViewsControls({
  views,
  filters,
  onChange,
  here,
  saveButton = true,
  buttonVariant = "outline",
}: {
  views: SavedView[]
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  here: Here
  /** Off where Save as view sits elsewhere, as in the project page's Filter popover. */
  saveButton?: boolean
  /** Ghost in the project page's header, where every control is. */
  buttonVariant?: "outline" | "ghost"
}) {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  // "Delete views…" turns the menu's rows into delete buttons until it closes.
  const [removing, setRemoving] = React.useState(false)

  function open(view: SavedView) {
    const { filters: next, missing } = openView(view, here, NOBODY_FILTER)
    onChange({
      q: undefined,
      status: undefined,
      priority: undefined,
      person: undefined,
      label: undefined,
      type: undefined,
      due: undefined,
      ...next,
    })
    if (missing.length) {
      showErrorToast(`${missing.join(". ")}, so "${view.name}" opened without that filter.`)
    }
  }

  async function remove(view: SavedView) {
    setDeleting(view.id)
    const ok = await run(() => deleteProjectView(view.id), `"${view.name}" deleted.`)
    setDeleting(null)
    if (ok) await router.invalidate()
  }

  return (
    <>
      {saveButton && viewHasFilters(filters) ? (
        <DashboardToolbarButton type="button" variant="ghost" onClick={() => setSaving(true)}>
          <BookmarkPlusIcon className="size-4" />
          Save view
        </DashboardToolbarButton>
      ) : null}
      <DropdownMenu onOpenChange={(open) => (open ? undefined : setRemoving(false))}>
        <DropdownMenuTrigger asChild>
          <DashboardToolbarButton type="button" variant={buttonVariant}>
            <BookmarkIcon className="size-4" />
            {/* The tasks panel's header is the container: in a narrow one the icon stays and the word goes. */}
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
                <DropdownMenuItem
                  key={view.id}
                  className={cn("flex items-center gap-2", removing && "text-destructive")}
                  aria-label={removing ? `Delete ${view.name}` : undefined}
                  onSelect={(event) => {
                    if (!removing) return open(view)
                    // Deleting keeps the menu open for the next one.
                    event.preventDefault()
                    void remove(view)
                  }}
                >
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{view.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{describeView(view, here)}</span>
                  </span>
                  {removing ? (
                    busy && deleting === view.id ? (
                      <Loader2Icon className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2Icon aria-hidden />
                    )
                  ) : null}
                </DropdownMenuItem>
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
      <SaveViewDialog
        open={saving}
        filters={filters}
        here={here}
        onClose={() => setSaving(false)}
      />
    </>
  )
}

/** "Stuck · Leo · Bug", so a view says what it shows before it is opened. */
function describeView(view: SavedView, here: Here) {
  const { filters, names } = view
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.status) parts.push(TASK_STATUS_LABEL[filters.status])
  if (filters.priority) parts.push(`${TASK_PRIORITY_LABEL[filters.priority]} priority`)
  if (filters.person) {
    parts.push(
      filters.person === NOBODY_FILTER
        ? "Nobody assigned"
        : (here.people?.find((person) => person.id === filters.person)?.name ?? names.person ?? "Someone who left")
    )
  }
  if (filters.label) {
    parts.push(here.labels.find((label) => label.id === filters.label)?.name ?? names.label ?? "A deleted label")
  }
  if (filters.type) {
    parts.push(here.types.find((type) => type.id === filters.type)?.name ?? names.type ?? "A deleted type")
  }
  return parts.join(" · ")
}

/** The Save view window, for a screen that puts its own Save as view button somewhere else. */
export function SaveViewDialog({
  open,
  filters,
  here,
  onClose,
}: {
  open: boolean
  filters: TaskFilters
  here: Here
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const kept = viewFilters(filters)
  const summary = describeView({ id: "", name: "", filters: kept, names: {} }, here)

  // Each opening starts with the filters as its name, ready to be typed over.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(summary.slice(0, LIMITS.viewName))
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
    const ok = await run(() => saveProjectView({ projectId: here.projectId, name: next, filters: kept }))
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
                    maxLength={LIMITS.viewName}
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
