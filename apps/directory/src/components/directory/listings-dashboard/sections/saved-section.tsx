import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, ExternalLinkIcon, Trash2Icon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote } from "@/components/directory/listings-dashboard/detail-rows"
import {
  AutoSaveWords,
  ListPager,
  NoMatches,
  PickGroup,
  PrefetchMark,
  RecordMenu,
  makeRecordCache,
  prefetchHandlers,
  useAutoSave,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell } from "@/components/ui/table"
import {
  adminDeleteSavedLists,
  adminRemoveSavedItem,
  adminRenameSavedList,
  adminSetSavedListPublic,
  getSaveErrorMessage,
  loadAdminSavedList,
  SAVED_COLLECTION_SORT_COLUMNS,
  type AdminSavedCollection,
  type AdminSavedCollectionSummary,
  type loadSavesAdmin,
  type SavedCollectionSortColumn,
} from "@/lib/api/directory/saves"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

type Data = Awaited<ReturnType<typeof loadSavesAdmin>>

/** One read per list, shared by a hover and the open. */
const listCache = makeRecordCache((id: string) => loadAdminSavedList(id))

/**
 * The Saved lists row: the lists visitors keep of listings on the site. It
 * was the top table of the Saves page; Most saved listings under it is an
 * Overview widget now.
 *
 * - **Header:** "N selected" (Delete), search, Select.
 * - **Rows:** owner, listings and whether it is public. The public switch
 *   that sat in each row is a Visibility row in the list's ⋮ (Tyler's polish
 *   pick, 18 Nov 2026: "A saved list's Public switch leaves the row and
 *   becomes a Visibility row in the list's ⋮"), so a scroll never flips one.
 * - **Right:** the list's name, saving by itself, and its listings, each
 *   opening its listing and each with an × to take it out.
 */
export function SavedSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const page = data.savedLists
  const q = search.q ?? ""
  const sort = statusIn(search.sort, SAVED_COLLECTION_SORT_COLUMNS) ?? "name"
  const direction = search.direction ?? "asc"
  const toggleSort = useListSort<SavedCollectionSortColumn>({ sort, direction })
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleting, setDeleting] = React.useState<AdminSavedCollectionSummary[] | null>(null)
  const [run, busy] = useAsyncAction(getSaveErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  const listKey = `${q}|${sort}|${direction}|${page.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = page.collections.map((row) => row.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = page.collections.find((row) => row.id === openId) ?? null

  const refresh = async () => {
    listCache.forget()
    await onChanged()
  }
  const actionsFor = (row: AdminSavedCollectionSummary): RowMenuItem[] => [
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting([row]) },
  ]
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const ticked = page.collections.filter((row) => selection.selected.has(row.id))
  const rightClicked = rightClick ? page.collections.find((row) => row.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card" {...prefetchHandlers((id) => listCache.prefetch(id))}>
      <CrmListHeader
        tabs={<MiddleHeading icon={BookmarkIcon} label="Saved lists" />}
        end={<PanelReopenButton side="right" label="Show the saved list" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    setDeleting(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for saved lists"
        search={{
          name: "saved-list-search",
          label: "Search saved lists by name or owner",
          placeholder: "Search saved lists",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      <CrmTable<SavedCollectionSortColumn>
        columns={[
          { key: "name", label: "List", column: "main", className: "min-w-40" },
          { key: "owner", label: "Made by", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "listings", label: "Listings", column: "meta" },
          { key: "visibility", label: "Visibility", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? { noun: "saved lists", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          page.collections.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="saved lists" onClear={() => setListSearch({ q: undefined, page: undefined })} />
          ) : (
            "Nobody has saved a list on this site yet."
          )
        }
      >
        {page.collections.map((row) => (
          <CrmTableRow
            key={row.id}
            open={row.id === openId}
            label={row.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) }}
            onOpen={() => {
              setPressedId(row.id)
              setOpen(row.id)
            }}
            onDelete={() => setDeleting([row])}
            onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
          >
            <MainCell name={row.name} line={row.ownerEmail}>
              <PrefetchMark id={row.id} />
            </MainCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              <span className="block max-w-40 truncate">{row.ownerName}</span>
            </TableCell>
            <TableCell column="mutedMeta" className="tabular-nums">
              {row.itemCount}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
              <Chip muted>{row.isPublic ? "Public" : "Private"}</Chip>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={page.page} pageSize={page.pageSize} total={page.total} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={actionsFor(rightClicked)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Saved list",
      showLabel: "Show the saved list",
      content: openId ? (
        <SavedListRecord
          key={openId}
          listId={openId}
          title={openRow?.name ?? "Saved list"}
          actions={openRow ? actionsFor(openRow) : []}
          onChanged={() => {
            listCache.forget(openId)
            void onChanged()
          }}
        />
      ) : (
        <EmptyRecord
          title="Saved list"
          icon={<BookmarkIcon aria-hidden />}
          line={page.total ? "Click a saved list to see it here." : "Nobody has saved a list yet."}
          hideLabel="Hide the saved list"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} saved lists?` : "Delete this saved list?"}
        description="The people who made them lose them, and a public one's page stops existing. The listings in them stay."
        confirmLabel={deleting && deleting.length > 1 ? `Delete ${deleting.length} lists` : "Delete list"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!deleting) return
            await adminDeleteSavedLists(deleting.map((row) => row.id))
            setDeleting(null)
            selection.clear()
            await refresh()
          })
        }
      />
    ),
  })
}

