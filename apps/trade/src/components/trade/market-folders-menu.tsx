import * as React from "react"
import {
  ChevronRightIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"

import { LoadingRow } from "@/components/ui/loading-row"
import { ErrorRow } from "@/components/ui/error-row"
import { MarketRowLine } from "@/components/trade/market-list-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockHeadingActions } from "@/components/trade/notes/trade-block-views"
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
 * saved folders and the markets inside them, drawn in place on the
 * exchange's page. Its plus and cog sit in the block's heading.
 */
export function MarketFoldersMenu({
  folders,
  protocol,
  network,
  catalogs,
  selectedMarketKey,
  onFoldersChange,
  onManage,
  onSelectMarket,
  panelRows,
  marketsError,
  marketsPending,
  onRetryMarkets,
}: {
  panelRows: MarketPanelRows
  marketsError: string | null
  marketsPending: boolean
  onRetryMarkets: () => void
  folders: readonly MarketFolder[]
  protocol: ProtocolId
  network: NetworkId
  catalogs: readonly FilteredMarketCatalog[]
  selectedMarketKey: string | null
  onFoldersChange: (folders: MarketFolder[]) => void
  onManage: () => void
  onSelectMarket: (marketKey: string) => void
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
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
      .catch((caught) => showErrorToast(getMarketFolderErrorMessage(caught)))
      .finally(() => setBusy(false))
  }

  const headerButtons = (
    <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Add folder"
            onClick={() => setCreating((shown) => !shown)}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Manage folders"
            onClick={() => {
              onManage()
            }}
          >
            <SettingsIcon className="size-4" />
          </Button>
    </>
  )
  const list = (
        <ScrollArea
          className="min-h-0"
          viewportClassName="max-h-80"
        >
          {creating ? (
            <form
              className="grid shrink-0 gap-2 border-b p-2"
              onSubmit={submitNewFolder}
            >
              <Label htmlFor="new-market-folder-menu-name">Folder name</Label>
              <div className="flex gap-2">
                <Input
                  id="new-market-folder-menu-name"
                  autoFocus
                  placeholder="Majors"
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
      <BlockHeadingActions>{headerButtons}</BlockHeadingActions>
      {list}
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
