import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu, type MySettingsTab } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import type { ListingsSearch } from "@/lib/directory/listings-dashboard-search"
import { listingsFilterKey } from "@/lib/directory/listings-panel-keys"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Small pieces every row of the Listings dashboard draws with, so the
 * twelve lists read as one dashboard (Tyler, 7 Nov 2026, of a merged
 * dashboard: "The Ui is all over the place"): the header's empty line, the
 * pager under a long list, the record's ⋮, the address's open row, the
 * fetch while a pointer heads for a row, the save that happens by itself,
 * and each row's remembered filters.
 */

/** What every row of the dashboard is handed by the frame. */
export type SectionProps<Data> = {
  data: Data
  search: ListingsSearch
  frame: CrmFrame
  /** Something changed: the counts on the left and the list read again. */
  onChanged: () => Promise<unknown>
}

/** A list with nothing to show for its words or filters: what was asked, and Clear filters. */
export function NoMatches({ words, noun, onClear }: { words: string; noun: string; onClear: () => void }) {
  return (
    <span className="grid justify-items-center gap-2">
      {words.trim() ? `No ${noun} match "${words.trim()}".` : `No ${noun} match those filters.`}
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </span>
  )
}

/** The pager under a list that pages on the server, with the line above it. Nothing while one page holds every row. */
export function ListPager({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}) {
  const setListSearch = useListSearchNavigate()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1 && page <= 1) return null
  return (
    <div className="border-t">
      <DashboardTablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={(next) => {
          const clamped = Math.max(1, Math.min(next, totalPages))
          setListSearch({ page: clamped > 1 ? clamped : undefined })
        }}
        onPageSizeChange={(size) => setListSearch({ size, page: undefined })}
      />
    </div>
  )
}

