import * as React from "react"
import { createPortal } from "react-dom"
import { EllipsisVerticalIcon, Loader2Icon, PlusIcon, RotateCwIcon, TimerIcon, TimerOffIcon } from "lucide-react"

import { FoldingMenu } from "@/components/shared/folding-menu"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { KeywordListSlotContext } from "./keyword-list-slot"

/**
 * A network's keywords on its Commenting row, in the project's left column
 * (`KeywordListSlotContext`; Tyler, 5 Nov 2026: "I think its better that
 * commenting lives within its project"). Each network's Commenting header
 * owns its keywords, their actions and their add form, and draws them here.
 *
 * - **"Keywords · 3"**, the shared small heading with the count, and a + that
 *   opens the network's add form as a dropdown. With nothing saved the form
 *   sits open under the heading instead.
 * - **All keywords**, then a row per keyword with its count and when it last
 *   searched. Its timer, search again and ⋮ show while the row is pointed at
 *   or focused, so the name has the column's width; always on a phone.
 */
export type KeywordPickerItem = {
  id: string
  /** How the keyword reads: "#food", "best restaurants", "r/startups". */
  label: string
  /** The posts or stories it lists, beside its name. */
  count: number
  /** Drawn before the name, such as Medium's "Names you" tag. */
  badge?: React.ReactNode
  /** "2 hours ago", "searching", "search failed". */
  status: string
  /** Why the last search failed, shown on hover and drawn red. */
  failed?: string | null
  enabled: boolean
  /** A search for it is waiting or running. */
  running: boolean
  /** No browser program is running, so a waiting search waits rather than spins. */
  stalled?: boolean
  /** Said on hover over search again, and why it is off while running. */
  runHint: string
  runningReason: string
}

