import * as React from "react"
import { BookmarkIcon, CheckIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FilterPopover } from "@/components/shared/filter-popover"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { deleteSavedView, getLibraryErrorMessage, saveView } from "@/lib/api/note/library"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  ANALYSED_FILTERS,
  ANALYSED_LABEL,
  countFilters,
  FILTER_KEYS,
  NOTE_PRIORITIES,
  NOTE_SOURCES,
  PRIORITY_LABEL,
  PROGRESS_FILTER_LABEL,
  PROGRESS_FILTERS,
  SOURCE_LABEL,
  VIEW_NAME_MAX,
  type LibraryPage,
  type LibraryView,
  type NoteFilters,
} from "@/lib/note/library/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const ANY = "__any"

/**
 * The middle header's Filter: a row per filter Tyler picked on 20 Oct 2026
 * (Source, Priority, Tag, Analysed, Plan progress) plus Author, then Clear and
 * Save as view. Every pick changes the list at once and lives in the address.
 */
export function NoteFilterMenu({
  page,
  filters,
  onChange,
  onSaved,
}: {
  page: LibraryPage
  filters: NoteFilters
  onChange: (filters: NoteFilters) => void
  onSaved: (view: { id: string }) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const count = countFilters(filters)
  const set = (patch: Partial<NoteFilters>) => onChange({ ...filters, ...patch })

  return (
    <>
      <FilterPopover
        count={count}
        open={open}
        onOpenChange={setOpen}
        onClear={() => onChange({})}
        save={
          <Button
            type="button"
            onClick={() => {
              if (count === 0) {
                showErrorToast("Pick a filter first, then save it as a view.")
                return
              }
              setOpen(false)
              setSaving(true)
            }}
          >
            Save as view
          </Button>
        }
      >
        <FilterRow
          id="note-filter-source"
          label="Source"
          value={filters.source}
          options={NOTE_SOURCES.map((source) => ({ value: source, label: SOURCE_LABEL[source] }))}
          onChange={(source) => set({ source })}
        />
        <FilterRow
          id="note-filter-priority"
          label="Priority"
          value={filters.priority}
          options={NOTE_PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))}
          onChange={(priority) => set({ priority })}
        />
        <FilterRow
          id="note-filter-tag"
          label="Tag"
          value={filters.tag}
          options={withPicked(
            page.tags.map((each) => ({ value: each.tag, label: each.tag })),
            filters.tag
          )}
          onChange={(tag) => set({ tag })}
        />
        <FilterRow
          id="note-filter-author"
          label="Author"
          value={filters.author}
          options={withPicked(
            page.authors.map((author) => ({ value: author.name, label: author.name })),
            filters.author
          )}
          onChange={(author) => set({ author })}
        />
        <FilterRow
          id="note-filter-analysed"
          label="Analysed"
          value={filters.analysed}
          options={ANALYSED_FILTERS.map((value) => ({ value, label: ANALYSED_LABEL[value] }))}
          onChange={(analysed) => set({ analysed })}
        />
        <FilterRow
          id="note-filter-progress"
          label="Plan progress"
          value={filters.progress}
          options={PROGRESS_FILTERS.map((value) => ({ value, label: PROGRESS_FILTER_LABEL[value] }))}
          onChange={(progress) => set({ progress })}
        />
      </FilterPopover>
      <SaveViewDialog
        open={saving}
        libraryId={page.library.id}
        filters={filters}
        onClose={() => setSaving(false)}
        onSaved={onSaved}
      />
    </>
  )
}

/** A pick the list no longer offers (a tag taken off every note) stays shown, so it can be cleared. */
function withPicked(options: { value: string; label: string }[], picked: string | undefined) {
  if (!picked || options.some((option) => option.value.toLowerCase() === picked.toLowerCase())) return options
  return [{ value: picked, label: picked }, ...options]
}

