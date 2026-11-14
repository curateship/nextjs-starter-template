import * as React from "react"
import { ArrowLeftIcon, ChevronDownIcon, EllipsisVerticalIcon, Loader2Icon, PauseIcon, PlayIcon, PlusIcon, RotateCwIcon, TagsIcon, TimerIcon, TimerOffIcon } from "lucide-react"

import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { CommentingPauseContext } from "@/components/social/commenting-pause"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * A network's keywords, as a dropdown in its Commenting header beside Select
 * (Tyler, 14 Nov 2026, of the list under the Commenting row on the left:
 * "the keywords for the reddit network should be moved here", "same as
 * medium and any other commenting link from the left panel"). Each network's
 * header owns its keywords, their actions and its add form.
 *
 * - **The button** names the picked keyword and its count, or All keywords,
 *   or Add keyword while nothing is saved.
 * - **The list** is "Keywords · 3" with a + that turns the dropdown into the
 *   network's add form, then All keywords, then a row per keyword with its
 *   count. Its timer, search again and ⋮ show while the row is pointed at or
 *   focused, so the name has the width; always on a phone.
 * - **Pause commenting** on this network alone, under a line at the foot,
 *   where the project's dashboard offers it (`CommentingPauseContext`).
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
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const pause = React.useContext(CommentingPauseContext)
  const [pausing, setPausing] = React.useState(false)

  const selected = items.find((item) => item.id === selectedId) ?? null
  const anyRunning = items.some((item) => item.running && !item.stalled)
  const reading = loading && !items.length
  const empty = !items.length && !loading
  // With nothing saved the dropdown opens on the add form, the only thing in it worth pressing.
  const showForm = adding || empty

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setAdding(false)
  }

  function pick(id: string | null) {
    onSelect(id)
    openChange(false)
  }

  const name = selected ? selected.label : empty ? "Add keyword" : "All keywords"
  const count = selected ? selected.count : allCount

  return (
    <FoldingMenu
      label="Keywords"
      open={open}
      onOpenChange={openChange}
      trigger={
        <DashboardToolbarButton
          type="button"
          variant="outline"
          // It never squeezes under the search box. In a narrow header, or on a phone, it is the tags mark alone, as Select is its mark alone.
          className="max-w-56 min-w-0 shrink-0 font-normal"
          aria-label={selected ? `Keyword ${selected.label}, ${selected.count}. Pick another keyword` : `${name}. Pick a keyword`}
        >
          {reading ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : empty ? <PlusIcon aria-hidden="true" /> : <TagsIcon className="hidden max-sm:block @max-3xl:block" aria-hidden="true" />}
          <span className="flex min-w-0 items-center gap-2 max-sm:hidden @max-3xl:hidden">
            {selected?.badge}
            <span className="min-w-0 truncate font-medium">{name}</span>
            {count !== undefined && !empty ? <span className="text-muted-foreground tabular-nums">{count}</span> : null}
          </span>
          {anyRunning ? <Loader2Icon className="animate-spin text-muted-foreground" aria-label="Searching" /> : null}
          <ChevronDownIcon className="shrink-0 text-muted-foreground max-sm:hidden @max-3xl:hidden" aria-hidden="true" />
        </DashboardToolbarButton>
      }
    >
      {reading ? (
        <p className="flex items-center gap-2 p-1 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          Reading your keywords
        </p>
      ) : showForm ? (
        <div className="grid gap-2 p-1 text-sm">
          {items.length ? (
            <button
              type="button"
              className="flex w-fit items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setAdding(false)}
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
              Keywords
            </button>
          ) : null}
          {/* Saved, it goes back to the list, or shuts when this was the first keyword. */}
          {addForm(() => (items.length ? setAdding(false) : openChange(false)))}
        </div>
      ) : (
        <div className="grid gap-0.5">
          {/* A quiet line naming the list, with its + for a new keyword. */}
          <div className="flex h-7 items-center justify-between gap-2 pl-2.5">
            <span className="text-xs text-muted-foreground">{`Keywords · ${items.length}`}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Add a keyword" onClick={() => setAdding(true)}>
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a keyword</TooltipContent>
            </Tooltip>
          </div>
          <button
            type="button"
            aria-pressed={!selected}
            onMouseDownCapture={(event) => event.preventDefault()}
            className={cn(
              "flex min-h-8 items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
              selected ? "font-normal text-muted-foreground hover:text-foreground" : "font-semibold text-foreground"
            )}
            onClick={() => pick(null)}
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
              onPick={() => pick(item.id)}
              onRun={onRun}
              onSwitch={onSwitch}
              menu={menu}
            />
          ))}
        </div>
      )}
      {pause && !reading && !(adding && items.length) ? (
        <>
          <MenuLine />
          <MenuAction
            icon={pausing ? <Loader2Icon className="size-4 animate-spin" /> : pause.paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
            disabled={pausing}
            onClick={() => {
              setPausing(true)
              void pause.onToggle(!pause.paused).finally(() => setPausing(false))
            }}
          >
            {pause.paused ? `Resume commenting on ${pause.networkName}` : `Pause commenting on ${pause.networkName}`}
          </MenuAction>
          {/* What the pause holds back, said once under it, in the menu's quiet grey. */}
          <p className="px-2.5 pt-0.5 pb-1 text-xs text-muted-foreground">
            {pause.paused ? "Comments wait until you resume. Your own posts still go out." : "Comments wait; your own posts still go out."}
          </p>
        </>
      ) : null}
    </FoldingMenu>
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
          // Over the row's end, on the dropdown's white, so the name keeps the width.
          "absolute inset-y-0 right-0 items-center gap-1 rounded-r-lg bg-popover pr-1 pl-1",
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
