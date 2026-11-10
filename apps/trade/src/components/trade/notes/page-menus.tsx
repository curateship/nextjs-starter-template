import * as React from "react"
import {
  CheckIcon,
  FolderIcon,
  PinIcon,
  PlusIcon,
} from "lucide-react"

import { WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { MenuRow } from "@/components/trade/middle-menu"
import { PickGroup, PickMenuRow } from "@/components/trade/notes/pick-rows"
import {
  CoverRow,
  LockRow,
  type PageCover,
  type PageLock,
} from "@/components/shared/notes/page-rows"
import { TabbedMenu, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type {
  MarketFolder,
  MarketFolderActions,
} from "@/lib/trade/market-folders"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { TRADING_WIDGET_OFFER } from "@/lib/trade/dashboard/widgets"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"

/**
 * The Trade dashboard's menus (the Admin 3 panel design): the tabbed ⋮ over
 * the left page, and the market's rows in the chart header's ⋮. Every row
 * saves itself.
 */

/** What the Widgets tab of the dashboard's ⋮ reads and changes. */
export type WidgetChoices = {
  layout: WidgetLayout | null
  error: string | null
  onRetry: () => void
  onChange: (layout: WidgetLayout) => void
}

/**
 * The ⋮ over the Trade dashboard's left page, as the Admin page's ⋮ (8 Nov
 * 2026): General holds the page's cover photo and its lock, the shell's own
 * rows (`shared/notes/page-rows.tsx`; Tyler: "cover photos is not using shell
 * standard"); Widgets sets
 * Overview's rows and spots, as the shell's Widgets tab
 * does ("widgets are not in settings"). Every row saves itself.
 */
export function DashboardPageMenu({
  lock,
  cover,
  hideEmptyBlocks,
  widgets,
  alerts,
  menuState,
}: {
  /** The ⋮'s open state and tab, held by the dashboard so a widget's Manage widgets opens it at Widgets. */
  menuState: TabbedMenuState
  /**
   * The alerts, fired and waiting, as a tab of the ⋮ after Widgets (Tyler,
   * 8 Nov 2026: "Put the alerts archive here and remove the alert block. We
   * already have these alert in the notification tray").
   */
  alerts: React.ReactNode
  lock: PageLock
  cover: PageCover
  /**
   * "Hide empty blocks": Manual trades, Grid trades and DCA trades leave the
   * page while they have nothing to show (Tyler, 8 Nov 2026).
   */
  hideEmptyBlocks: { on: boolean; onChange: (on: boolean) => void }
  widgets: WidgetChoices
}) {
  return (
    <TabbedMenu
      label="Dashboard settings"
      // Opens to the right, over the middle, from the ⋮ at the left panel's
      // right end, rather than hanging off the screen's left edge (Tyler,
      // 8 Nov 2026: "the left panel dropdown to align right").
      align="start"
      open={menuState.open}
      onOpenChange={menuState.onOpenChange}
      tab={menuState.tab}
      onTabChange={menuState.onTabChange}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              <PickGroup title="Page">
                <CoverRow cover={cover} />
                <PickMenuRow
                  label="Hide empty blocks"
                  value={hideEmptyBlocks.on ? "On" : "Off"}
                  empty={!hideEmptyBlocks.on}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  selected={hideEmptyBlocks.on ? "on" : "off"}
                  onPick={(next) => hideEmptyBlocks.onChange(next === "on")}
                />
              </PickGroup>
              <LockRow
                locked={lock.locked}
                busy={lock.busy}
                onLock={lock.setLocked}
              />
            </div>
          ),
        },
        {
          value: "widgets",
          label: "Widgets",
          content: (
            <WidgetSettings
              offer={TRADING_WIDGET_OFFER}
              layout={widgets.layout}
              error={widgets.error}
              onRetry={widgets.onRetry}
              onChange={widgets.onChange}
            />
          ),
        },
        {
          value: "alerts",
          label: "Alerts",
          content: alerts,
        },
      ]}
    />
  )
}

/**
 * Folders, as a row of the chart header's ⋮ (Tyler, 8 Nov 2026: no right
 * panel, so the market's Folders and Pin to top moved here): the market's
 * folders ticked, and one press adds the market to a folder or takes it out,
 * leaving the list open for the next. "New folder" at the foot names a folder
 * that starts with this market in it.
 */
export function FoldersMenuRow({
  marketKey,
  folders,
  actions,
}: {
  marketKey: string
  folders: readonly MarketFolder[]
  actions: MarketFolderActions
}) {
  const [name, setName] = React.useState("")
  const ordered = React.useMemo(
    () =>
      [...folders].sort(
        (left, right) =>
          Number(right.isFav) - Number(left.isFav) ||
          left.position - right.position
      ),
    [folders]
  )
  const holding = ordered.filter((folder) =>
    folder.marketKeys.includes(marketKey)
  )
  async function create(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || actions.busy) return
    if (await actions.create(marketKey, trimmed)) setName("")
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuRow
          icon={<FolderIcon />}
          label="Folders"
          detail="None"
          chips={holding.map((folder) => folder.name)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="left"
        align="start"
        collisionPadding={16}
        className="max-h-[min(60vh,24rem)] w-60"
      >
        {ordered.map((folder) => {
          const saved = folder.marketKeys.includes(marketKey)
          return (
            <DropdownMenuItem
              key={folder.id}
              // The list stays open, so a market can go into several folders.
              onSelect={(event) => {
                event.preventDefault()
                void actions.toggle(marketKey, folder.id, !saved)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {saved ? (
                <CheckIcon className="ml-auto size-4" aria-label="In it" />
              ) : null}
            </DropdownMenuItem>
          )
        })}
        {ordered.length ? <DropdownMenuSeparator /> : null}
        <form
          className="flex gap-1.5 p-1"
          data-own-escape=""
          onSubmit={(event) => void create(event)}
        >
          <Input
            aria-label="New folder name"
            placeholder="New folder"
            value={name}
            maxLength={80}
            disabled={actions.busy}
            // The menu's own keys (letters jump to a row) stay out of the box.
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => setName(event.target.value)}
            className="h-8"
          />
          <Button
            type="submit"
            size="icon-sm"
            variant="outline"
            aria-label="Create folder"
            disabled={actions.busy || !name.trim()}
            className="size-8"
          >
            <PlusIcon className="size-4" />
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Pin to top, as a row of the chart header's ⋮: one press puts the market's
 * chip in the header's pinned row, or takes it out. Saved on the account.
 */
export function PinMenuRow({ marketKey }: { marketKey: string }) {
  const { pins, loaded, busy, store } = usePinnedMarkets()
  const pinned = pins.includes(marketKey)
  return (
    <MenuRow
      icon={<PinIcon />}
      label="Pin to top"
      detail={pinned ? "On" : "Off"}
      aria-pressed={pinned}
      disabled={!loaded || busy}
      onClick={() => void store.setPin(marketKey, !pinned)}
    />
  )
}
