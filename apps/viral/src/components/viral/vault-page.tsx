import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { EyeIcon, VaultIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MassSelectChip } from "@/components/shared/mass-select"
import {
  SavedViewsControls,
  SaveViewDialog,
  type EditFields,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { ThreePanels } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VaultBoard } from "@/components/viral/vault-board"
import { VaultItemPanel } from "@/components/viral/vault-item-panel"
import { VaultList } from "@/components/viral/vault-list"
import { VaultSelectedMenu } from "@/components/viral/vault-selected-menu"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { changeVaultItemsFn, type VaultItem } from "@/lib/api/viral/viral-vault"
import { plural } from "@/lib/format/plural"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { VAULT_STATUSES, vaultStatusLabels, type VaultStatus } from "@/lib/viral/vault"
import {
  describeVaultView,
  VAULT_SAVED_VIEW_KIND,
  vaultViewFilters,
  type VaultShowAs,
  type VaultViewFilters,
} from "@/lib/viral/vault-saved-views"
import { filterVaultItems } from "@/lib/viral/vault-view"

const LAYOUT_KEY = "viral-vault-horizontal-1"
const PLACE_KEY = "viral-vault-place"
const ANY = "any"

export type VaultPageSearch = VaultViewFilters & { open?: string }

type VaultPageProject = { id: string; name: string; vaultCount: number }

/**
 * The Vault page (task part 19): every project's saved ideas in one
 * three-column dashboard, drawn as the project page is. The projects on the
 * left with their counts, "All projects" first; the picked project's ideas in
 * the middle, with search, Filter (status and tag, which combine) and Views;
 * the open idea on the right, the same panel the project page's vault opens.
 * Ideas only arrive from Save to vault, so there is no + Add. Filter's Show
 * as turns the middle into a board of the four statuses (task part 15,
 * Tyler: "List or Board switch").
 */
