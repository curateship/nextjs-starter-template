"use client"

import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "@/components/app-link"
import { SiteSearchThumbnail } from "@/components/frontend/pages/site-search/SiteSearchThumbnail"
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"
import {
  suggestSiteSearchAction,
  type SiteSearchSuggestion,
} from "@/lib/actions/site-search/site-search-actions"
import { buildSearchHighlightSegments } from "@/lib/site-search/highlight"
import {
  SITE_SEARCH_TYPES,
  SITE_SEARCH_TYPE_LABELS,
  type SiteSearchSourceType,
} from "@/lib/site-search/types"

/**
 * Long enough that a normal typing burst sends one request instead of one per
 * keystroke, short enough that the dropdown still feels immediate.
 */
const DEBOUNCE_MS = 300

/** Matches the server, which returns nothing below two characters. */
const MIN_QUERY_LENGTH = 2

interface SiteSearchTypeaheadProps {
  siteId: string
  enabledTypes: SiteSearchSourceType[]
  value: string
  placeholder: string
  noResultsText: string
  showImages: boolean
  onValueChange: (value: string) => void
  onSubmit: () => void
  onSelect: (url: string) => void
}

export function SiteSearchTypeahead({
  siteId,
  enabledTypes,
  value,
  placeholder,
  noResultsText,
  showImages,
  onValueChange,
  onSubmit,
  onSelect,
}: SiteSearchTypeaheadProps) {
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<SiteSearchSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Nothing is fetched until the visitor types, so arriving with ?q=... in the
  // URL does not fire a suggestion request for a search already on the page.
  const [typed, setTyped] = useState(false)

  const trimmedValue = value.trim()
  const hasQuery = trimmedValue.length >= MIN_QUERY_LENGTH

  useEffect(() => {
    if (!typed) return

    if (!hasQuery) {
      setSuggestions([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(() => {
      suggestSiteSearchAction({ data: { input: { siteId, query: trimmedValue, enabledTypes } } })
        .then((result) => {
          if (cancelled) return
          setSuggestions(result.success && result.data ? result.data.items : [])
          // A refused request is not the same as a search that matched nothing;
          // saying "no results" for a rate-limited visitor would be a lie.
          setError(result.success ? null : result.error || "Search failed")
        })
        .catch(() => {
          if (cancelled) return
          setSuggestions([])
          setError("Search failed")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, DEBOUNCE_MS)

    // Runs on every keystroke, so an in-flight request for an older query can
    // never overwrite the results for what is in the box now.
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabledTypes, hasQuery, siteId, trimmedValue, typed])

  const groups = useMemo(
    () =>
      SITE_SEARCH_TYPES.filter((type) => enabledTypes.includes(type))
        .map((type) => ({ type, items: suggestions.filter((item) => item.type === type) }))
        .filter((group) => group.items.length > 0),
    [enabledTypes, suggestions]
  )

  // Keyboard order has to follow what is on screen, so flatten the groups.
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const seeAllIndex = flatItems.length
  const optionCount = flatItems.length ? flatItems.length + 1 : 0

  useEffect(() => {
    setActiveIndex(-1)
  }, [suggestions])

  useEffect(() => {
    if (activeIndex < 0) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const panelOpen = open && typed && hasQuery

  const closePanel = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const runFullSearch = () => {
    closePanel()
    onSubmit()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runFullSearch()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (!panelOpen) return
      event.preventDefault()
      closePanel()
      return
    }

    if (event.key === "Tab") {
      closePanel()
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!optionCount) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((current) => {
        const next = current + step
        if (next < 0) return optionCount - 1
        if (next >= optionCount) return 0
        return next
      })
      return
    }

    // Enter with nothing highlighted falls through to the form, which runs the
    // normal full search.
    if (event.key === "Enter" && panelOpen && activeIndex >= 0) {
      event.preventDefault()
      if (activeIndex === seeAllIndex) {
        runFullSearch()
        return
      }

      const item = flatItems[activeIndex]
      if (item) {
        closePanel()
        onSelect(item.url)
      }
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(event) => {
            setTyped(true)
            setOpen(true)
            setActiveIndex(-1)
            onValueChange(event.target.value)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={closePanel}
          placeholder={placeholder}
          className="min-h-11 w-full text-base"
          autoComplete="off"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
        />

        {panelOpen && (
          // Keeping the mouse from moving focus means a click lands on the
          // suggestion instead of closing the panel first.
          <div
            data-slot="site-search-suggestions"
            className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
            onMouseDown={(event) => event.preventDefault()}
          >
            {loading && flatItems.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </p>
            ) : flatItems.length === 0 ? (
              <p role={error ? "alert" : undefined} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {error || noResultsText}
              </p>
            ) : (
              <ScrollArea className="max-h-80 [&>[data-slot=scroll-area-viewport]]:max-h-80">
                <div ref={listRef} id={listId} role="listbox" className="p-1">
                  {groups.map((group) => (
                    <div key={group.type} role="group" aria-labelledby={`${listId}-${group.type}`}>
                      <p
                        id={`${listId}-${group.type}`}
                        className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                      >
                        {SITE_SEARCH_TYPE_LABELS[group.type]}
                      </p>
                      {group.items.map((item) => {
                        const index = flatItems.indexOf(item)
                        const active = index === activeIndex

                        return (
                          <Link
                            // Two documents can point at the same page, so the
                            // URL alone is not unique. The index alone would be
                            // worse: React would keep the previous row's <img>
                            // and show its picture until the new one loaded.
                            key={`${item.url}-${index}`}
                            id={`${listId}-option-${index}`}
                            href={item.url}
                            role="option"
                            aria-selected={active}
                            data-active={active}
                            className={cn(
                              "flex items-center gap-2 rounded-sm px-2 py-1.5",
                              active && "bg-accent text-accent-foreground"
                            )}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey) return
                              event.preventDefault()
                              closePanel()
                              onSelect(item.url)
                            }}
                          >
                            {/* Content without a usable picture keeps the same
                                indent, so the titles stay in one column. */}
                            {showImages && <SiteSearchThumbnail image={item.image} size="sm" />}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">
                                {buildSearchHighlightSegments(item.title, trimmedValue).map((segment, segmentIndex) =>
                                  segment.match ? (
                                    <mark key={segmentIndex} className="bg-transparent font-semibold text-inherit">
                                      {segment.text}
                                    </mark>
                                  ) : (
                                    <span key={segmentIndex}>{segment.text}</span>
                                  )
                                )}
                              </span>
                              {/* Recurring events repeat the same title, so the
                                  path is what tells two suggestions apart. */}
                              <span className="block truncate text-xs text-muted-foreground">{item.url}</span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  ))}

                  <div
                    id={`${listId}-option-${seeAllIndex}`}
                    role="option"
                    aria-selected={activeIndex === seeAllIndex}
                    data-active={activeIndex === seeAllIndex}
                    className={cn(
                      "mt-1 flex cursor-pointer items-center gap-2 rounded-sm border-t px-2 py-2 text-sm",
                      activeIndex === seeAllIndex && "bg-accent text-accent-foreground"
                    )}
                    onMouseEnter={() => setActiveIndex(seeAllIndex)}
                    onClick={runFullSearch}
                  >
                    <Search className="h-4 w-4 shrink-0" />
                    <span className="truncate">See all results for &ldquo;{trimmedValue}&rdquo;</span>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>

      <Button type="submit" className="min-h-11 gap-2">
        <Search className="h-4 w-4" />
        Search
      </Button>
    </form>
  )
}
