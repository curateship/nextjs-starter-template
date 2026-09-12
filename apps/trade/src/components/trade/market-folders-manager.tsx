import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { EyeIcon, EyeOffIcon, GripVerticalIcon, Trash2Icon } from "lucide-react"

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
  setHiddenMarket,
} from "@/lib/api/trade/market-folders"
import {
  ALL_ROW,
  type MarketFolder,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * One row of the panel: a folder, or the All markets row.
 *
 * All markets has no coins, no name to change and nothing to delete, so
 * `folder` is null and the cog window omits those controls.
 */
type PanelRow = {
  id: string
  name: string
  count: string
  position: number
  hidden: boolean
  folder: MarketFolder | null
}

function CreateFolderForm({
  busy,
  onCreate,
  inputId = "new-market-folder-name",
}: {
  busy: boolean
  onCreate: (name: string) => Promise<void>
  inputId?: string
}) {
  const [name, setName] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setAttempted(true)
    const trimmed = name.trim()
    if (!trimmed) {
      showErrorToast("Enter a folder name.")
      return
    }
    await onCreate(trimmed)
    setName("")
    setAttempted(false)
  }

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <Label htmlFor={inputId}>Folder name</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          aria-invalid={attempted && !name.trim()}
          placeholder="Majors"
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={busy}>
          Create folder
        </Button>
      </div>
    </form>
  )
}