export function VaultPage({
  items: loadedItems,
  tags,
  projects,
  views,
  search,
}: {
  items: VaultItem[]
  tags: string[]
  projects: VaultPageProject[]
  views: SavedView[]
  search: VaultPageSearch
}) {
  const router = useRouter()
  const setSearch = useListSearchNavigate()
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [selecting, setSelecting] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(new Set())
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (next) =>
    setSearch({ q: next.trim() ? next : undefined })
  )

  // A notes, status or tag change on the right shows in the list at once; the
  // next read of the page replaces these.
  const [edited, setEdited] = React.useState<Record<string, VaultItem>>({})
  const [loadedFrom, setLoadedFrom] = React.useState(loadedItems)
  if (loadedFrom !== loadedItems) {
    setLoadedFrom(loadedItems)
    setEdited({})
  }
  const items = React.useMemo(() => loadedItems.map((item) => edited[item.id] ?? item), [edited, loadedItems])

  const project = search.project ? (projects.find((one) => one.id === search.project) ?? null) : null
  const projectId = project?.id
  const currentView = React.useMemo(
    () =>
      vaultViewFilters({
        ...(search.q ? { q: search.q } : {}),
        ...(search.status ? { status: search.status } : {}),
        ...(search.tag ? { tag: search.tag } : {}),
        ...(projectId ? { project: projectId } : {}),
        ...(search.show === "board" ? { show: "board" } : {}),
      }),
    [projectId, search.q, search.status, search.tag, search.show]
  )
  const board = currentView.show === "board"
  const shown = React.useMemo(() => filterVaultItems(items, currentView), [currentView, items])
  const openItem = search.open ? (items.find((item) => item.id === search.open) ?? null) : null
  const tickedIds = shown.filter((item) => ticked.has(item.id)).map((item) => item.id)

  // Picking a project, or an idea that has gone, opens the first idea shown,
  // so the right panel is never empty while the list has ideas (UI standard).
  const firstShownId = !openItem ? (shown[0]?.id ?? null) : null
  React.useEffect(() => {
    if (firstShownId) setSearch({ open: firstShownId })
  }, [firstShownId, setSearch])

  const refresh = React.useCallback(() => router.invalidate(), [router])

  function pickProject(id: string | undefined) {
    setTicked(new Set())
    setSearch({ project: id, open: undefined })
  }

  /** A card dropped on another column. Sent is refused: it turns on only after Send to Video. */
  async function moveCard(item: VaultItem, status: VaultStatus) {
    if (status === "sent") {
      showErrorToast("Sent turns on by itself after Send to Video, so an idea can't be dragged there.")
      return
    }
    setEdited((was) => ({ ...was, [item.id]: { ...item, status } }))
    try {
      const result = await changeVaultItemsFn([item.id], { kind: "status", status })
      if (result.skipped.length) throw new Error(`VIRAL_SAYS: That idea is ${result.skipped[0].reason}.`)
      await refresh()
    } catch (error) {
      setEdited((was) => ({ ...was, [item.id]: item }))
      showErrorToast(getViralErrorMessage(error))
    }
  }

  function toggleTick(id: string) {
    setTicked((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ------------------------------------------------------- Saved views --

  const viewsHere: SavedViewsScreen = {
    screen: savedViewScreen(VAULT_SAVED_VIEW_KIND, ""),
    describe: (filters) => {
      const kept = vaultViewFilters(filters)
      const name = kept.project ? projects.find((one) => one.id === kept.project)?.name : null
      return [name, describeVaultView(kept)].filter(Boolean).join(" · ")
    },
    kept: (filters) => vaultViewFilters(filters) as SavedViewValues,
    describeError: (error) => {
      const message = error instanceof Error ? error.message : ""
      return (Object.values(SAVED_VIEW_ERRORS) as string[]).includes(message) ? message : getViralErrorMessage(error)
    },
  }

  /** A view's project or tag that has since gone is said, and the view opens without it. */
  function openView(saved: SavedView) {
    const filters = vaultViewFilters(saved.filters)
    if (filters.project && !projects.some((one) => one.id === filters.project)) {
      showErrorToast(`The project in "${saved.name}" is gone, so it opened on every project.`)
      delete filters.project
    }
    if (filters.tag && !tags.some((tag) => tag.toLowerCase() === filters.tag?.toLowerCase())) {
      showErrorToast(`No idea carries the tag "${filters.tag}" any more, so "${saved.name}" opened without it.`)
      delete filters.tag
    }
    setTicked(new Set())
    setSearch({
      q: filters.q,
      status: filters.status,
      tag: filters.tag,
      project: filters.project,
      show: filters.show,
      open: undefined,
    })
  }

  function saveAsView() {
    setFilterOpen(false)
    if (Object.keys(currentView).length === 0) {
      showErrorToast("Search, pick a project or set a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const editViewFields: EditFields = ({ filters, change }) => (
    <>
      <div className="grid gap-2">
        <Label htmlFor="edit-vault-view-search">Search</Label>
        <Input
          id="edit-vault-view-search"
          value={typeof filters.q === "string" ? filters.q : ""}
          maxLength={200}
          placeholder="Words in the title, channel or notes"
          onChange={(event) => change({ q: event.target.value || undefined })}
        />
      </div>
      <VaultFilterRows
        idPrefix="edit-vault-view"
        values={vaultViewFilters(filters)}
        tags={tags}
        onChange={(patch) => change(searchPatch(patch))}
      />
    </>
  )

  // ------------------------------------------------------------- Panels --

  const total = items.length
  const left = (
    <>
      <DashboardCardTitleHeader icon={<VaultIcon />} title="Vault" meta={`${total} ${plural(total, "idea")}`} />
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Projects" className="grid gap-0.5 p-3">
          <ProjectRow name="All projects" count={total} picked={!project} onPick={() => pickProject(undefined)} />
          {projects.map((one) => (
            <ProjectRow
              key={one.id}
              name={one.name}
              count={one.vaultCount}
              picked={project?.id === one.id}
              onPick={() => pickProject(one.id)}
            />
          ))}
        </nav>
      </ScrollArea>
    </>
  )

  const filterCount = [search.status, search.tag].filter(Boolean).length
  const toolbar = total ? (
    <div className="flex shrink-0 items-center gap-1">
      {selecting && tickedIds.length ? (
        <VaultSelectedMenu
          ids={tickedIds}
          tags={tags}
          onClear={() => setTicked(new Set())}
          onDone={async (change) => {
            if (change.kind === "delete") {
              setTicked(new Set())
              if (search.open && tickedIds.includes(search.open)) setSearch({ open: undefined })
            }
            await refresh()
          }}
        />
      ) : null}
      <MassSelectChip
        on={selecting}
        onToggle={() => {
          setSelecting((on) => !on)
          setTicked(new Set())
        }}
      />
      <SearchToggle
        name="vault-search"
        label="Search the vault"
        placeholder="Search titles, channels and notes…"
        value={searchText}
        onChange={setSearchText}
      />
      <FilterPopover
        count={filterCount}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onClear={() => setSearch({ status: undefined, tag: undefined })}
        save={
          <Button type="button" onClick={saveAsView}>
            Save as view
          </Button>
        }
      >
        <VaultFilterRows
          idPrefix="vault-filter"
          values={currentView}
          tags={tags}
          onChange={(patch) => setSearch(searchPatch(patch))}
        />
      </FilterPopover>
      <SavedViewsControls
        here={viewsHere}
        views={views}
        filters={currentView as SavedViewValues}
        onOpen={openView}
        onClose={() => setSearch({ q: undefined, status: undefined, tag: undefined, project: undefined, show: undefined })}
        editFields={editViewFields}
        saveButton={false}
        buttonVariant="ghost"
      />
    </div>
  ) : undefined

  const middle = (
    <>
      <DashboardCardTitleHeader
        className="group/title @container"
        title={project?.name ?? "All projects"}
        meta={`${shown.length} ${plural(shown.length, "idea")}`}
        action={toolbar}
      />
      <ScrollArea className="min-h-0 flex-1">
        {!total ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            Save a video to the vault from a project's right panel.
          </p>
        ) : shown.length && board ? (
          <>
            <VaultBoard
              items={shown}
              selectedId={openItem?.id ?? null}
              showProject={!project}
              onPick={(item) => setSearch({ open: item.id })}
              onMove={(item, status) => void moveCard(item, status)}
            />
            <ScrollBar orientation="horizontal" />
          </>
        ) : shown.length ? (
          <VaultList
            items={shown}
            selectedId={openItem?.id ?? null}
            onPick={(item) => setSearch({ open: item.id })}
            showProject={!project}
            ticked={selecting ? ticked : undefined}
            onTick={selecting ? toggleTick : undefined}
          />
        ) : (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {project && !project.vaultCount ? "Nothing in this project's vault yet." : "No idea matches these filters."}
          </p>
        )}
      </ScrollArea>
    </>
  )

  const right = openItem ? (
    <VaultItemPanel
      key={openItem.id}
      item={openItem}
      tags={tags}
      onChanged={(item) => setEdited((was) => ({ ...was, [item.id]: item }))}
      onDeleted={async () => {
        setSearch({ open: undefined })
        await refresh()
      }}
    />
  ) : (
    <>
      <DashboardCardTitleHeader icon={<EyeIcon />} title="Idea" />
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        Click an idea to play it and read its script here.
      </p>
    </>
  )

  return (
    <ThreePanels
      layoutKey={LAYOUT_KEY}
      place={{ key: PLACE_KEY, search, ids: shown.map((item) => item.id) }}
      showMiddleFor={project?.id ?? "all"}
      showRightFor={openItem?.id}
      left={{ label: "Projects", showLabel: "Show the projects", content: left }}
      middle={{ label: "Ideas", content: middle }}
      right={{ label: "Idea", showLabel: "Show the idea", content: right }}
    >
      <SaveViewDialog
        open={savingView}
        here={viewsHere}
        filters={currentView as SavedViewValues}
        onClose={() => setSavingView(false)}
      />
    </ThreePanels>
  )
}

function ProjectRow({
  name,
  count,
  picked,
  onPick,
}: {
  name: string
  count: number
  picked: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={picked ? "true" : undefined}
      onClick={onPick}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-hidden hover:bg-muted focus-visible:bg-muted",
        picked && "bg-muted font-medium"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

type VaultFilterPatch = { status?: VaultStatus; tag?: string; show?: VaultShowAs }

/** A filter row's change as the address keeps it: List is the default, so it is left out. */
function searchPatch(patch: VaultFilterPatch): Omit<VaultViewFilters, "q" | "project"> {
  const { show, ...rest } = patch
  return "show" in patch ? { ...rest, show: show === "board" ? "board" : undefined } : rest
}

function VaultFilterRows({
  idPrefix,
  values,
  tags,
  onChange,
}: {
  idPrefix: string
  values: VaultViewFilters
  tags: string[]
  onChange: (patch: VaultFilterPatch) => void
}) {
  // A tag kept in a view but no longer on any idea still shows, so it can be cleared.
  const tagChoices = values.tag && !tags.includes(values.tag) ? [values.tag, ...tags] : tags
  return (
    <>
      <FilterRow id={`${idPrefix}-status`} label="Status">
        <Select
          value={values.status ?? ANY}
          onValueChange={(next) => onChange({ status: next === ANY ? undefined : (next as VaultStatus) })}
        >
          <SelectTrigger id={`${idPrefix}-status`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {VAULT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {vaultStatusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-tag`} label="Tag">
        <Select value={values.tag ?? ANY} onValueChange={(next) => onChange({ tag: next === ANY ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-tag`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any tag</SelectItem>
            {tagChoices.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-show`} label="Show as">
        <Select value={values.show ?? "list"} onValueChange={(next) => onChange({ show: next as VaultShowAs })}>
          <SelectTrigger id={`${idPrefix}-show`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="list">List</SelectItem>
            <SelectItem value="board">Board</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
    </>
  )
}

function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
