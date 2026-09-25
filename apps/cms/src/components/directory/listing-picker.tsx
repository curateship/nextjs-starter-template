import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"

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
  findListingChoices,
  getPostErrorMessage,
  type ListingChoice,
} from "@/lib/api/posts/posts"
import { focusRing } from "@/lib/layout/focus-ring"
import { SEARCH_SETTLE_MS } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

/**
 * A button that opens a search-as-you-type list of this site's listings. The
 * post editor's "Listing card" and the event window's "Pick a listing" both
 * use it. A draft listing is offered and marked, so the admin knows a visitor
 * will not see it yet.
 */
export function ListingPicker({
  label,
  inputId,
  size,
  disabled,
  onPick,
}: {
  /** The button's words, like "Listing card". */
  label: string
  /** The search box's id, unique on the page. */
  inputId: string
  size?: "sm" | "default"
  disabled?: boolean
  onPick: (listing: ListingChoice) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<ListingChoice[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(
      () => {
        findListingChoices(query).then(
          (found) => {
            if (cancelled) return
            setResults(found)
            setError(null)
          },
          (failure: unknown) => {
            if (!cancelled) setError(getPostErrorMessage(failure))
          }
        )
      },
      query ? SEARCH_SETTLE_MS : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={disabled}>
          <PlusIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Find a listing</Label>
          <Input
            id={inputId}
            value={query}
            placeholder="Search by name…"
            onChange={(event) => setQuery(event.target.value)}
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : results === null ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {query.trim()
                ? "No listing on this site matches that name."
                : "This site has no listings yet."}
            </p>
          ) : (
            <ScrollArea className="max-h-64">
              <ul className="grid gap-1">
                {results.map((listing) => (
                  <li key={listing.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                        focusRing
                      )}
                      onClick={() => {
                        onPick(listing)
                        setOpen(false)
                        setQuery("")
                      }}
                    >
                      <span className="truncate">{listing.title}</span>
                      {listing.status === "draft" ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Draft
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
