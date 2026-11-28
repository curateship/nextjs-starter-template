import * as React from "react"
import { PlusIcon, Trash2Icon, VaultIcon } from "lucide-react"

import { CrmRowMenu } from "@/components/crm/crm-row"
import { ListHeader } from "@/components/content-app/list-header"
import { EmptyRecord } from "@/components/crm/record-frame"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SavedViewsControls, SaveViewDialog, type EditFields, type SavedViewsScreen } from "@/components/shared/saved-views"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { NoMatches, useOpenFirstRow, type SectionProps } from "@/components/viral/dashboard/section-parts"
import { NewIdeaDialog } from "@/components/viral/new-idea-dialog"
import { VaultBoard } from "@/components/viral/vault-board"
import { VaultFilterRows, vaultSearchPatch } from "@/components/viral/vault-filter-rows"
import { VaultItemPanel } from "@/components/viral/vault-item-panel"
import { VaultList } from "@/components/viral/vault-list"
import { VaultSelectedMenu } from "@/components/viral/vault-selected-menu"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { changeVaultItemsFn, type VaultItem } from "@/lib/api/viral/viral-vault"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { VaultStatus } from "@/lib/viral/vault"
import { describeVaultView, VAULT_SAVED_VIEW_KIND, vaultViewFilters } from "@/lib/viral/vault-saved-views"
import { filterVaultItems } from "@/lib/viral/vault-view"

type Data = Extract<ViralLoaded, { section: "vault" }>

/**
 * The Vault row (task features/03), which was the Vault page: every
 * project's saved ideas, or one project's, picked in the Projects block on
 * the left. Search, Select, Filter (status, tag, and Show as List or Board)
 * and Views sit in the one header, then "+ New idea". The open idea is on
 * the right in the shell's record frame, its ⋮ a tabbed menu. Dropping a
 * card on Sent in the Board stays refused: Sent turns on by itself after
 * Send to Video.
 */
