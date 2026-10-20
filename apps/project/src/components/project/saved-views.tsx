import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BookmarkIcon, BookmarkPlusIcon, CheckIcon, Loader2Icon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FilterRow, TaskFilterFields } from "@/components/project/task-filter-popover"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { deleteProjectView, saveProjectView, updateProjectView, type SavedView } from "@/lib/api/project/finding"
import type { Label as TaskLabel } from "@/lib/api/project/sorting"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { openView, viewFilters, viewHasFilters, type SavedViewFilters } from "@/lib/project/saved-views"
import { NOBODY_FILTER, type TaskFilters } from "@/lib/project/task-filters"
import { TASK_GROUPING_LABEL, type TaskGrouping } from "@/lib/project/task-groups"
import type { TaskType } from "@/lib/project/task-types"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Here = {
  /** Null is My tasks. */
  projectId: string | null
  /** The project's members, for the Person filter. My tasks has none. */
  people?: { id: string; name: string }[]
  labels: TaskLabel[]
  types: TaskType[]
  /** The clients of the tasks shown, for Edit view's Client row. Only My tasks has one. */
  clients?: readonly string[]
  /** The Group row's choices, for Edit view. My tasks has none. */
  groups?: readonly TaskGrouping[]
}

/**
 * Save view and the Views menu, at the end of a task filter bar. A view is a
 * person's own named filters on one project or on My tasks; opening it sets
 * the same filters, and so the same address, as picking them by hand. A view
 * with a group sets the Group row too; one without leaves it as it is, the way
 * Clear does. A view naming someone no longer on the project, or a deleted
 * label, says so and opens with the rest. Each row's cog opens Edit view,
 * to rename it or change what it shows (Tyler, 20 Oct 2026).
 */
export function SavedViewsControls({
  views,
  filters,
  onChange,
  onGroup,
  here,
  saveButton = true,
  buttonVariant = "outline",
}: {
  views: SavedView[]
  filters: SavedViewFilters
  onChange: (patch: Partial<TaskFilters>) => void
  /** Sets the Group row from a view that has one. Left out where there is no Group row. */
  onGroup?: (group: TaskGrouping) => void
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
  const [editing, setEditing] = React.useState<SavedView | null>(null)

  function open(view: SavedView) {
    const {
      filters: { group, ...next },
      missing,
    } = openView(view, here, NOBODY_FILTER)
    onChange({
      q: undefined,
      status: undefined,
      priority: undefined,
      person: undefined,
      label: undefined,
      type: undefined,
      due: undefined,
      client: undefined,
      ...next,
    })
    if (group) onGroup?.(group)
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
                <div key={view.id} className="flex items-center gap-1">
                  <DropdownMenuItem
                    className={cn("flex min-w-0 flex-1 items-center gap-2", removing && "text-destructive")}
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
                  {removing ? null : (
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
      <SaveViewDialog
        open={saving}
        filters={filters}
        here={here}
        onClose={() => setSaving(false)}
      />
      <EditViewDialog view={editing} here={here} onClose={() => setEditing(null)} />
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
  if (filters.group) parts.push(`Group: ${TASK_GROUPING_LABEL[filters.group]}`)
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
  filters: SavedViewFilters
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

/**
 * Edit view, from the cog on a view's row: its name, and the same filter and
 * Group rows as the Filter popover, with the search and who the tasks are for
 * that the header holds. It stays on the project, or on My tasks, where it was
 * saved.
 */
function EditViewDialog({ view, here, onClose }: { view: SavedView | null; here: Here; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [filters, setFilters] = React.useState<SavedViewFilters>({})
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  // Each opening starts from the view as it is saved.
  const [shown, setShown] = React.useState<SavedView | null>(null)
  if (!view && shown) setShown(null)
  if (view && view !== shown) {
    setShown(view)
    setName(view.name)
    setFilters(view.filters)
    setInvalid(false)
  }

  const kept = viewFilters(filters)
  const dirty =
    view !== null &&
    (name.trim() !== view.name || JSON.stringify(kept) !== JSON.stringify(viewFilters(view.filters)))
  const change = (patch: Partial<SavedViewFilters>) => setFilters((was) => ({ ...was, ...patch }))

  async function save() {
    if (!view) return
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the view a name.")
      return
    }
    if (!viewHasFilters(kept)) {
      showErrorToast(
        here.groups
          ? "Search, pick a filter or choose a group, so the view shows something."
          : "Search or pick a filter, so the view shows something."
      )
      return
    }
    const ok = await run(() => updateProjectView({ viewId: view.id, name: next, filters: kept }))
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
            <DialogDescription>
              Only you see your views. Opening it sets these filters again.
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
                  <Label htmlFor="edit-view-name">Name</Label>
                  <Input
                    id="edit-view-name"
                    value={name}
                    maxLength={LIMITS.viewName}
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
                  <div className="grid gap-2">
                    <Label htmlFor="edit-view-search">Search</Label>
                    <Input
                      id="edit-view-search"
                      value={filters.q ?? ""}
                      maxLength={200}
                      placeholder="Words in the title or notes"
                      onChange={(event) => change({ q: event.target.value || undefined })}
                    />
                  </div>
                  <TaskFilterFields
                    idPrefix="edit-view"
                    filters={filters}
                    onChange={change}
                    labels={here.labels}
                    types={here.types}
                    clients={here.clients}
                  >
                    {here.people ? (
                      <FilterRow id="edit-view-person" label="Assigned to">
                        <Select
                          value={filters.person ?? ANYONE}
                          onValueChange={(value) => change({ person: value === ANYONE ? undefined : value })}
                        >
                          <SelectTrigger id="edit-view-person" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ANYONE}>Anyone</SelectItem>
                            <SelectItem value={NOBODY_FILTER}>Nobody assigned</SelectItem>
                            {peopleWith(here.people, filters.person, view?.names.person).map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterRow>
                    ) : null}
                    {here.groups ? (
                      <FilterRow id="edit-view-group" label="Group">
                        <Select
                          value={filters.group ?? "none"}
                          onValueChange={(value) => change({ group: value as TaskGrouping })}
                        >
                          <SelectTrigger id="edit-view-group" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {here.groups.map((option) => (
                              <SelectItem key={option} value={option}>
                                {TASK_GROUPING_LABEL[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterRow>
                    ) : null}
                  </TaskFilterFields>
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

const ANYONE = "anyone"

/** The project's people, plus the view's own person if they have left, so the choice never reads blank. */
function peopleWith(people: { id: string; name: string }[], person: string | undefined, savedName: string | undefined) {
  if (!person || person === NOBODY_FILTER || people.some((p) => p.id === person)) return people
  return [...people, { id: person, name: savedName ? `${savedName} (left)` : "Someone who left" }]
}
