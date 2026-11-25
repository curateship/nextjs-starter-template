import * as React from "react"
import { Link } from "@tanstack/react-router"

import { loadDirectorySuggestions } from "@/lib/api/directory/public"
import { formatEventShortDay } from "@/lib/events/event-time"
import {
  DIRECTORY_SUGGESTION_DELAY_MS,
  DIRECTORY_SUGGESTION_MIN_LENGTH,
  directorySuggestionRows,
  type DirectorySuggestion,
} from "@/lib/directory/public-search"
import { cn } from "@/lib/utils"

/**
 * The short list of listings, categories and events the directory's search box
 * offers while somebody is still typing.
 *
 * Two halves that stay apart on purpose. `useDirectorySuggestions` holds the
 * asking, the remembering and the keyboard, and it touches no router, so the
 * toolbar can call it whether or not a suggestion is ever shown.
 * `DirectorySuggestionList` draws the rows and is the only half that makes a
 * link, so it renders nothing at all until there is something to offer.
 *
 * A form that wants a listing picked rather than opened (Suggest an event's
 * "Place") passes `onPick`: the rows become buttons that hand the row back,
 * and Enter on a highlighted row does the same.
 */

/** How many answered queries the box remembers before dropping the oldest. */
const REMEMBERED_QUERIES = 30

const NO_SUGGESTIONS: DirectorySuggestion[] = []

export type DirectorySuggestionBox = ReturnType<typeof useDirectorySuggestions>

export function useDirectorySuggestions({
  text,
  onSearch,
  onPick,
  kinds,
  enabled = true,
}: {
  /** What is in the box right now, not what is in the address. */
  text: string
  /** Enter with nothing picked: run the search the visitor typed. Without
   * one, Enter does what it would in any box, such as sending its form. */
  onSearch?: () => void
  /** Picks a row instead of opening its page. */
  onPick?: (row: DirectorySuggestion) => void
  /** Only these kinds of row, such as listings alone. */
  kinds?: DirectorySuggestion["kind"][]
  /** False asks nothing and shows nothing. */
  enabled?: boolean
}) {
  const query = text.trim()
  const key = query.toLocaleLowerCase()
  const longEnough = enabled && query.length >= DIRECTORY_SUGGESTION_MIN_LENGTH

  // The answers are the cache, filed under the word each one answers. A word
  // asked about before draws straight from here with no second request, and
  // the only place state is set is where the server answers.
  const [answers, setAnswers] = React.useState(
    () => new Map<string, DirectorySuggestion[]>()
  )
  // The queries whose request is still out. A ref rather than state, because a
  // second request for a word already being asked about is the one thing this
  // has to stop, and nothing is drawn differently while it waits.
  const inFlight = React.useRef(new Set<string>())

  const answered = longEnough ? (answers.get(key) ?? NO_SUGGESTIONS) : NO_SUGGESTIONS
  const items = kinds
    ? answered.filter((row) => kinds.includes(row.kind))
    : answered

  const [dismissed, setDismissed] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)

  // A fresh keystroke undoes an Escape and drops the highlight, because the
  // row that was highlighted belongs to the answer for the old query.
  const [lastKey, setLastKey] = React.useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setDismissed(false)
    setActiveIndex(-1)
  }

  const open = focused && !dismissed && items.length > 0
  const active = open && activeIndex < items.length ? activeIndex : -1

  React.useEffect(() => {
    if (!longEnough || answers.has(key) || inFlight.current.has(key)) return

    // Wait for a pause in typing. Someone typing "pizza" at speed asks once,
    // when they stop, rather than five times on the way there.
    const timer = setTimeout(() => {
      inFlight.current.add(key)
      loadDirectorySuggestions(query)
        .then((answer) => {
          // Filed under the word it was asked about, so a slow reply to an
          // earlier word can never land in the list for the word now in the
          // box. It simply waits there in case the visitor types it again.
          setAnswers((previous) =>
            remember(previous, key, directorySuggestionRows(answer))
          )
        })
        .catch(() => {
          // Suggestions are a convenience. A failed lookup leaves the box as a
          // plain search box and says nothing, and retyping asks again.
        })
        .finally(() => inFlight.current.delete(key))
    }, DIRECTORY_SUGGESTION_DELAY_MS)

    return () => clearTimeout(timer)
  }, [key, query, longEnough, answers])

  const listRef = React.useRef<HTMLUListElement>(null)
  const listboxId = React.useId()
  const optionId = (index: number) => `${listboxId}-option-${index}`

  const move = (step: number) => {
    setDismissed(false)
    setActiveIndex((previous) => {
      if (!items.length) return -1
      const next = previous + step
      if (next < 0) return items.length - 1
      if (next >= items.length) return 0
      return next
    })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Somebody typing Japanese or Chinese presses Enter to choose a character
    // from their keyboard's own list. Reading that as "run the search" would
    // take the key away from the tool they are actually using.
    if (event.nativeEvent.isComposing) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === "Escape") {
      // Without this a search input empties itself on Escape in Safari and
      // Chrome, so closing the list would also throw away what was typed.
      if (!open) return
      event.preventDefault()
      setDismissed(true)
      setActiveIndex(-1)
      return
    }
    if (event.key === "Enter") {
      if (active >= 0 && onPick) {
        event.preventDefault()
        onPick(items[active]!)
        setDismissed(true)
        setActiveIndex(-1)
        return
      }
      if (active < 0 && !onSearch) return
      event.preventDefault()
      if (active >= 0) {
        // The rows are real links, so the anchor's own click is the navigation.
        // Enter and a mouse then go to exactly the same place.
        const rows = listRef.current?.querySelectorAll<HTMLAnchorElement>(
          '[role="option"]'
        )
        rows?.[active]?.click()
        return
      }
      setDismissed(true)
      onSearch?.()
    }
  }

  return {
    items,
    open,
    active,
    onPick,
    listRef,
    listboxId,
    optionId,
    setActiveIndex,
    /** Spread onto the search input: the keyboard and what a reader is told. */
    inputProps: {
      role: "combobox" as const,
      "aria-expanded": open,
      // Only while the list is there to point at. A name pointing at nothing
      // is a broken reference to a screen reader.
      "aria-controls": open ? listboxId : undefined,
      "aria-autocomplete": "list" as const,
      "aria-activedescendant": active >= 0 ? optionId(active) : undefined,
      autoComplete: "off",
      onKeyDown,
      onFocus: () => setFocused(true),
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        if (listRef.current?.contains(event.relatedTarget)) return
        setFocused(false)
      },
    },
  }
}

