import * as React from "react"
import { Loader2Icon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { searchAllMarkets } from "@/lib/api/trade/market-search"
import type { AppHeaderActionProps } from "@/lib/app-options"
import {
  LEAST_SEARCH_LETTERS,
  type MarketSearchAnswer,
} from "@/lib/trade/market-search"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

/** How long after the last keystroke the exchanges are asked. */
const SETTLE_MS = 250

type SearchState = {
  /** The words these results answer, so a stale reply can be dropped. */
  query: string
  answer: MarketSearchAnswer | null
  busy: boolean
  failed: boolean
}

const nothingYet: SearchState = {
  query: "",
  answer: null,
  busy: false,
  failed: false,
}

/**
 * The words typed, and the markets they found on every exchange.
 *
 * The request waits 250ms after the last keystroke, and only the newest reply
 * is kept: typing "sol" costs one search rather than three, and a slow answer
 * for "so" can never overwrite the list for "sol".
 */
function useMarketSearch(typed: string) {
  const asked = typed.trim()
  const [state, setState] = React.useState<SearchState>(nothingYet)
  const newest = React.useRef(0)

  const run = React.useCallback(async (query: string) => {
    const mine = ++newest.current
    setState((current) => ({ ...current, busy: true, failed: false }))
    try {
      const answer = await searchAllMarkets(query)
      if (newest.current !== mine) return
      setState({ query, answer, busy: false, failed: false })
    } catch {
      if (newest.current !== mine) return
      setState({ query, answer: null, busy: false, failed: true })
    }
  }, [])

  React.useEffect(() => {
    // Too few letters to search for. The results already in hand belong to
    // longer words, and `stale` below is what keeps them off the screen —
    // clearing them here would be a second render for nothing.
    if (asked.length < LEAST_SEARCH_LETTERS) return
    const timer = window.setTimeout(() => void run(asked), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [asked, run])

  return {
    ...state,
    // The rows on screen belong to older words while a newer search runs, so
    // the list keeps them instead of blanking on every keystroke.
    stale: state.query !== asked,
    retry: () => void run(asked),
  }
}

function MarketSearchHeaderContent() {
  // On a phone this control is drawn inside the header's three-dot dropdown,
  // which is a list rather than a row. So it is the field itself, on a line of
  // its own, rather than a magnifier you press to get a field.
  const phone = useIsMobile()
  const [typed, setTyped] = React.useState("")
  const [open, setOpen] = React.useState(false)
  // Which row the keyboard is on, remembered against the list it belongs to: a
  // fresh list of markets starts at its first row, whatever row the keyboard
  // was on a moment ago.
  const [chosen, setChosen] = React.useState<{
    inList: MarketSearchAnswer | null
    index: number
  }>({ inList: null, index: 0 })
  const fieldRef = React.useRef<HTMLInputElement>(null)
  const panelFieldRef = React.useRef<HTMLInputElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const { answer, busy, failed, stale, retry } = useMarketSearch(typed)
  const hits = answer?.hits ?? []
  const asked = typed.trim()
  const highlighted = chosen.inList === answer ? chosen.index : 0
  const setHighlighted = (index: number) => setChosen({ inList: answer, index })

  const show = (next: string) => {
    setTyped(next)
    setOpen(next.trim().length >= LEAST_SEARCH_LETTERS)
  }

  const openMarket = (href: string | null) => {
    if (!href) return
    setOpen(false)
    setTyped("")
    window.location.assign(href)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) return
      event.preventDefault()
      const next = highlighted + (event.key === "ArrowDown" ? 1 : -1)
      setHighlighted(
        next < 0 ? hits.length - 1 : next >= hits.length ? 0 : next
      )
      return
    }
    if (event.key === "Enter") {
      const row = hits[highlighted]
      if (row) {
        event.preventDefault()
        openMarket(row.href)
      }
    }
  }

  const fieldProps = {
    placeholder: "Search markets",
    "aria-label": "Search markets on every exchange",
    role: "combobox" as const,
    "aria-expanded": open,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    value: typed,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      show(event.target.value),
    onKeyDown,
  }

  const results = () => {
    if (asked.length < LEAST_SEARCH_LETTERS) {
      return (
        <p className="p-4 text-sm text-muted-foreground">
          Type at least {LEAST_SEARCH_LETTERS} letters of a ticker.
        </p>
      )
    }
    if (failed) {
      return (
        <ErrorRow
          message="The markets could not be searched."
          onRetry={retry}
          className="p-4 text-sm"
        />
      )
    }
    if (hits.length === 0) {
      if (busy || stale) {
        return (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Searching every exchange
          </div>
        )
      }
      return (
        <p className="p-4 text-sm text-muted-foreground">
          No exchange lists a market called "{asked}".
        </p>
      )
    }

    return (
      <ScrollArea viewportClassName="max-h-80">
        <ul
          id={listId}
          role="listbox"
          aria-label="Markets found"
          className="p-1"
        >
          {hits.map((hit, index) => (
            <li key={`${hit.protocol}:${hit.key}`} role="presentation">
              <a
                role="option"
                aria-selected={index === highlighted}
                href={hit.href ?? undefined}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                  index === highlighted ? "bg-accent" : "",
                  hit.href ? "hover:bg-accent" : "cursor-default opacity-70"
                )}
                title={
                  hit.href ? undefined : "This exchange has no chart page yet."
                }
                onMouseEnter={() => setHighlighted(index)}
                onClick={(event) => {
                  // A cmd-, ctrl-, shift- or alt-click is somebody asking for
                  // another tab or window, so the browser is left to do it.
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    if (hit.href) setOpen(false)
                    return
                  }
                  event.preventDefault()
                  openMarket(hit.href)
                }}
              >
                <span className="truncate font-semibold">
                  {hit.subExchange && !hit.symbol.includes(":")
                    ? `${hit.subExchange}:`
                    : ""}
                  {hit.symbol}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {hit.protocolLabel}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </ScrollArea>
    )
  }

  // A search is running and the rows on screen answer older words. Saying so
  // beats both a silent list that does not match the field and a panel that
  // blanks on every keystroke.
  const searching =
    asked.length >= LEAST_SEARCH_LETTERS && (busy || stale) && !failed

  const footnote =
    answer && (answer.more > 0 || answer.unavailable.length > 0)
      ? [
          answer.more > 0
            ? `${answer.more} more match${answer.more === 1 ? "" : "es"}. Type more letters to narrow it.`
            : null,
          answer.unavailable.length > 0
            ? `${answer.unavailable.join(", ")} did not answer.`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The field itself on a wide window, and an icon button below `lg`,
          where the header has room for one control — the same place the
          maintenance and view-as badges collapse. */}
      <div
        ref={boxRef}
        className="relative flex items-center"
        data-nav-shape="text"
      >
        {/* The panel hangs off this corner. The field cannot be the trigger:
            a trigger toggles the popover on every click, which would shut the
            list the moment somebody clicked back into what they were typing. */}
        <PopoverTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 bottom-0 size-0"
          />
        </PopoverTrigger>
        <DashboardToolbarSearch
          {...fieldProps}
          ref={fieldRef}
          className={phone ? "block w-72 max-w-full" : "hidden lg:block"}
          inputClassName={phone ? "w-full!" : "w-[220px]!"}
          onFocus={() => {
            if (asked.length >= LEAST_SEARCH_LETTERS) setOpen(true)
          }}
        />
        {phone ? null : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Search markets on every exchange"
            onClick={() => setOpen((current) => !current)}
          >
            <SearchIcon className="size-3.5" />
          </Button>
        )}
      </div>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          // The cursor goes to whichever field is on screen: the header's one on
          // a wide window, where the person is already typing, and the panel's
          // own below `lg`, where the header holds a button instead. Radix would
          // otherwise move it into the panel and the typing would stop.
          event.preventDefault()
          const onScreen = [fieldRef.current, panelFieldRef.current].find(
            (field) => field && field.offsetParent !== null
          )
          onScreen?.focus()
        }}
        // Typing in the header's field is outside this panel, and dismissing on
        // that would close the list on the first click back into the field.
        onPointerDownOutside={(event) => {
          if (boxRef.current?.contains(event.target as Node))
            event.preventDefault()
        }}
        onFocusOutside={(event) => {
          if (boxRef.current?.contains(event.target as Node))
            event.preventDefault()
        }}
      >
        {/* The second field, for the widths where the header holds a
            magnifier instead of a field. A phone has the field itself in the
            dropdown, so a copy of it on top of the results would be two
            places to type the same words. */}
        {phone ? null : (
          <div className="border-b p-2 lg:hidden">
            <DashboardToolbarSearch
              {...fieldProps}
              ref={panelFieldRef}
              className="w-full"
              inputClassName="w-full!"
            />
          </div>
        )}
        {results()}
        {hits.length > 0 && searching ? (
          <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Searching every exchange
          </div>
        ) : footnote && !searching ? (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {footnote}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default function MarketSearchHeader(_props: AppHeaderActionProps) {
  return <MarketSearchHeaderContent />
}