export type MenuAction = {
  label: string
  icon: React.ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/**
 * A record's ⋮ (the Admin 3 panel design, "The record ⋮"): one General tab
 * of grouped rows, then the action rows, then the red ones under a line.
 * 20.4rem wide, or wider when more tabs need one row.
 */
export function RecordMenu({
  label,
  groups,
  actions,
  tabs = [],
  width = "20.4rem",
}: {
  /** "Listing menu". */
  label: string
  /** As a CSS length; a listing's five tabs need "26rem". */
  width?: string
  /** `PickGroup`s of rows, already drawn. */
  groups?: React.ReactNode
  actions: MenuAction[]
  /** Tabs after General, such as an event's Sign-ups and Later dates. */
  tabs?: MySettingsTab[]
}) {
  const [open, setOpen] = React.useState(false)
  const run = (action: MenuAction) => () => {
    setOpen(false)
    action.onSelect()
  }
  const plain = actions.filter((action) => !action.destructive)
  const red = actions.filter((action) => action.destructive)
  return (
    <TabbedMenu
      label={label}
      align="end"
      width={width}
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              {groups}
              {plain.length || red.length ? (
                <div className="grid">
                  {plain.map((action) => (
                    <ActionRow key={action.label} icon={action.icon} disabled={action.disabled} onClick={run(action)}>
                      {action.label}
                    </ActionRow>
                  ))}
                  {red.length ? <div aria-hidden className="-mx-3 my-1.5 border-t" /> : null}
                  {red.map((action) => (
                    <ActionRow
                      key={action.label}
                      destructive
                      icon={action.icon}
                      disabled={action.disabled}
                      onClick={run(action)}
                    >
                      {action.label}
                    </ActionRow>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        },
        ...tabs,
      ]}
    />
  )
}

export { PickGroup }

/**
 * The right panel is never left empty (Tyler, 23 Oct 2026: "The first load
 * always show the first task"): with nothing open, the list's first row
 * opens.
 *
 * - **A row that draws its record from the list** (the queues) opens its
 *   first row whenever the open record is not in the list, since it has
 *   nothing else to draw.
 * - **A row whose record reads itself by its id** (Listings, Guides) passes
 *   `listKey`, its search, filters, sort and page. It keeps the open record
 *   when the record is not on the page in view: one opened from a link
 *   elsewhere, one past the first page or under a folded heading, and one an
 *   edit has just moved out of the list. Only a new search, filter, sort or
 *   page that leaves it out opens the first row. Deleting the open record
 *   lets it go, which opens the first row.
 */
export function useOpenFirstRow(ids: string[], openId: string | undefined, listKey?: string) {
  const setListSearch = useListSearchNavigate()
  const firstId = ids[0]
  const openInList = Boolean(openId && ids.includes(openId))
  const shownKey = React.useRef(listKey)
  React.useEffect(() => {
    const listChanged = shownKey.current !== listKey
    shownKey.current = listKey
    if (!firstId || openInList) return
    if (!openId || listKey === undefined || listChanged) setListSearch({ open: firstId })
  }, [firstId, openId, openInList, listKey, setListSearch])
}

/**
 * Fetches a row's record while the pointer is still on its way to it (Tyler's
 * polish pick, 18 Nov 2026: "Every section fetches a record while the pointer
 * heads for it, as Listings does today"), so the right panel opens with
 * nothing to wait for. Spread on the box around the table; each row marks
 * itself with `PrefetchMark`.
 */
export function prefetchHandlers(prefetch: (id: string) => void) {
  const fire = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const id = target.closest("tr")?.querySelector<HTMLElement>("[data-prefetch]")?.dataset.prefetch
    if (id) prefetch(id)
  }
  return {
    onPointerOver: (event: React.PointerEvent) => fire(event.target),
    onFocus: (event: React.FocusEvent) => fire(event.target),
  }
}

/** A row's mark for `prefetchHandlers`, inside its main cell. */
export function PrefetchMark({ id }: { id: string }) {
  return <span hidden data-prefetch={id} />
}

/** Reads a record once, keeping the promise, so a hover and the open share one request. */
export function makeRecordCache<Value>(read: (id: string) => Promise<Value>) {
  const kept = new Map<string, Promise<Value>>()
  return {
    get(id: string) {
      let promise = kept.get(id)
      if (!promise) {
        promise = read(id)
        // A failed read is not kept, so the next open asks again.
        promise.catch(() => kept.delete(id))
        kept.set(id, promise)
      }
      return promise
    },
    prefetch(id: string) {
      void this.get(id).catch(() => undefined)
    },
    forget(id?: string) {
      if (id) kept.delete(id)
      else kept.clear()
    },
  }
}

export type AutoSaveState = "saved" | "waiting" | "saving" | "failed"

/**
 * A record that saves itself (the shell's records do: every field saves on
 * its own, and there is no Save button). The form's whole value is saved
 * 700ms after the last change, or at once when the record closes. A value
 * the form says is not ready (`ready: false`, such as a rating that is not a
 * number) waits, and the form says why next to the field; closing the
 * record then says its last changes were not saved. A refused save shows its
 * error and is tried again on the next change.
 */
export function useAutoSave<Value>({
  value,
  ready,
  save,
  message,
  delay = 700,
}: {
  /** The form's value. The first one is the record as it opened, already saved. Key the form by the record's id. */
  value: Value
  /** False while a field holds something the server would refuse. */
  ready: boolean
  save: (value: Value) => Promise<unknown>
  message: (error: unknown) => string
  delay?: number
}): { state: AutoSaveState } {
  const text = JSON.stringify(value)
  const savedText = React.useRef(text)
  const [state, setState] = React.useState<AutoSaveState>("saved")
  const latest = React.useRef({ value, text, ready, save, message })
  React.useLayoutEffect(() => {
    latest.current = { value, text, ready, save, message }
  })
  // One save at a time, each sending the value as it is when its turn comes,
  // so an older save can never land after a newer one.
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  const flush = React.useCallback((closing = false) => {
    queue.current = queue.current.then(async () => {
      const now = latest.current
      if (now.text === savedText.current) return
      if (!now.ready) {
        // Closed with a field the server would refuse: nothing typed since
        // the last save can go, so say so rather than drop it silently.
        if (closing) showErrorToast("Your last changes there were not saved, because one field held something that could not be.")
        return
      }
      const sending = now.text
      setState("saving")
      try {
        await now.save(now.value)
        savedText.current = sending
        setState(latest.current.text === sending ? "saved" : "waiting")
      } catch (error) {
        setState("failed")
        showErrorToast(now.message(error))
      }
    })
    return queue.current
  }, [])

  React.useEffect(() => {
    if (text === savedText.current) return
    setState("waiting")
    if (!ready) return
    const timer = window.setTimeout(() => void flush(), delay)
    return () => window.clearTimeout(timer)
  }, [text, ready, delay, flush])

  // Closing the record, or opening another, saves what was typed.
  React.useEffect(() => () => void flush(true), [flush])

  return { state }
}

/** The footer's words for a record that saves itself. */
export function AutoSaveWords({ state, ready, why }: { state: AutoSaveState; ready: boolean; why?: string }) {
  if (!ready) return <span className="text-destructive">{why ?? "Not saved yet"}</span>
  if (state === "saving" || state === "waiting")
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
        Saving
      </span>
    )
  if (state === "failed") return <span className="text-destructive">Not saved. Change something to try again.</span>
  return <span className="text-muted-foreground">Saved</span>
}

const authenticatedRoute = getRouteApi("/_authenticated")

/** The keys a row's filters are kept under; never the words typed, the page or the open record. */
const FILTER_KEYS = ["status", "kind", "gap", "sort", "direction", "days", "size"] as const

/**
 * Each row's filters, remembered per person and site in this browser
 * (Tyler's polish pick, 18 Nov 2026: "remembered per person and site, as
 * Project's /projects does"). `remember` keeps the row showing; `recall`
 * hands back a row's last filters for the Dashboards block to open it with.
 */
export function useRememberedFilters() {
  const { user, workspaces } = authenticatedRoute.useLoaderData()
  const site = workspaces.workspaces.find((workspace) => workspace.active) ?? workspaces.workspaces[0]
  const keyFor = React.useCallback(
    (section: string) => listingsFilterKey(user.id, site?.id ?? "", section),
    [site?.id, user.id]
  )
  const remember = React.useCallback(
    (section: string, search: ListingsSearch) => {
      const kept = Object.fromEntries(FILTER_KEYS.flatMap((key) => (search[key] === undefined ? [] : [[key, search[key]]])))
      try {
        if (Object.keys(kept).length) localStorage.setItem(keyFor(section), JSON.stringify(kept))
        else localStorage.removeItem(keyFor(section))
      } catch {
        // A browser that keeps nothing simply opens each row on its defaults.
      }
    },
    [keyFor]
  )
  const recall = React.useCallback(
    (section: string): Partial<ListingsSearch> => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(keyFor(section)) ?? "null")
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {}
        return Object.fromEntries(
          Object.entries(saved).filter(([key]) => (FILTER_KEYS as readonly string[]).includes(key))
        ) as Partial<ListingsSearch>
      } catch {
        return {}
      }
    },
    [keyFor]
  )
  return { remember, recall }
}
