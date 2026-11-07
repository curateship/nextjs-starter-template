import * as React from "react"
import { CheckIcon, LockIcon, LockOpenIcon, PlusIcon } from "lucide-react"

import {
  PickGroup,
  PickMenuRow,
  PickRow,
  RowButton,
} from "@/components/trade/notes/pick-rows"
import { TabbedMenu } from "@/components/trade/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ImageUpload } from "@/components/shared/image-upload"
import { Input } from "@/components/ui/input"
import type {
  MarketFolder,
  MarketFolderActions,
} from "@/lib/trade/market-folders"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"

/**
 * The two ⋮ menus on the trading dashboard (the Admin 3 panel design, 7 Nov
 * 2026): My settings over the exchange's page on the left, and the market's
 * menu over its page on the right. Each is the tabbed ⋮ of grouped rows, and
 * every row saves itself.
 */

/**
 * "Lock the notes", under a menu's groups, as on every page in the design.
 * Locked, the page reads only, blocks and all, and the server refuses a save.
 */
function LockRow({
  locked,
  busy,
  onLock,
}: {
  locked: boolean
  busy: boolean
  onLock: (locked: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      className="w-full justify-start gap-2 px-2 font-normal"
      onClick={() => onLock(!locked)}
    >
      {locked ? (
        <LockOpenIcon className="size-4" />
      ) : (
        <LockIcon className="size-4" />
      )}
      {locked ? "Unlock the notes" : "Lock the notes"}
    </Button>
  )
}

export type PageLock = {
  locked: boolean
  busy: boolean
  setLocked: (locked: boolean) => void
}

export type PageCover = {
  url: string | null
  busy: boolean
  set: (url: string | null) => void
}

/**
 * The page's cover photo, as a row: "None" until one is added, and the
 * upload in the small box the row opens (Tyler, 7 Nov 2026: "both panel is
 * missing cover photo", then "the settings dropdown options needs to follow
 * standard"). The picture lies faintly behind the panel's header.
 */
function CoverRow({ cover }: { cover: PageCover }) {
  return (
    <PickRow
      label="Cover photo"
      value={cover.url ? "Added" : "None"}
      empty={!cover.url}
      disabled={cover.busy}
    >
      <ImageUpload
        label="Cover photo"
        showLabel={false}
        value={cover.url ?? ""}
        aspect="video"
        fit="cover"
        emptyLabel="Add a cover photo"
        onChange={(url) => cover.set(url || null)}
      />
    </PickRow>
  )
}

/** The ⋮ over the exchange's own page: My settings, General holding the lock. */
export function ExchangePageMenu({
  lock,
  cover,
}: {
  lock: PageLock
  cover: PageCover
}) {
  return (
    <TabbedMenu
      label="My settings"
      align="end"
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              <PickGroup title="Page">
                <CoverRow cover={cover} />
              </PickGroup>
              <LockRow
                locked={lock.locked}
                busy={lock.busy}
                onLock={lock.setLocked}
              />
            </div>
          ),
        },
      ]}
    />
  )
}

/**
 * The Folders row: the market's folders ticked, and one press adds the market
 * to a folder or takes it out, leaving the list open for the next. "New
 * folder" at the foot names a folder that starts with this market in it.
 * This is what the star in the chart header did (Tyler, 7 Nov 2026: "we move
 * the add to folder and pinned function there").
 */
function FoldersRow({
  marketKey,
  folders,
  actions,
}: {
  marketKey: string
  folders: readonly MarketFolder[]
  actions: MarketFolderActions
}) {
  const [open, setOpen] = React.useState(false)
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
  const value =
    holding.length === 0
      ? "None"
      : holding.map((folder) => folder.name).join(", ")
  async function create(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || actions.busy) return
    if (await actions.create(marketKey, trimmed)) setName("")
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <RowButton
          label="Folders"
          // Its own truncating box, so a long list ends in "…" rather than
          // losing its first folder off the left.
          value={<span className="min-w-0 truncate">{value}</span>}
          empty={holding.length === 0}
          open={open}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
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

/** Pin to top: the market's chip in the header's pinned row, saved on the account. */
function PinRow({ marketKey }: { marketKey: string }) {
  const { pins, loaded, busy, store } = usePinnedMarkets()
  const pinned = pins.includes(marketKey)
  return (
    <PickMenuRow
      label="Pin to top"
      value={pinned ? "On" : "Off"}
      empty={!pinned}
      disabled={!loaded || busy}
      options={[
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ]}
      selected={pinned ? "on" : "off"}
      onPick={(next) => void store.setPin(marketKey, next === "on")}
    />
  )
}

/**
 * The ⋮ over a market's page: General holds the market's folders, Pin to
 * top, then the page's lock. 20.4rem wide, as a record's menu is.
 */
export function MarketPageMenu({
  marketKey,
  folders,
  folderActions,
  lock,
  cover,
}: {
  marketKey: string | null
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  lock: PageLock
  cover: PageCover
}) {
  return (
    <TabbedMenu
      label="Market menu"
      align="end"
      width="20.4rem"
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              {marketKey ? (
                <PickGroup title="This market">
                  <FoldersRow
                    marketKey={marketKey}
                    folders={folders}
                    actions={folderActions}
                  />
                  <PinRow marketKey={marketKey} />
                </PickGroup>
              ) : null}
              {marketKey ? (
                <PickGroup title="Page">
                  <CoverRow cover={cover} />
                </PickGroup>
              ) : null}
              <LockRow
                locked={lock.locked}
                busy={lock.busy}
                onLock={lock.setLocked}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
