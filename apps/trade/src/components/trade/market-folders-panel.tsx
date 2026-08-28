import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
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
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  createFolder,
  deleteFolder,
  getMarketFolderErrorMessage,
  renameFolder,
  savePanelLayout,
} from "@/lib/api/market-folders"
import type { LiveRefusal } from "@/lib/trade/live"
import type { TradeOrder } from "@/lib/trade/paper"
import {
  ALL_ROW,
  WATCHED_ROW,
  type MarketFolder,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import { compareMarketChange24h } from "@/lib/trade/market-sort"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * One row of the panel: a folder, or one of the two rows that are not folders.
 *
 * Watched and All markets have no coins, no name to change and nothing to
 * delete, so `folder` is null on those two and the cog window leaves out the
 * controls that would have nothing to act on.
 */
type PanelRow = {
  id: string
  name: string
  count: string
  position: number
  hidden: boolean
  folder: MarketFolder | null
  body: React.ReactNode
}

export function MarketFoldersPanel({
  folders,
  panelRows,
  protocol,
  network,
  catalogs,
  marketsError,
  watchedOrders,
  walletName,
  selectedMarketKey,
  onFoldersChange,
  onPanelRowsChange,
  onSelectMarket,
  onRetryMarkets,
}: {
  folders: readonly MarketFolder[]
  /** Where Watched and All markets sit, and whether either is switched off. */
  panelRows: MarketPanelRows
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
  onPanelRowsChange: (rows: MarketPanelRows) => void
  onSelectMarket: (marketKey: string) => void
  onRetryMarkets: () => void
}) {
  // Watched opens the panel: a price you have money committed to beats a
  // market you might look at, which is the same reason the old panel opened
  // on its Watched tab. Whichever row now sits first wins if Watched has been
  // hidden or dragged down the list.
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
    () =>
      new Set(
        catalogs.flatMap((catalog) =>
          catalog.hiddenByVolumeRows.map((row) => row.key)
        )
      ),
    [catalogs]
  )
  const marketRows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )
  const sensors = useNavSensors()

  // Every row of the panel, drawn one way: Watched, the saved folders, then
  // the whole catalogue. Watched and All are not folders, but they wear a
  // folder's row (decided 23 Aug 2026) so the left column is one panel
  // instead of two — and since 24 Aug 2026 they drag and hide like one too.
  //
  // Built in the old fixed order and then sorted by saved place. The sort is
  // stable, so two rows that were given the same number keep this order, which
  // is what puts a folder created after a drag above All markets.
  const rows: PanelRow[] = [
    {
      id: WATCHED_ROW,
      name: "Watched",
      // A count that is not known yet says nothing rather than "0 waiting":
      // before the first read, and after one that failed, zero would be
      // claiming an answer the panel does not have.
      count:
        watchedOrders.settled && !watchedOrders.failed
          ? `${new Set(watchedOrders.rows.map((order) => order.marketKey)).size} waiting`
          : "",
      position: panelRows.watched.position,
      hidden: panelRows.watched.hidden,
      folder: null,
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
      const folderMarkets = folder.marketKeys
        .flatMap((key) => {
          const market = markets.get(key)
          return market ? [market] : []
        })
        .sort(compareMarketChange24h)
      return {
        id: folder.id,
        name: folder.name,
        count: `${folder.marketKeys.length} ${
          folder.marketKeys.length === 1 ? "market" : "markets"
        }`,
        position: folder.position,
        hidden: folder.hidden,
        folder,
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
      position: panelRows.all.position,
      hidden: panelRows.all.hidden,
      folder: null,
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
  ].sort((left, right) => left.position - right.position)

  const shown = rows.filter((row) => !row.hidden)

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

  /**
   * Save the whole arrangement: what order the rows sit in and which the eye
   * has switched off. The panel shows the change at once and puts back what it
   * had if the save is refused, so a failed drag never leaves the panel
   * showing an order the account does not have.
   */
  function saveLayout(rowIds: string[], hiddenRowIds: string[]) {
    const previousFolders = [...folders]
    const previousRows = panelRows
    const hidden = new Set(hiddenRowIds)
    onFoldersChange(
      folders.map((folder) => ({
        ...folder,
        position: rowIds.indexOf(folder.id),
        hidden: hidden.has(folder.id),
      }))
    )
    onPanelRowsChange({
      watched: {
        position: rowIds.indexOf(WATCHED_ROW),
        hidden: hidden.has(WATCHED_ROW),
      },
      all: { position: rowIds.indexOf(ALL_ROW), hidden: hidden.has(ALL_ROW) },
    })
    setBusy(true)
    void savePanelLayout({ protocol, network, rowIds, hiddenRowIds })
      .then((saved) => {
        onFoldersChange(saved.folders)
        onPanelRowsChange(saved.panelRows)
      })
      .catch((error) => {
        onFoldersChange(previousFolders)
        onPanelRowsChange(previousRows)
        showErrorToast(getMarketFolderErrorMessage(error))
      })
      .finally(() => setBusy(false))
  }

  const hiddenIds = rows.filter((row) => row.hidden).map((row) => row.id)

  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || busy) return
    const from = rows.findIndex((row) => row.id === event.active.id)
    const to = rows.findIndex((row) => row.id === event.over?.id)
    if (from < 0 || to < 0) return
    saveLayout(
      arrayMove(rows, from, to).map((row) => row.id),
      hiddenIds
    )
  }

  function toggleHidden(row: PanelRow) {
    if (busy) return
    saveLayout(
      rows.map((one) => one.id),
      row.hidden
        ? hiddenIds.filter((id) => id !== row.id)
        : [...hiddenIds, row.id]
    )
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
      <DashboardCardTitleHeader
        icon={<FolderIcon />}
        title="Folders"
        action={
          // gap-2, the same 8px the middle header keeps between its
          // controls — the two headers sit side by side.
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add folder"
                  className="bg-muted/60 dark:bg-muted/60"
                  onClick={() => setCreating((shown) => !shown)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add folder</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Manage folders"
                  className="bg-muted/60 dark:bg-muted/60"
                  onClick={() => {
                    setCreating(false)
                    setManaging(true)
                  }}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manage folders</TooltipContent>
            </Tooltip>
          </div>
        }
      />
      {creating ? (
        <form
          className="grid shrink-0 gap-2 border-b p-2"
          onSubmit={submitNewFolder}
        >
          <Label htmlFor="new-market-folder-name">Folder name</Label>
          <div className="flex gap-2">
            <Input
              id="new-market-folder-name"
              autoFocus
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
            <Button type="submit" disabled={busy || !newName.trim()}>
              Add
            </Button>
          </div>
        </form>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid">
          {shown.map((row, index) => {
            const expanded = expandedId === row.id
            const followsExpandedSection =
              index > 0 && expandedId === shown[index - 1]?.id
            return (
              <div key={row.id}>
                <div
                  className={cn(
                    "flex h-9 items-center border-b",
                    expanded && "border-t",
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
                      expanded ? "bg-muted" : "hover:bg-muted"
                    )}
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="w-[4.5rem] shrink-0 text-right text-xs font-normal text-muted-foreground tabular-nums">
                      {row.count}
                    </span>
                    <ChevronRightIcon
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-90"
                      )}
                    />
                  </button>
                </div>
                {expanded ? (
                  <div className="bg-muted/30">{row.body}</div>
                ) : null}
              </div>
            )
          })}
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Every row is switched off. Open the cog above and press an eye to
              bring one back.
            </p>
          ) : null}
        </div>
      </ScrollArea>
      {network === "testnet" ? <TestnetStrip /> : null}

      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Manage folders</DialogTitle>
            <DialogDescription>
              Rename a folder, drag any row into the order you want, or press an
              eye to keep a row out of the panel. Deleting is for folders only.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={submitNewFolder}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>New folder</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="manage-market-folder-name">Folder name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="manage-market-folder-name"
                      placeholder="Folder name"
                      value={newName}
                      maxLength={80}
                      disabled={busy}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                    <Button type="submit" disabled={busy || !newName.trim()}>
                      Create
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Order</CardTitle>
                <CardDescription>
                  Drag to reorder. This is the order rows appear in the panel. A
                  row with a line through its eye is switched off and keeps
                  everything it holds.
                </CardDescription>
                <CardAction className="text-xs text-muted-foreground tabular-nums">
                  {folders.length} {folders.length === 1 ? "folder" : "folders"}
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                <DndContext
                  id="trade-market-folders"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={reorder}
                >
                  <SortableContext
                    items={rows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid gap-2">
                      {rows.map((row) => (
                        <PanelRowManager
                          key={row.id}
                          row={row}
                          disabled={busy}
                          editing={editingId === row.id}
                          onEdit={() => setEditingId(row.id)}
                          onRename={(name) =>
                            row.folder && saveName(row.folder, name)
                          }
                          onFinishEdit={() => setEditingId(null)}
                          onToggleHidden={() => toggleHidden(row)}
                          onDelete={() => {
                            setEditingId(null)
                            setDeleting(row.folder)
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

function PanelRowManager({
  row,
  disabled,
  editing,
  onEdit,
  onRename,
  onFinishEdit,
  onToggleHidden,
  onDelete,
}: {
  row: PanelRow
  disabled: boolean
  editing: boolean
  onEdit: () => void
  onRename: (name: string) => void
  onFinishEdit: () => void
  onToggleHidden: () => void
  onDelete: () => void
}) {
  const [name, setName] = React.useState(row.name)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    row.id,
    true
  )
  // Fav can be renamed and Watched and All markets cannot, because those two
  // are not folders. Only a named folder can be deleted.
  const renameable = row.folder !== null
  const deletable = row.folder !== null && !row.folder.isFav
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
        aria-label={`Reorder ${row.name}`}
        disabled={disabled}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {editing && renameable ? (
        <Input
          autoFocus
          aria-label={`Rename ${row.name}`}
          value={name}
          maxLength={80}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (!name.trim()) setName(row.name)
            else if (name.trim() !== row.name) onRename(name)
            onFinishEdit()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              setName(row.name)
              onFinishEdit()
            }
          }}
        />
      ) : renameable ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left"
          disabled={disabled}
          onClick={() => {
            setName(row.name)
            onEdit()
          }}
        >
          <RowName name={row.name} count={row.count} hidden={row.hidden} />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <RowName name={row.name} count={row.count} hidden={row.hidden} />
        </div>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={row.hidden ? `Show ${row.name}` : `Hide ${row.name}`}
            aria-pressed={row.hidden}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onToggleHidden}
          >
            {row.hidden ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {row.hidden ? `Show ${row.name}` : `Hide ${row.name}`}
        </TooltipContent>
      </Tooltip>
      {deletable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.name}`}
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={onDelete}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{`Delete ${row.name}`}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

/** A hidden row is dimmed AND says so, never colour on its own. */
function RowName({
  name,
  count,
  hidden,
}: {
  name: string
  count: string
  hidden: boolean
}) {
  return (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium",
          hidden && "text-muted-foreground"
        )}
      >
        {name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {hidden ? "Hidden" : count}
      </span>
    </>
  )
}