function FilterRow<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (value: T | undefined) => void
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** "YouTube short · High · hooks", so a view says what it shows before it is opened. */
export function describeFilters(filters: NoteFilters) {
  const parts: string[] = []
  if (filters.source) parts.push(SOURCE_LABEL[filters.source])
  if (filters.priority) parts.push(`${PRIORITY_LABEL[filters.priority]} priority`)
  if (filters.tag) parts.push(`#${filters.tag}`)
  if (filters.author) parts.push(filters.author)
  if (filters.analysed) parts.push(ANALYSED_LABEL[filters.analysed])
  if (filters.progress) parts.push(PROGRESS_FILTER_LABEL[filters.progress])
  return parts.join(" · ")
}

/**
 * The Views menu: the library's saved filter sets. Opening one sets the same
 * filters, and so the same address, as picking them by hand. A view whose tag
 * or author has gone from every note says so, and opens anyway. Deleting a
 * view never deletes a note.
 */
export function ViewsMenu({
  views,
  page,
  activeId,
  onOpen,
  onDeleted,
}: {
  views: LibraryView[]
  page: LibraryPage
  activeId: string | undefined
  onOpen: (view: LibraryView) => void
  onDeleted: (view: LibraryView) => Promise<void>
}) {
  const [run, busy] = useAsyncAction(getLibraryErrorMessage)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  // "Delete views…" turns the menu's rows into delete buttons until it closes.
  const [removing, setRemoving] = React.useState(false)

  function open(view: LibraryView) {
    const gone: string[] = []
    if (view.filters.tag && !page.tags.some((each) => each.tag === view.filters.tag)) {
      gone.push(`No note is tagged ${quoteOneLine(view.filters.tag)} any more`)
    }
    if (view.filters.author && !page.authors.some((each) => each.key === view.filters.author?.toLowerCase())) {
      gone.push(`No note is by ${quoteOneLine(view.filters.author)} any more`)
    }
    onOpen(view)
    if (gone.length) showErrorToast(`${gone.join(". ")}, so ${quoteOneLine(view.name)} shows nothing for it.`)
  }

  async function remove(view: LibraryView) {
    setDeleting(view.id)
    const ok = await run(async () => {
      await deleteSavedView(view.id)
      await onDeleted(view)
    }, `Deleted the view ${quoteOneLine(view.name)}.`)
    setDeleting(null)
    return ok
  }

  return (
    <DropdownMenu onOpenChange={(next) => (next ? undefined : setRemoving(false))}>
      <DropdownMenuTrigger asChild>
        <DashboardToolbarButton type="button" variant="ghost" aria-label={views.length ? `Views, ${views.length}` : "Views"}>
          <BookmarkIcon className="size-4" />
          <span className="@max-3xl:sr-only">Views</span>
          {views.length ? <span className="text-muted-foreground">{views.length}</span> : null}
        </DashboardToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {views.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">None yet. Pick filters, then Save as view in Filter.</p>
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
                  <span className="truncate text-xs text-muted-foreground">{describeFilters(view.filters)}</span>
                </span>
                {removing ? (
                  busy && deleting === view.id ? (
                    <Loader2Icon className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2Icon aria-hidden />
                  )
                ) : view.id === activeId ? (
                  <CheckIcon aria-hidden />
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
  )
}

function SaveViewDialog({
  open,
  libraryId,
  filters,
  onClose,
  onSaved,
}: {
  open: boolean
  libraryId: string
  filters: NoteFilters
  onClose: () => void
  onSaved: (view: { id: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName("")
      setInvalid(false)
    }
  }

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the view a name")
      return
    }
    setBusy(true)
    try {
      const view = await saveView(libraryId, name, filters)
      await onSaved(view)
      toast.success(`Saved the view ${quoteOneLine(name.trim())}.`)
      setBusy(false)
      onClose()
    } catch (error) {
      setBusy(false)
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    }
  }

  const picked = FILTER_KEYS.filter((key) => filters[key] !== undefined).length
  return (
    <FormDialog open={open} dirty={Boolean(name.trim())} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Save as view</DialogTitle>
            <DialogDescription>
              The {picked === 1 ? "filter" : `${picked} filters`} picked now, under a name, in this library's Views.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{describeFilters(filters)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="note-view-name">View name</Label>
                  <Input
                    id="note-view-name"
                    autoFocus
                    value={name}
                    maxLength={VIEW_NAME_MAX}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void save()
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create view
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
