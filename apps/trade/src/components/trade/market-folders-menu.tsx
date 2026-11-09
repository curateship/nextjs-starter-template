import * as React from "react"
import { ChevronRightIcon, FolderCogIcon, PlusIcon } from "lucide-react"

import { LoadingRow } from "@/components/ui/loading-row"
import { ErrorRow } from "@/components/ui/error-row"
import { MarketFoldersManager } from "@/components/trade/market-folders-manager"
import { MarketRowLine } from "@/components/trade/market-list-panel"
import { useBlockFills } from "@/components/trade/notes/trade-block-views"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  createFolder,
  getMarketFolderErrorMessage,
} from "@/lib/api/trade/market-folders"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { MarketFolder, MarketPanelRows } from "@/lib/trade/market-folders"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import { compareMarketChange24h } from "@/lib/trade/market-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The dashboard's Folders block (the Admin 3 panel design, 7 Nov 2026): the
 * saved folders and the markets inside them, drawn in place on the page. A
 * new folder and Manage folders are rows of the block's ⋮
 * (`FoldersBlockMenuRows`; Tyler, 8 Nov 2026: "replace these 2 icons wil the
 * 3 dot dropdown. inside have add folder name, manage folder and delete
 * block"), and Manage folders opens a popover beside the block ("replace the
 * manage folder modal with a popover instead").
 */
export function MarketFoldersMenu({
  folders,
  protocol,
  network,
  catalogs,
  selectedMarketKey,
  onFoldersChange,
  onPanelRowsChange,
  managing,
  onManagingChange,
  onSelectMarket,
  panelRows,
  marketsError,
  marketsPending,
  onRetryMarkets,
}: {
  panelRows: MarketPanelRows
  onPanelRowsChange: (rows: MarketPanelRows) => void
  /** Manage folders is open, from the block's ⋮. */
  managing: boolean
  onManagingChange: (open: boolean) => void
  marketsError: string | null
  marketsPending: boolean
  onRetryMarkets: () => void
  folders: readonly MarketFolder[]
  protocol: ProtocolId
  network: NetworkId
  catalogs: readonly FilteredMarketCatalog[]
  selectedMarketKey: string | null
  onFoldersChange: (folders: MarketFolder[]) => void
  onSelectMarket: (marketKey: string) => void
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  // The block reaches the panel's bottom, so the list takes all of it.
  const fills = useBlockFills()
  const markets = React.useMemo(
    () =>
      new Map(
        catalogs.flatMap((catalog) => catalog.rows).map((row) => [row.key, row])
      ),
    [catalogs]
  )
  const shownFolders = React.useMemo(
    () =>
      folders
        .filter((folder) => !folder.hidden)
        .sort((left, right) => left.position - right.position),
    [folders]
  )
  const allMarkets = React.useMemo(() => {
    const hidden = new Set(panelRows.hiddenMarketKeys)
    return [...markets.values()]
      .filter((market) => !hidden.has(market.key))
      .sort(compareMarketChange24h)
  }, [markets, panelRows.hiddenMarketKeys])


  const list = (
        <ScrollArea
          className="min-h-0 flex-1"
          // Filling the panel's height, the list scrolls inside it; otherwise
          // it keeps to 320px and the page scrolls.
          viewportClassName={fills ? "h-full" : "max-h-80"}
        >
          <div className="grid">
            {shownFolders.map((folder) => {
              const expanded = expandedId === folder.id
              const folderMarkets = folder.marketKeys
                .flatMap((key) => {
                  const market = markets.get(key)
                  return market ? [market] : []
                })
                .sort(compareMarketChange24h)
              return (
                <div key={folder.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex h-9 w-full items-center gap-2 border-b px-3 text-left text-sm font-medium",
                      expanded ? "bg-muted" : "hover:bg-muted"
                    )}
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : folder.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {folder.name}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {folder.marketKeys.length}
                    </span>
                    <ChevronRightIcon
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        expanded && "rotate-90"
                      )}
                    />
                  </button>
                  {expanded ? (
                    <div className="flex flex-col border-b bg-muted/30">
                      {folderMarkets.length > 0 ? (
                        folderMarkets.map((market) => (
                          <MarketRowLine
                            key={market.key}
                            row={market}
                            selected={market.key === selectedMarketKey}
                            // The menu stays up after a pick, so a folder
                            // can be read one coin at a time. Moving the
                            // pointer off it closes it, and so does Escape.
                            onSelect={onSelectMarket}
                          />
                        ))
                      ) : marketsPending && folder.marketKeys.length > 0 ? (
                        <LoadingRow label="Reading the market list" />
                      ) : (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                          {folder.marketKeys.length > 0
                            ? "Its saved markets are not available in the current list."
                            : `${folder.name} is empty.`}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {!panelRows.all.hidden ? (
              <MenuSection
                name="All markets"
                expanded={expandedId === "all"}
                count={
                  marketsPending || marketsError
                    ? ""
                    : String(allMarkets.length)
                }
                onToggle={() =>
                  setExpandedId(expandedId === "all" ? null : "all")
                }
              >
                {marketsPending ? (
                  <LoadingRow label="Reading the market list" />
                ) : marketsError ? (
                  <ErrorRow
                    message={marketsError}
                    onRetry={onRetryMarkets}
                    className="p-3"
                  />
                ) : allMarkets.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No markets match your market visibility settings.
                  </p>
                ) : (
                  allMarkets.map((market) => (
                    <MarketRowLine
                      key={market.key}
                      row={market}
                      selected={market.key === selectedMarketKey}
                      onSelect={onSelectMarket}
                    />
                  ))
                )}
              </MenuSection>
            ) : null}
            {shownFolders.length === 0 && panelRows.all.hidden ? (
              <p className="p-3 text-xs text-muted-foreground">
                Every row is hidden. Open Manage folders to show a row.
              </p>
            ) : null}
          </div>
        </ScrollArea>
  )
  return (
    <>
      {list}
      <MarketFoldersManager
        folders={folders}
        protocol={protocol}
        network={network}
        catalogs={catalogs}
        marketsError={marketsError}
        marketsPending={marketsPending}
        panelRows={panelRows}
        onFoldersChange={onFoldersChange}
        onPanelRowsChange={onPanelRowsChange}
        manageOpen={managing}
        onManageOpenChange={onManagingChange}
      />
    </>
  )
}

/**
 * The Folders block's own rows in its ⋮, above Delete block: a box to name a
 * new folder, with + to make it, then Manage folders. The box keeps the
 * menu's typing keys to itself, and the menu stays open while it is used.
 */
export function FoldersBlockMenuRows({
  protocol,
  network,
  onFoldersChange,
  onManage,
}: {
  protocol: ProtocolId
  network: NetworkId
  onFoldersChange: (folders: MarketFolder[]) => void
  onManage: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  function create(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (busy) return
    // Never a greyed-out +: an empty press says what is missing.
    if (!trimmed) {
      showErrorToast("Type the folder's name first.")
      return
    }
    setBusy(true)
    void createFolder({ protocol, network, name: trimmed })
      .then((next) => {
        onFoldersChange(next)
        setName("")
      })
      .catch((caught) => showErrorToast(getMarketFolderErrorMessage(caught)))
      .finally(() => setBusy(false))
  }
  return (
    <>
      <form className="flex gap-1.5 p-1" data-own-escape="" onSubmit={create}>
        <Input
          aria-label="New folder name"
          placeholder="New folder"
          value={name}
          maxLength={80}
          disabled={busy}
          // The menu's own keys (letters jump to a row) stay out of the box.
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.target.value)}
          className="h-8"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="outline"
          aria-label="Add folder"
          disabled={busy}
          className="size-8"
        >
          <PlusIcon className="size-4" />
        </Button>
      </form>
      <DropdownMenuItem onSelect={onManage}>
        <FolderCogIcon className="size-4" />
        Manage folders
      </DropdownMenuItem>
    </>
  )
}

function MenuSection({
  name,
  count,
  expanded,
  onToggle,
  children,
}: {
  name: string
  count: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          "flex h-9 w-full items-center gap-2 border-b px-3 text-left text-sm font-medium",
          expanded ? "bg-muted" : "hover:bg-muted"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {count}
        </span>
        <ChevronRightIcon className={cn("size-4", expanded && "rotate-90")} />
      </button>
      {expanded ? (
        <div className="flex flex-col border-b bg-muted/30">{children}</div>
      ) : null}
    </div>
  )
}