/** Keeps the newest queries and drops the oldest, so a long session is bounded. */
function remember(
  previous: Map<string, DirectorySuggestion[]>,
  key: string,
  rows: DirectorySuggestion[]
) {
  const next = new Map(previous)
  next.set(key, rows)
  while (next.size > REMEMBERED_QUERIES) {
    const oldest = next.keys().next().value
    if (oldest === undefined) break
    next.delete(oldest)
  }
  return next
}

/**
 * The rows themselves, under the box.
 *
 * Real links rather than buttons: a suggested listing is a page, so it can be
 * middle-clicked into a new tab like any other link on the directory.
 */
export function DirectorySuggestionList({
  box,
  label = "Search suggestions",
}: {
  box: DirectorySuggestionBox
  label?: string
}) {
  const {
    items,
    open,
    active,
    onPick,
    listRef,
    listboxId,
    optionId,
    setActiveIndex,
  } = box

  return (
    <>
      {/* Said out loud, once the list settles, for somebody who cannot see it. */}
      <p role="status" aria-live="polite" className="sr-only">
        {open
          ? `${items.length} ${items.length === 1 ? "suggestion" : "suggestions"}`
          : ""}
      </p>
      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          // Mouse down inside the list must not take the focus off the box,
          // or the list would close before the click landed on a row.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-full right-0 left-0 z-20 mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.map((row, index) => (
            <li key={`${row.kind}-${row.slug}`} role="presentation">
              {onPick ? (
                <button
                  type="button"
                  role="option"
                  id={optionId(index)}
                  aria-selected={index === active}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onPick(row)}
                  className={cn(rowClass(index === active), "w-full text-left")}
                >
                  <SuggestionText row={row} />
                </button>
              ) : (
                <Link
                  role="option"
                  id={optionId(index)}
                  aria-selected={index === active}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  {...linkFor(row)}
                  className={rowClass(index === active)}
                >
                  <SuggestionText row={row} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function rowClass(active: boolean) {
  return cn(
    "flex h-8 items-center justify-between gap-2 rounded-sm px-2 text-sm",
    active ? "bg-accent text-accent-foreground" : "text-foreground"
  )
}

function SuggestionText({ row }: { row: DirectorySuggestion }) {
  return (
    <>
      <span className="truncate">{row.title}</span>
      {row.kind === "category" ? (
        <span className="shrink-0 text-xs text-muted-foreground">Category</span>
      ) : row.kind === "event" && row.startDate ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatEventShortDay(row.startDate)}
        </span>
      ) : null}
    </>
  )
}

function linkFor(row: DirectorySuggestion) {
  const params = { slug: row.slug }
  switch (row.kind) {
    case "category":
      return { to: "/directory/category/$slug" as const, params }
    case "event":
      return { to: "/events/$slug" as const, params }
    case "listing":
      return { to: "/directory/$slug" as const, params }
  }
}