export function VaultSection({ data, search, frame, onChanged, tabs }: SectionProps<Data>) {
  const setSearch = useListSearchNavigate()
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [selecting, setSelecting] = React.useState(false)
  const [newIdea, setNewIdea] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(new Set())
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleting, setDeleting] = React.useState<VaultItem | null>(null)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const { projects, tags, views } = data

  // A notes, status or tag change on the right shows in the list at once; the
  // next read of the row replaces these.
  const [edited, setEdited] = React.useState<Record<string, VaultItem>>({})
  const [loadedFrom, setLoadedFrom] = React.useState(data.items)
  if (loadedFrom !== data.items) {
    setLoadedFrom(data.items)
    setEdited({})
  }
  const items = React.useMemo(() => data.items.map((item) => edited[item.id] ?? item), [edited, data.items])

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
  const ids = shown.map((item) => item.id)
  useOpenFirstRow(ids, search.open)
  const openItem = search.open ? (items.find((item) => item.id === search.open) ?? null) : null
  const tickedIds = shown.filter((item) => ticked.has(item.id)).map((item) => item.id)
  const rightClicked = rightClick ? shown.find((item) => item.id === rightClick.id) : undefined

  /** A card dropped on another column. Sent is refused: it turns on only after Send to Video. */
  async function moveCard(item: VaultItem, status: VaultStatus) {
    if (status === "sent") {
      showErrorToast("Sent turns on by itself after Make a draft, so an idea can't be dragged there.")
      return
    }
    setEdited((was) => ({ ...was, [item.id]: { ...item, status } }))
    try {
      const result = await changeVaultItemsFn([item.id], { kind: "status", status })
      if (result.skipped.length) throw new Error(`VIRAL_SAYS: That idea is ${result.skipped[0].reason}.`)
      await onChanged()
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
    setSearch({ q: filters.q, status: filters.status, tag: filters.tag, project: filters.project, show: filters.show, open: undefined })
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
      <VaultFilterRows idPrefix="edit-vault-view" values={vaultViewFilters(filters)} tags={tags} onChange={(patch) => change(vaultSearchPatch(patch))} />
    </>
  )

  const total = items.length
  const filterCount = [search.status, search.tag, search.show].filter(Boolean).length
  const clearFilters = () => setSearch({ q: undefined, status: undefined, tag: undefined, show: undefined })

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <ListHeader
        tabs={tabs}
        end={<PanelReopenButton side="right" label="Show the idea" />}
        menuLabel="More for the vault"
        selected={
          selecting && tickedIds.length ? (
            <VaultSelectedMenu
              ids={tickedIds}
              tags={tags}
              onClear={() => setTicked(new Set())}
              onDone={async (change) => {
                if (change.kind === "delete") {
                  setTicked(new Set())
                  if (search.open && tickedIds.includes(search.open)) setSearch({ open: undefined })
                }
                await onChanged()
              }}
            />
          ) : null
        }
        search={{
          name: "vault-search",
          label: "Search the vault",
          placeholder: "Search ideas",
          value: search.q ?? "",
          onChange: (text) => setSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={
          total && !board
            ? {
                on: selecting,
                onToggle: () => {
                  setSelecting((on) => !on)
                  setTicked(new Set())
                },
              }
            : null
        }
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={filterCount}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => setSearch({ status: undefined, tag: undefined, show: undefined })}
            save={
              <Button type="button" onClick={saveAsView}>
                Save as view
              </Button>
            }
          >
            <VaultFilterRows idPrefix="vault-filter" values={currentView} tags={tags} onChange={(patch) => setSearch(vaultSearchPatch(patch))} />
          </FilterPopover>
        }
        view={
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
        }
        primary={
          <DashboardToolbarButton type="button" aria-label="New idea" onClick={() => setNewIdea(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New idea</span>
          </DashboardToolbarButton>
        }
      />
      {board && shown.length ? (
        <ScrollArea className="min-h-0 flex-1">
          <VaultBoard
            items={shown}
            selectedId={openItem?.id ?? null}
            showProject={!project}
            onPick={(item) => setSearch({ open: item.id })}
            onMove={(item, status) => void moveCard(item, status)}
          />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <VaultList
          items={shown}
          openId={openItem?.id ?? null}
          onOpen={(item) => setSearch({ open: item.id })}
          showProject={!project}
          ticks={
            selecting
              ? {
                  ticked,
                  onTick: toggleTick,
                  onTickAll: () => setTicked(ids.every((id) => ticked.has(id)) ? new Set() : new Set(ids)),
                }
              : null
          }
          onRightClick={(item, x, y) => setRightClick({ id: item.id, x, y })}
          empty={
            !total ? (
              "Save a video or a post to the vault from a project's right panel, or press New idea to type your own."
            ) : project && !items.some((item) => item.projectId === project.id) ? (
              "Nothing in this project's vault yet."
            ) : (
              <NoMatches words={search.q ?? ""} noun="ideas" onClear={clearFilters} />
            )
          }
        />
      )}
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{
            on: selecting,
            onToggle: () => {
              const on = !selecting
              setSelecting(on)
              setTicked(on ? new Set([rightClicked.id]) : new Set())
            },
          }}
          items={[{ label: "Delete from the vault", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting(rightClicked) }]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${project?.id ?? "all"}|${search.q ?? ""}|${filterCount}`,
    showRightFor: search.open,
    middle,
    right: {
      label: "Idea",
      showLabel: "Show the idea",
      content: openItem ? (
        <VaultItemPanel
          key={openItem.id}
          item={openItem}
          tags={tags}
          onChanged={(item) => setEdited((was) => ({ ...was, [item.id]: item }))}
          onDeleted={async () => {
            setSearch({ open: undefined })
            await onChanged()
          }}
        />
      ) : (
        <EmptyRecord
          title="Idea"
          icon={<VaultIcon aria-hidden />}
          line="Save a video or a post to the vault, or press New idea, and it opens here."
          hideLabel="Hide the idea"
        />
      ),
    },
    windows: (
      <>
        <SaveViewDialog open={savingView} here={viewsHere} filters={currentView as SavedViewValues} onClose={() => setSavingView(false)} />
        <NewIdeaDialog
          open={newIdea}
          projectId={project?.id}
          onClose={() => setNewIdea(false)}
          onCreated={async (item) => {
            await onChanged()
            // A project picked on the left that isn't the new idea's would hide it.
            setSearch({ open: item.id, ...(project && project.id !== item.projectId ? { project: item.projectId } : {}) })
          }}
        />
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete this idea from the vault?"
          description={`"${deleting?.title ?? ""}" leaves the vault with its notes and its tags.`}
          confirmLabel="Delete idea"
          loading={busy}
          onConfirm={() =>
            void run(async () => {
              if (!deleting) return
              const result = await changeVaultItemsFn([deleting.id], { kind: "delete" })
              if (result.skipped.length) throw new Error(`VIRAL_SAYS: ${result.skipped[0].reason}`)
              setDeleting(null)
              await onChanged()
            })
          }
        />
      </>
    ),
  })
}
