import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronRightIcon,
  FolderIcon,
  GripVerticalIcon,
  LockIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import {
  AllMarketsList,
  MarketRowLine,
  TestnetStrip,
} from "@/components/trade/market-list-panel"
import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  createFolder,
  deleteFolder,
  getMarketFolderErrorMessage,
  reorderFolders,
  renameFolder,
} from "@/lib/api/market-folders"
import type { LiveRefusal } from "@/lib/trade/live"
import type { TradeOrder } from "@/lib/trade/paper"
import type { MarketFolder } from "@/lib/trade/market-folders"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The ids of the two rows that are not folders. Real folder ids are UUIDs,
 * so neither can collide with one.
 */
const WATCHED_ROW = "watched"
const ALL_ROW = "all"

export function MarketFoldersPanel({
  folders,
  protocol,
  network,
  catalogs,
  marketsError,
  watchedOrders,
  walletName,
  selectedMarketKey,
  onFoldersChange,
  onSelectMarket,
  onRetryMarkets,
}: {
  folders: readonly MarketFolder[]
  protocol: ProtocolId
  network: NetworkId
  catalogs: readonly FilteredMarketCatalog[]
  /** The exchange call failed at load; the All markets row shows it. */
  marketsError: string | null
  /** The prices being waited at, listed under the Watched row. */
  watchedOrders: {
    rows: readonly TradeOrder[]
    /** Which account and exchange the cached list belongs to. */
    cacheScope: string
    /** Both halves of the trading read have landed — see `Trading`. */
    settled: boolean
    /** That read failed and there is nothing to fall back on. */
    failed: boolean
    /** The last refusal on each market, so a stuck level can say why. */
    refusals: ReadonlyMap<string, LiveRefusal>
    onRetry: () => void
  }
  /** Each wallet's name, so a waiting price says which wallet it is in. */
  walletName: (walletId: string) => string
  selectedMarketKey: string | null
  onFoldersChange: (folders: MarketFolder[]) => void
  onSelectMarket: (marketKey: string) => void
  onRetryMarkets: () => void
}) {
  // Watched opens the panel: a price you have money committed to beats a
  // market you might look at, which is the same reason the old panel opened
  // on its Watched tab.
  const [expandedId, setExpandedId] = React.useState<string | null>(WATCHED_ROW)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [managing, setManaging] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<MarketFolder | null>(null)
  const [busy, setBusy] = React.useState(false)
  const markets = React.useMemo(
    () =>
      new Map(
        catalogs.flatMap((catalog) => catalog.rows).map((row) => [row.key, row])
      ),
    [catalogs]
  )
  const hiddenByVolume = React.useMemo(
    () => new Set(catalogs.flatMap((catalog) => catalog.hiddenByVolumeKeys)),
    [catalogs]
  )
  const marketRows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )
  const sensors = useNavSensors()

  // Every row of the panel, drawn one way: Watched first — a price you have
  // money committed to beats a market you might look at — then the saved
  // folders, then the whole catalogue last. Watched and All are not folders,
  // but they wear a folder's row (decided 23 Aug 2026) so the left column is
  // one panel instead of two.
  const sections: {
    id: string
    name: string
    count: string
    body: React.ReactNode
  }[] = [
    {
      id: WATCHED_ROW,
      name: "Watched",
      // A count that is not known yet says nothing rather than "0 waiting":
      // before the first read, and after one that failed, zero would be
      // claiming an answer the panel does not have.
      count:
        watchedOrders.settled && !watchedOrders.failed
          ? `${watchedOrders.rows.length} waiting`
          : "",
      body: (
        <WatchedOrdersList
          orders={watchedOrders.rows}
          markets={marketRows}
          cacheScope={watchedOrders.cacheScope}
          refusals={watchedOrders.refusals}
          walletName={walletName}
          settled={watchedOrders.settled}
          failed={watchedOrders.failed}
          onRetry={watchedOrders.onRetry}
          onSelectMarket={onSelectMarket}
          selectedKey={selectedMarketKey}
        />
      ),
    },
    ...folders.map((folder) => {
      const folderMarkets = folder.marketKeys.flatMap((key) => {
        const market = markets.get(key)
        return market ? [market] : []
      })
      return {
        id: folder.id,
        name: folder.name,
        count: `${folder.marketKeys.length} ${
          folder.marketKeys.length === 1 ? "market" : "markets"
        }`,
        body:
          folderMarkets.length > 0 ? (
            <div className="flex flex-col">
              {folderMarkets.map((market) => (
                <MarketRowLine
                  key={market.key}
                  row={market}
                  selected={market.key === selectedMarketKey}
                  onSelect={() => onSelectMarket(market.key)}
                />
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {folder.marketKeys.some((key) => hiddenByVolume.has(key))
                ? `${folder.name}'s markets are hidden by your daily volume setting.`
                : folder.marketKeys.length > 0
                  ? `${folder.name}'s saved markets are not available in the current market list.`
                  : `${folder.name} is empty. Add a coin with the star beside its name.`}
            </p>
          ),
      }
    }),
    {
      id: ALL_ROW,
      name: "All markets",
      // Blank when the list could not be read — the body carries the error
      // and the retry, and "0 markets" beside a failed read would be a claim.
      count: marketsError
        ? ""
        : `${marketRows.length} ${marketRows.length === 1 ? "market" : "markets"}`,
      body: (
        <AllMarketsList
          catalogs={catalogs}
          marketsError={marketsError}
          selectedKey={selectedMarketKey}
          onSelect={onSelectMarket}
          onRetry={onRetryMarkets}
        />
      ),
    },
  ]

  function submitNewFolder(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !newName.trim()) return
    setBusy(true)
    void createFolder({ protocol, network, name: newName })
      .then((next) => {
        onFoldersChange(next)
        setNewName("")
        setCreating(false)
      })
      .catch((error) => showErrorToast(getMarketFolderErrorMessage(error)))
      .finally(() => setBusy(false))
  }

  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || busy) return
    const named = folders.filter((folder) => !folder.isFav)
    const from = named.findIndex((folder) => folder.id === event.active.id)
    const to = named.findIndex((folder) => folder.id === event.over?.id)
    if (from < 0 || to < 0) return
    const moved = arrayMove(named, from, to).map((folder, index) => ({
      ...folder,
      position: index + 1,
    }))
    const previous = [...folders]
    const next = [...folders.filter((folder) => folder.isFav), ...moved]
    onFoldersChange(next)
    setBusy(true)
    void reorderFolders({
      protocol,
      network,
      folderIds: moved.map((folder) => folder.id),
    })
      .then(onFoldersChange)
      .catch((error) => {
        onFoldersChange(previous)
        showErrorToast(getMarketFolderErrorMessage(error))
      })
      .finally(() => setBusy(false))
  }

  function saveName(folder: MarketFolder, name: string) {
    if (busy || name.trim() === folder.name) return
    setBusy(true)
    void renameFolder(folder.id, name)
      .then(onFoldersChange)
      .catch((error) => showErrorToast(getMarketFolderErrorMessage(error)))
      .finally(() => setBusy(false))
  }

  return (
    <>
      <WorkspacePanelHeader
        icon={<FolderIcon />}
        title="Folders"
        // 12px sides, matching the ~11px above the 28px buttons — the same
        // evening-up Tyler asked for on the market header (23 Aug 2026).
        className="px-3 sm:px-3"
        action={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Add folder"
              title="Add folder"
              className="bg-muted/60 dark:bg-muted/60"
              onClick={() => setCreating((shown) => !shown)}
            >
              <PlusIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Manage folders"
              title="Manage folders"
              className="bg-muted/60 dark:bg-muted/60"
              onClick={() => {
                setCreating(false)
                setManaging(true)
              }}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </div>
        }
      />
      {creating ? (
        <form
          className="flex shrink-0 items-center gap-2 border-b p-2"
          onSubmit={submitNewFolder}
        >
          <Input
            autoFocus
            aria-label="Folder name"
            placeholder="Folder name"
            value={newName}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setCreating(false)
                setNewName("")
              }
            }}
          />
          <Button type="submit" size="sm" disabled={busy || !newName.trim()}>
            Add
          </Button>
        </form>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
        <div className="grid">
          {sections.map((section, index) => {
            const expanded = expandedId === section.id
            const followsExpandedSection =
              index > 0 && expandedId === sections[index - 1]?.id
            return (
              <div key={section.id}>
                <div
                  className={cn(
                    "flex h-9 items-center border-b",
                    followsExpandedSection && "border-t"
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    // Open rows keep the same gray fill a selected market
                    // row wears, so which section is open never depends on
                    // the chevron alone.
                    className={cn(
                      "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-medium",
                      expanded ? "bg-muted" : "hover:bg-muted/50"
                    )}
                    onClick={() => setExpandedId(expanded ? null : section.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {section.name}
                    </span>
                    <span className="w-[4.5rem] shrink-0 text-right text-xs font-normal text-muted-foreground tabular-nums">
                      {section.count}
                    </span>
                    <ChevronRightIcon
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-90"
                      )}
                    />
                  </button>
                </div>
                {expanded ? section.body : null}
              </div>
            )
          })}
        </div>
      </ScrollArea>
      {network === "testnet" ? <TestnetStrip /> : null}

      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Manage folders</DialogTitle>
            <DialogDescription>
              Rename folders, drag them into order, or delete ones you no longer
              need. Fav always stays first.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={submitNewFolder}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>New folder</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Input
                    id="manage-market-folder-name"
                    aria-label="New folder name"
                    placeholder="Folder name"
                    value={newName}
                    maxLength={80}
                    disabled={busy}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <Button type="submit" disabled={busy || !newName.trim()}>
                    Create
                  </Button>
                </CardContent>
              </Card>
            </form>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Order</CardTitle>
                <CardDescription>
                  Drag to reorder. This is the order folders appear in the
                  sidebar.
                </CardDescription>
                <CardAction className="text-xs text-muted-foreground tabular-nums">
                  {folders.length} {folders.length === 1 ? "folder" : "folders"}
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                {folders
                  .filter((folder) => folder.isFav)
                  .map((folder) => (
                    <div
                      key={folder.id}
                      className="flex h-10 items-center gap-3 px-2"
                    >
                      <LockIcon className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {folder.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Always first
                      </span>
                    </div>
                  ))}
                <DndContext
                  id="trade-market-folders"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={reorder}
                >
                  <SortableContext
                    items={folders
                      .filter((folder) => !folder.isFav)
                      .map((folder) => folder.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid gap-2">
                      {folders
                        .filter((folder) => !folder.isFav)
                        .map((folder) => (
                          <FolderManagerRow
                            key={folder.id}
                            folder={folder}
                            disabled={busy}
                            editing={editingId === folder.id}
                            onEdit={() => setEditingId(folder.id)}
                            onRename={(name) => saveName(folder, name)}
                            onFinishEdit={() => setEditingId(null)}
                            onDelete={() => {
                              setEditingId(null)
                              setDeleting(folder)
                            }}
                          />
                        ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManaging(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "folder"}?`}
        description="The folder and its saved coins will be removed. Any flow using it will refuse to start."
        confirmLabel="Delete folder"
        loading={busy}
        onConfirm={() => {
          if (!deleting) return
          const removedId = deleting.id
          setBusy(true)
          void deleteFolder(removedId)
            .then((next) => {
              onFoldersChange(next)
              if (expandedId === removedId) setExpandedId(null)
              setDeleting(null)
            })
            .catch((error) =>
              showErrorToast(getMarketFolderErrorMessage(error))
            )
            .finally(() => setBusy(false))
        }}
      />
    </>
  )
}

function FolderManagerRow({
  folder,
  disabled,
  editing,
  onEdit,
  onRename,
  onFinishEdit,
  onDelete,
}: {
  folder: MarketFolder
  disabled: boolean
  editing: boolean
  onEdit: () => void
  onRename: (name: string) => void
  onFinishEdit: () => void
  onDelete: () => void
}) {
  const [name, setName] = React.useState(folder.name)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    folder.id,
    true
  )
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg px-1",
        editing && "bg-muted"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASS}
        aria-label={`Reorder ${folder.name}`}
        disabled={disabled}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {editing ? (
        <>
          <Input
            autoFocus
            aria-label={`Rename ${folder.name}`}
            value={name}
            maxLength={80}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) setName(folder.name)
              else if (name.trim() !== folder.name) onRename(name)
              onFinishEdit()
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                setName(folder.name)
                onFinishEdit()
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${folder.name}`}
            title={`Delete ${folder.name}`}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left"
          disabled={disabled}
          onClick={() => {
            setName(folder.name)
            onEdit()
          }}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {folder.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {folder.marketKeys.length}{" "}
            {folder.marketKeys.length === 1 ? "market" : "markets"}
          </span>
        </button>
      )}
    </div>
  )
}