function SavedListRecord({
  listId,
  title,
  actions,
  onChanged,
}: {
  listId: string
  title: string
  actions: RowMenuItem[]
  onChanged: () => void
}) {
  const read = useLoad(() => listCache.get(listId), getSaveErrorMessage, { keys: [listId] })
  if (!read.data) {
    return (
      <RecordFrame
        avatar={<BookmarkIcon aria-hidden />}
        title={title}
        hideLabel="Hide the saved list"
        body={read.error ? <ErrorRow message={read.error} onRetry={read.retry} /> : <LoadingRow label="Opening the saved list…" />}
      />
    )
  }
  return <SavedListForm key={listId} list={read.data} actions={actions} onChanged={onChanged} />
}

/** One saved list on the right: its name saving by itself, its visibility in the ⋮, its listings. */
function SavedListForm({ list, actions, onChanged }: { list: AdminSavedCollection; actions: RowMenuItem[]; onChanged: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = React.useState(list.name)
  const [isPublic, setIsPublic] = React.useState(list.isPublic)
  const [items, setItems] = React.useState(list.items)
  const ready = name.trim().length > 0
  const auto = useAutoSave({
    value: { name: name.trim() },
    ready,
    message: getSaveErrorMessage,
    save: async (next) => {
      await adminRenameSavedList(list.id, next.name)
      onChanged()
    },
  })
  const setVisibility = (next: boolean) => {
    const was = isPublic
    setIsPublic(next)
    adminSetSavedListPublic(list.id, next)
      .then(onChanged)
      .catch((error: unknown) => {
        setIsPublic(was)
        showErrorToast(getSaveErrorMessage(error))
      })
  }
  const remove = (listingId: string) => {
    const was = items
    setItems((current) => current.filter((item) => item.id !== listingId))
    adminRemoveSavedItem(list.id, listingId)
      .then(onChanged)
      .catch((error: unknown) => {
        setItems(was)
        showErrorToast(getSaveErrorMessage(error))
      })
  }

  return (
    <RecordFrame
      avatar={<BookmarkIcon aria-hidden />}
      title={name.trim() || "Untitled list"}
      line={`${list.ownerName} · ${isPublic ? "Public" : "Private"}`}
      hideLabel="Hide the saved list"
      actions={
        <RecordMenu
          label="Saved list menu"
          groups={
            <PickGroup title="Saved list">
              <PickMenuRow
                label="Visibility"
                value={isPublic ? "Public" : "Private"}
                options={[
                  { value: "public", label: "Public" },
                  { value: "private", label: "Private" },
                ]}
                selected={isPublic ? "public" : "private"}
                onPick={(value) => setVisibility(value === "public")}
              />
            </PickGroup>
          }
          actions={[
            ...(isPublic
              ? [{ label: "Open the public page", icon: <ExternalLinkIcon className="size-4" />, onSelect: () => void window.open(list.profileUrl, "_blank", "noreferrer") }]
              : []),
            ...actions,
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="saved-list-basics" icon={<BookmarkIcon />} title="The list" openWhen={!ready}>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="admin-saved-list-name">Name</FieldLabel>
                <CharacterCount value={name} max={80} />
              </div>
              <Input id="admin-saved-list-name" value={name} maxLength={80} aria-invalid={!ready} onChange={(event) => setName(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                Made by {list.ownerName} ({list.ownerEmail}).
              </p>
            </div>
          </PanelCard>
          <PanelCard storageId="saved-list-listings" icon={<BookmarkIcon />} title="Listings" meta={items.length || undefined}>
            {items.length ? (
              <div className="-mx-1.5 grid">
                {items.map((item) => (
                  <div key={item.id} className="group/item flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => void navigate({ to: "/admin/listings", search: { open: item.id } })}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.address ? <span className="hidden shrink-0 truncate text-xs text-muted-foreground @xs:inline">{item.address}</span> : null}
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Take ${item.title} out of the list`} onClick={() => remove(item.id)}>
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <DetailNote>This saved list is empty.</DetailNote>
            )}
          </PanelCard>
        </>
      }
      footer={
        <FooterState>
          <AutoSaveWords state={auto.state} ready={ready} why="Give it a name to save" />
          <span className="text-muted-foreground">
            · {items.length} {plural(items.length, "listing", "listings")}
          </span>
        </FooterState>
      }
    />
  )
}
