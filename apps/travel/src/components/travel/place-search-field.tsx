import * as React from "react"
import { Loader2Icon, MapPinIcon } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTravelServices } from "@/components/travel/use-travel-services"
import {
  loadPlaceDetails,
  searchPlaces,
  type PlaceDetails,
  type PlaceSuggestion,
} from "@/lib/api/travel/services"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const DEBOUNCE_MS = 250

const newSessionToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

/** What a typed place is when Google isn't there to look it up. */
function typedPlace(text: string): PlaceDetails {
  const value = text.trim()
  return {
    place: { name: value.slice(0, 200), address: value.slice(0, 400), lat: null, lng: null, placeId: null },
    openingHours: null,
    website: null,
    phone: null,
  }
}

/**
 * The field for an activity's place. With Google Maps set up, typing shows
 * matching places underneath; picking one loads its address, position, hours,
 * website and phone and hands them to `onPick`. Without Google, or when
 * nothing is picked, the typed words are the place, handed over when the
 * field is left or Enter is pressed.
 *
 * The visible label is the caller's, linked through `id`.
 */
export function PlaceSearchField({
  id,
  defaultValue = "",
  placeholder = "Search for a place",
  disabled,
  invalid,
  className,
  onPick,
}: {
  id?: string
  /** The text shown at first, usually the saved place's name. */
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  onPick: (details: PlaceDetails) => void
}) {
  const { google } = useTravelServices()
  const listId = React.useId()
  const fieldRef = React.useRef<HTMLDivElement>(null)
  const [text, setText] = React.useState(defaultValue)
  const [rows, setRows] = React.useState<PlaceSuggestion[]>([])
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const [loading, setLoading] = React.useState(false)

  // The text last handed to onPick, so Enter then blur doesn't hand it over twice.
  const committed = React.useRef(defaultValue)
  // Google bills the typing and the pick together under one token; a pick starts a new one.
  const session = React.useRef<string | null>(null)
  // Only the newest search's answer is shown, whatever order they come back in.
  const latest = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // One toast per run of failures, not one per keystroke.
  const searchFailed = React.useRef(false)

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function token() {
    session.current ??= newSessionToken()
    return session.current
  }

  function closeList() {
    latest.current += 1
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
    setRows([])
  }

  function search(query: string) {
    if (timer.current) clearTimeout(timer.current)
    const ask = ++latest.current
    if (!query.trim()) {
      setRows([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      searchPlaces(query, token()).then(
        (found) => {
          if (ask !== latest.current) return
          searchFailed.current = false
          setRows(found)
          setActive(0)
          setOpen(found.length > 0)
        },
        (error: unknown) => {
          if (ask !== latest.current) return
          setRows([])
          setOpen(false)
          if (searchFailed.current) return
          searchFailed.current = true
          showErrorToast(getTravelErrorMessage(error))
        }
      )
    }, DEBOUNCE_MS)
  }

  function commitTyped() {
    if (text.trim() === committed.current.trim()) return
    committed.current = text
    onPick(typedPlace(text))
  }

  async function pick(row: PlaceSuggestion) {
    const sessionToken = token()
    session.current = null
    closeList()
    setText(row.name)
    committed.current = row.name
    setLoading(true)
    try {
      onPick(await loadPlaceDetails(row.placeId, sessionToken))
    } catch (error) {
      showErrorToast(getTravelErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const showList = google && open && rows.length > 0
  const optionId = (index: number) => `${listId}-${index}`

  return (
    <Popover open={showList} onOpenChange={(next) => (next ? null : closeList())}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={fieldRef} className={cn("relative", className)}>
          <Input
            id={id}
            value={text}
            disabled={disabled}
            placeholder={google ? placeholder : "Name or address"}
            autoComplete="off"
            role={google ? "combobox" : undefined}
            aria-autocomplete={google ? "list" : undefined}
            aria-expanded={google ? showList : undefined}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList ? optionId(active) : undefined}
            aria-invalid={invalid || undefined}
            aria-busy={loading || undefined}
            className={cn(loading && "pr-8")}
            onChange={(event) => {
              setText(event.target.value)
              if (google) search(event.target.value)
            }}
            onBlur={() => {
              closeList()
              commitTyped()
            }}
            onKeyDown={(event) => {
              if (showList && event.key === "ArrowDown") {
                event.preventDefault()
                setActive((index) => (index + 1) % rows.length)
              } else if (showList && event.key === "ArrowUp") {
                event.preventDefault()
                setActive((index) => (index - 1 + rows.length) % rows.length)
              } else if (event.key === "Enter") {
                event.preventDefault()
                const row = showList ? rows[active] : undefined
                if (row) void pick(row)
                else {
                  closeList()
                  commitTyped()
                }
              } else if (event.key === "Escape" && showList) {
                // Closes the list only; a window behind the field stays open.
                event.preventDefault()
                event.stopPropagation()
                closeList()
              }
            }}
          />
          {loading ? (
            <Loader2Icon
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : null}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // A click back in the field keeps the list; the field handles itself.
          const target = event.target
          if (target instanceof Node && fieldRef.current?.contains(target)) {
            event.preventDefault()
          }
        }}
      >
        <ScrollArea className="max-h-72">
          <div id={listId} role="listbox" aria-label="Places" className="grid gap-0.5 p-1">
            {rows.map((row, index) => (
              <div
                key={row.placeId}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // Keeps focus in the field, so leaving it doesn't save the typed words first.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => void pick(row)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                  index === active && "bg-accent text-accent-foreground"
                )}
              >
                <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate">{row.name}</span>
                  {row.detail ? (
                    <span className="block truncate text-xs text-muted-foreground">{row.detail}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