export function KeywordPicker({
  items,
  loading,
  selectedId,
  allCount,
  onSelect,
  onRun,
  onSwitch,
  menu,
  addForm,
}: {
  items: KeywordPickerItem[]
  loading: boolean
  /** The picked keyword, or anything else for All keywords. */
  selectedId: string | null
  /** What All keywords lists, when the network counts it once per post. */
  allCount?: number
  onSelect: (id: string | null) => void
  onRun: (id: string) => Promise<void>
  onSwitch: (id: string, enabled: boolean) => Promise<void>
  /**
   * The rows of one keyword's ⋮, in the shared dropdown look (`MenuAction`,
   * `MenuLine`): its mark, Remove. `close` shuts the menu.
   */
  menu: (item: KeywordPickerItem, close: () => void) => React.ReactNode
  /** The network's add form. `close` is called once it saved, or on Cancel. */
  addForm: (close: () => void) => React.ReactNode
}) {
  const [adding, setAdding] = React.useState(false)
  const slot = React.useContext(KeywordListSlotContext)
  if (!slot?.element) return null

  const selected = items.find((item) => item.id === selectedId) ?? null
  const anyRunning = items.some((item) => item.running && !item.stalled)
  const reading = loading && !items.length

  return createPortal(
    <div className="grid gap-0.5">
      {/* A quiet line naming the list, as a block row's muted words are; no
          capitals, so the network rows above stay what the eye finds first. */}
      <div className="flex h-7 items-center justify-between gap-2 pl-2.5">
        <span className="text-xs text-muted-foreground">{items.length ? `Keywords · ${items.length}` : "Keywords"}</span>
        {items.length ? (
          // Its tooltip stays mounted, shut while the form is open, so opening it never draws the button again.
          <Tooltip open={adding ? false : undefined}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <FoldingMenu
                  label="Add a keyword"
                  align="start"
                  open={adding}
                  onOpenChange={setAdding}
                  trigger={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Add a keyword">
                      <PlusIcon />
                    </Button>
                  }
                >
                  <div className="p-2 text-sm">{addForm(() => setAdding(false))}</div>
                </FoldingMenu>
              </span>
            </TooltipTrigger>
            <TooltipContent>Add a keyword</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {reading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          Reading your keywords
        </p>
      ) : !items.length ? (
        // Nothing saved yet: the form sits open, and stays open after a save
        // only until the list it made draws in its place.
        addForm(() => undefined)
      ) : (
        <div className="grid gap-0.5">
          <button
            type="button"
            aria-pressed={!selected}
            onMouseDownCapture={(event) => event.preventDefault()}
            className={cn(
              "flex min-h-8 items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
              selected ? "font-normal text-muted-foreground hover:text-foreground" : "font-semibold text-foreground"
            )}
            onClick={() => onSelect(null)}
          >
            <span className="flex min-w-0 flex-1 items-center">
              <SlideBar on={!selected} />
              <span className="truncate">All keywords</span>
            </span>
            {anyRunning ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" /> : null}
            {allCount !== undefined ? <Pill>{allCount}</Pill> : null}
          </button>
          {items.map((item) => (
            <KeywordRow
              key={item.id}
              item={item}
              picked={item.id === selectedId}
              onPick={() => onSelect(item.id)}
              onRun={onRun}
              onSwitch={onSwitch}
              menu={menu}
            />
          ))}
        </div>
      )}
    </div>,
    slot.element
  )
}

/**
 * One keyword in the list: its name picks it, then the timer, search again
 * and its ⋮. The three buttons lie over the row's right end while it is
 * pointed at or holds the keyboard's focus, and while its ⋮ is open or a
 * press of theirs is working; on a phone, with no pointer, they always show
 * beside the name. A search running shows its spinner after the count.
 */
function KeywordRow({
  item,
  picked,
  onPick,
  onRun,
  onSwitch,
  menu,
}: {
  item: KeywordPickerItem
  picked: boolean
  onPick: () => void
  onRun: (id: string) => Promise<void>
  onSwitch: (id: string, enabled: boolean) => Promise<void>
  menu: (item: KeywordPickerItem, close: () => void) => React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  async function act(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const iconButton =
    "flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
  const searching = item.running && !item.stalled

  return (
    <div className="group/keyword relative flex min-w-0 items-center gap-1 [@media(hover:none)]:pr-1">
      <Hint label={item.failed && !item.running ? item.failed : item.enabled ? item.status : `${item.status} · timer off`}>
        <button
          type="button"
          aria-pressed={picked}
          aria-label={`${item.label}, ${item.count}, ${item.status}`}
          onClick={onPick}
          onMouseDownCapture={(event) => event.preventDefault()}
          className={cn(
            "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
            picked ? "font-semibold text-foreground" : "font-normal text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <SlideBar on={picked} />
            {item.badge}
            <span className="truncate">{item.label}</span>
            {/* Its last search is said only when it needs saying: running, or failed. The rest is on hover. */}
            {searching ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
            {item.failed && !item.running ? <span className="shrink-0 text-xs font-normal text-destructive">failed</span> : null}
          </span>
          <Pill>{item.count}</Pill>
        </button>
      </Hint>
      <div
        className={cn(
          // Over the row's end, on the panel's white, so the name keeps the width.
          "absolute inset-y-0 right-0 items-center gap-1 rounded-r-lg bg-card pr-1 pl-1",
          menuOpen || busy ? "flex" : "hidden group-hover/keyword:flex group-has-[:focus-visible]/keyword:flex",
          "[@media(hover:none)]:static [@media(hover:none)]:flex [@media(hover:none)]:bg-transparent [@media(hover:none)]:p-0"
        )}
      >
        <Hint
          label={
            item.enabled
              ? "Searches by itself every few hours. Press to stop that."
              : "Only searches when you press it. Press to search by itself every few hours."
          }
        >
          <button
            type="button"
            className={iconButton}
            aria-pressed={item.enabled}
            aria-label={item.enabled ? `Stop ${item.label} searching by itself` : `Search ${item.label} by itself every few hours`}
            disabled={busy}
            onClick={() => void act(() => onSwitch(item.id, !item.enabled))}
          >
            {item.enabled ? <TimerIcon className="size-4" aria-hidden="true" /> : <TimerOffIcon className="size-4" aria-hidden="true" />}
          </button>
        </Hint>
        {/* Off while its search waits or runs, and the reason says which. */}
        <DisabledReason disabled={item.running} reason={item.runningReason} className="rounded-sm">
          <Hint label={item.running ? null : item.runHint}>
            <button
              type="button"
              className={iconButton}
              aria-label={`${item.runHint}: ${item.label}`}
              disabled={busy || item.running}
              onClick={() => void act(() => onRun(item.id))}
            >
              {busy || searching ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCwIcon className="size-4" aria-hidden="true" />
              )}
            </button>
          </Hint>
        </DisabledReason>
        <FoldingMenu
          label={`More for ${item.label}`}
          align="start"
          fit
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <button type="button" className={iconButton} aria-label={`More for ${item.label}`} disabled={busy}>
              <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
            </button>
          }
        >
          {menu(item, () => setMenuOpen(false))}
        </FoldingMenu>
      </div>
    </div>
  )
}

/** A count in the lightest grey pill, as every block row's figure is. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">{children}</span>
  )
}
