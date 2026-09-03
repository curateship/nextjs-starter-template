import * as React from "react"
import {
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"

import { MarketRowLine } from "@/components/trade/market-list-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  createFolder,
  getMarketFolderErrorMessage,
} from "@/lib/api/trade/market-folders"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { MarketFolder } from "@/lib/trade/market-folders"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import { compareMarketChange24h } from "@/lib/trade/market-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A compact second view of the saved market folders beside the market name. */
export function MarketFoldersMenu({
  folders,
  protocol,
  network,
  catalogs,
  selectedMarketKey,
  onFoldersChange,
  onManage,
  onSelectMarket,
}: {
  folders: readonly MarketFolder[]
  protocol: ProtocolId
  network: NetworkId
  catalogs: readonly FilteredMarketCatalog[]
  selectedMarketKey: string | null
  onFoldersChange: (folders: MarketFolder[]) => void
  onManage: () => void
  onSelectMarket: (marketKey: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const closeTimer = React.useRef<number | null>(null)
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

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current === null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])
  const openFromHover = React.useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])
  const closeFromHover = React.useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }, [cancelClose])

  React.useEffect(() => cancelClose, [cancelClose])
  React.useEffect(() => {
    if (
      expandedId !== null &&
      !shownFolders.some((folder) => folder.id === expandedId)
    ) {
      setExpandedId(null)
    }
  }, [expandedId, shownFolders])

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-muted/60 dark:bg-muted/60"
          aria-label="Open folders"
          onMouseEnter={openFromHover}
          onMouseLeave={closeFromHover}
        >
          <FolderIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        sideOffset={8}
        className="flex w-[calc(100vw-2rem)] max-w-96 flex-col gap-0 overflow-hidden p-0"
        style={{
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
        onMouseEnter={openFromHover}
        onMouseLeave={closeFromHover}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 text-sm font-semibold">
          <FolderIcon className="size-4" />
          <span className="min-w-0 flex-1">Folders</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 bg-muted/60 dark:bg-muted/60"
            aria-label="Add folder"
            onClick={() => setCreating((shown) => !shown)}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 bg-muted/60 dark:bg-muted/60"
            aria-label="Manage folders"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            <SettingsIcon className="size-4" />
          </Button>
        </div>
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
        <ScrollArea className="max-h-[calc(var(--radix-popover-content-available-height)-2.75rem)]">
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
                    <div className="border-b bg-muted/30">
                      {folderMarkets.length > 0 ? (
                        folderMarkets.map((market) => (
                          <MarketRowLine
                            key={market.key}
                            row={market}
                            selected={market.key === selectedMarketKey}
                            onSelect={(marketKey) => {
                              setOpen(false)
                              onSelectMarket(marketKey)
                            }}
                          />
                        ))
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
            {shownFolders.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No folders yet. Add one from the Folders panel.
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
