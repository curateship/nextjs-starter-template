import * as React from "react"
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  Loader2Icon,
  PlusIcon,
  RotateCwIcon,
  TimerIcon,
  TimerOffIcon,
} from "lucide-react"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * A project's keywords as one dropdown among the middle column's header
 * buttons, after the search box, for Reddit and Medium alike. Tyler, 21 Oct 2026, from a picture of
 * the old row of chips taking two lines: "have to organize the keywords ui
 * better", and of three drawings he picked this one for both networks. The
 * same day he moved it from the header's start to the buttons on its right,
 * and the network's name took its place.
 *
 * The button names the keyword whose posts are listed, or All keywords. Its
 * list has All keywords first, then a row per keyword with its count, when it
 * last searched, the timer, search again and its own menu, and Add keyword
 * last, which turns the list into the network's add box. With nothing saved
 * the button reads Add keyword and opens on the box.
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
  /** The items of one keyword's own menu: its mark, Remove. */
  menu: (item: KeywordPickerItem) => React.ReactNode
  /** The network's add box. `close` goes back to the list once saved, or on Cancel. */
  addForm: (close: () => void) => React.ReactNode
}) {
  const empty = !items.length && !loading
  // Open on the box only when nothing is saved, worked out when the keywords
  // first arrive (at once for Reddit, after the module's first read for
  // Medium) and never again, so the box never shuts itself while somebody is
  // still typing in it.
  const [open, setOpen] = React.useState(empty)
  const [adding, setAdding] = React.useState(empty)
  const [settled, setSettled] = React.useState(!loading)
  if (!settled && !loading) {
    setSettled(true)
    if (!items.length) {
      setOpen(true)
      setAdding(true)
    }
  }
  const selected = items.find((item) => item.id === selectedId) ?? null
  const anyRunning = items.some((item) => item.running && !item.stalled)

  function openChange(next: boolean) {
    setOpen(next)
    if (next) setAdding(!items.length)
  }

  function pick(id: string | null) {
    onSelect(id)
    setOpen(false)
  }

  const name = selected ? selected.label : empty ? "Add keyword" : "All keywords"
  const count = selected ? selected.count : allCount

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="max-w-60 min-w-0 shrink justify-between font-normal"
          aria-label={selected ? `Keyword ${selected.label}, ${selected.count}. Pick another keyword` : `${name}. Pick a keyword`}
        >
          {loading && !items.length ? (
            <Loader2Icon className="animate-spin" aria-label="Reading your keywords" />
          ) : empty ? (
            <PlusIcon />
          ) : null}
          {selected?.badge}
          <span className="min-w-0 truncate font-medium">{name}</span>
          {count !== undefined && !empty ? <span className="text-muted-foreground tabular-nums">{count}</span> : null}
          {anyRunning ? <Loader2Icon className="text-muted-foreground animate-spin" aria-label="Searching" /> : null}
          <ChevronDownIcon className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        {adding ? (
          <div className="grid gap-3 p-3">
            {items.length ? (
              <button
                type="button"
                className="flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setAdding(false)}
              >
                <ArrowLeftIcon className="size-4" aria-hidden="true" />
                Keywords
              </button>
            ) : null}
            {addForm(() => (items.length ? setAdding(false) : setOpen(false)))}
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[min(24rem,60vh)]">
              <div className="grid p-1">
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => pick(null)}
                >
                  <span className="flex-1 truncate font-medium">All keywords</span>
                  {allCount !== undefined ? <span className="text-muted-foreground tabular-nums">{allCount}</span> : null}
                  <CheckIcon className={cn("size-4 shrink-0", selected && "opacity-0")} aria-label={selected ? undefined : "Picked"} />
                </button>
                {items.map((item) => (
                  <KeywordRow
                    key={item.id}
                    item={item}
                    picked={item.id === selectedId}
                    onPick={() => pick(item.id)}
                    onRun={onRun}
                    onSwitch={onSwitch}
                    menu={menu}
                  />
                ))}
              </div>
            </ScrollArea>
            <div className="border-t p-1">
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => setAdding(true)}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                Add keyword
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** One keyword in the list: its name picks it, then the timer, search again and its menu. */
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
  menu: (item: KeywordPickerItem) => React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)

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

  return (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-sm pr-1 hover:bg-muted", picked && "bg-muted")}>
      <button
        type="button"
        aria-pressed={picked}
        aria-label={`${item.label}, ${item.count}, ${item.status}`}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1.5 pl-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm">
            {item.badge}
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{item.count}</span>
          </span>
          <Hint label={item.failed && !item.running ? item.failed : null}>
            <span
              // "just now" can become "1 minute ago" between the server drawing
              // the page and the browser taking it over. Not worth a warning.
              suppressHydrationWarning
              className={cn("truncate text-xs", item.failed && !item.running ? "text-destructive" : "text-muted-foreground")}
            >
              {item.enabled ? item.status : `${item.status} · timer off`}
            </span>
          </Hint>
        </span>
      </button>
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
            {busy || (item.running && !item.stalled) ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCwIcon className="size-4" aria-hidden="true" />
            )}
          </button>
        </Hint>
      </DisabledReason>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={iconButton} aria-label={`More for ${item.label}`} disabled={busy}>
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {menu(item)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