export function MarketFoldersManager({
  folders,
  panelRows,
  protocol,
  network,
  catalogs,
  marketsError,
  marketsPending,
  onFoldersChange,
  onPanelRowsChange,
  manageOpen,
  onManageOpenChange,
}: {
  folders: readonly MarketFolder[]
  /** Where All markets sits and whether it is switched off. */
  panelRows: MarketPanelRows
  protocol: ProtocolId
  network: NetworkId
  catalogs: readonly FilteredMarketCatalog[]
  /** The exchange call failed at load; the All markets row shows it. */
  marketsError: string | null
  /** The list is still streaming in; rows show loading, not empty claims. */
  marketsPending: boolean
  onFoldersChange: (folders: MarketFolder[]) => void
  onPanelRowsChange: (rows: MarketPanelRows) => void
  /** The chart header folder menu opens this manager. */
  manageOpen?: boolean
  onManageOpenChange?: (open: boolean) => void
}) {
  const [localManageOpen, setLocalManageOpen] = React.useState(false)
  const managing = manageOpen ?? localManageOpen
  const setManaging = onManageOpenChange ?? setLocalManageOpen
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<MarketFolder | null>(null)
  const [busy, setBusy] = React.useState(false)
  const marketRows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )
  const markets = React.useMemo(
    () => new Map(marketRows.map((row) => [row.key, row])),
    [marketRows]
  )
  // Markets hidden by hand. Only the All markets row leaves them out; a named
  // folder still lists a market it holds, because the folder is a choice too.
  const hiddenByHand = React.useMemo(
    () => new Set(panelRows.hiddenMarketKeys),
    [panelRows.hiddenMarketKeys]
  )
  const allMarketsCount = React.useMemo(
    () => marketRows.filter((row) => !hiddenByHand.has(row.key)).length,
    [marketRows, hiddenByHand]
  )
  const sensors = useNavSensors()
  const hideRequest = React.useRef(0)

  // Every row of the panel, drawn one way: saved folders, then the catalogue.
  // All markets is not a folder, but it uses the same row and can be moved or
  // hidden with the folders.
  //
  // Built in the old fixed order and then sorted by saved place. The sort is
  // stable, so two rows that were given the same number keep this order, which
  // is what puts a folder created after a drag above All markets.
  const rows: PanelRow[] = [
    ...folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      count: `${folder.marketKeys.length} markets`,
      position: folder.position,
      hidden: folder.hidden,
      folder,
    })),
    {
      id: ALL_ROW,
      name: "All markets",
      // Blank when the list could not be read, and while it is still on its
      // way — the body carries the error or the loading row, and "0 markets"
      // beside either would be a claim the panel cannot make yet.
      count:
        marketsError || marketsPending
          ? ""
          : `${allMarketsCount} ${allMarketsCount === 1 ? "market" : "markets"}`,
      position: panelRows.all.position,
      hidden: panelRows.all.hidden,
      folder: null,
    },
  ].sort((left, right) => left.position - right.position)

  async function createNewFolder(name: string) {
    if (busy) return
    setBusy(true)
    try {
      onFoldersChange(await createFolder({ protocol, network, name }))
    } catch (error) {
      showErrorToast(getMarketFolderErrorMessage(error))
      throw error
    } finally {
      setBusy(false)
    }
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
      ...panelRows,
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

  /**
   * Hide one market from All markets, or show it again. The row goes at once
   * and the save runs behind it; a refused save puts the market back and
   * says why. Not tied to `busy`, because hiding a market is not a layout
   * save and should not wait for one. Only the newest save's answer is
   * applied: two quick hides each answer with the list as it stood when
   * they ran, and the older answer would flip the newer market back.
   */
  function setMarketHiddenByHand(marketKey: string, hidden: boolean) {
    const previous = panelRows
    const without = panelRows.hiddenMarketKeys.filter(
      (key) => key !== marketKey
    )
    onPanelRowsChange({
      ...panelRows,
      hiddenMarketKeys: hidden ? [...without, marketKey] : without,
    })
    const request = ++hideRequest.current
    void setHiddenMarket({ protocol, network, marketKey, hidden })
      .then((saved) => {
        if (request === hideRequest.current) onPanelRowsChange(saved)
      })
      .catch((error) => {
        if (request === hideRequest.current) onPanelRowsChange(previous)
        showErrorToast(getMarketFolderErrorMessage(error))
      })
  }

  // What to call a hidden market in the cog: its row where the list has one,
  // otherwise the bare market id from its key, so a delisted market still
  // has a name and a Show button.
  const hiddenByHandRows = React.useMemo(() => {
    const byVolume = new Map(
      catalogs
        .flatMap((catalog) => catalog.hiddenByVolumeRows)
        .map((row) => [row.key, row.symbol])
    )
    return panelRows.hiddenMarketKeys.map((key) => ({
      key,
      symbol:
        markets.get(key)?.symbol ??
        byVolume.get(key) ??
        parseMarketKey(key)?.marketId ??
        key,
    }))
  }, [panelRows.hiddenMarketKeys, markets, catalogs])

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
      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Manage folders</DialogTitle>
            <DialogDescription>
              Rename a folder, drag any row into the order you want, or press an
              eye to keep a row out of the folder menu. Deleting is for folders
              only.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>New folder</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <CreateFolderForm
                  busy={busy}
                  onCreate={createNewFolder}
                  inputId="manage-market-folder-name"
                />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Order</CardTitle>
                <CardDescription>
                  Drag to reorder. This is the order rows appear in the folder
                  menu. A row with a line through its eye is switched off and
                  keeps everything it holds.
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
            <Card size="sm">
              <CardHeader>
                <CardTitle>Hidden markets</CardTitle>
                <CardDescription>
                  Previously hidden markets. Markets under your daily volume
                  setting are a different list and come back on their own when
                  the setting changes.
                </CardDescription>
                <CardAction className="text-xs text-muted-foreground tabular-nums">
                  {hiddenByHandRows.length}{" "}
                  {hiddenByHandRows.length === 1 ? "market" : "markets"}
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                {hiddenByHandRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing is hidden by hand.
                  </p>
                ) : (
                  hiddenByHandRows.map((market) => (
                    <div
                      key={market.key}
                      className="flex h-10 items-center gap-3 rounded-lg px-1"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {market.symbol}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Show ${market.symbol}`}
                        onClick={() => setMarketHiddenByHand(market.key, false)}
                      >
                        Show
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setManaging(false)}>
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
  // Fav can be renamed and All markets cannot, because that row
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
