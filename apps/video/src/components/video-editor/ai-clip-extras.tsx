import { Link } from "@tanstack/react-router"
import { CheckIcon, SearchIcon, ShirtIcon, XIcon } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { useId, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ExtraItem } from "@/lib/api/video/extras"
import {
  BOARD_FULL_MESSAGE,
  BOARD_TILES,
  boardExtraCount,
  EXTRA_KIND_LABELS,
  EXTRA_KINDS,
  type ExtraKind,
  type ExtraPicks,
} from "@/lib/video/extras"
import { cn } from "@/lib/utils"

/**
 * The Extras button in step 1 of the AI clip panel. It opens one kind at a
 * time, picked from tabs, as a grid of pictures with a search box, so a long
 * list of jackets scrolls inside its own tab instead of pushing the backdrops
 * off the bottom. One pick per kind, and the picks show as chips under the
 * button with an x each. The clothing, hair and prop picks share the person
 * board with the actor's angles, so a pick that would make a fifth tile is
 * refused.
 */
export function AiClipExtras({
  children,
  extras,
  picks,
  angles,
  disabled,
  onChange,
  onRefuse,
}: {
  /** The buttons that share the Extras button's row, such as New actor. */
  children?: ReactNode
  extras: ExtraItem[]
  picks: ExtraPicks
  /** How many of the actor's angles are picked for the board. */
  angles: number
  disabled?: boolean
  onChange: (picks: ExtraPicks) => void
  onRefuse: (message: string) => void
}) {
  const [kind, setKind] = useState<ExtraKind>("clothing")
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  // The picks as they were when the popover opened. The grid is ordered by
  // these, so a tile never jumps under the pointer while picking.
  const [openedWith, setOpenedWith] = useState<ExtraPicks>({})
  const noneId = useId()

  const picked = EXTRA_KINDS.flatMap((each) => {
    const extra = extras.find((candidate) => candidate.id === picks[each])
    return extra ? [extra] : []
  })
  // The picked one comes first, so it shows without scrolling a long grid.
  const first = openedWith[kind]
  const ofKind = extras
    .filter((extra) => extra.kind === kind)
    .sort((a, b) => Number(b.id === first) - Number(a.id === first))
  const words = search.trim().toLowerCase()
  const shown = words
    ? ofKind.filter((extra) =>
        `${extra.name} ${extra.prompt}`.toLowerCase().includes(words)
      )
    : ofKind
  const labels = EXTRA_KIND_LABELS[kind]
  const showSearch = searching || Boolean(search)

  function closeSearch() {
    setSearch("")
    setSearching(false)
  }

  function pick(of: ExtraKind, extraId: string | null) {
    const next = { ...picks }
    if (extraId) next[of] = extraId
    else delete next[of]
    if (of !== "backdrop" && extraId && angles + boardExtraCount(next) > BOARD_TILES) {
      onRefuse(BOARD_FULL_MESSAGE)
      return
    }
    onChange(next)
  }

  return (
    <div className="grid min-w-0 gap-2">
      {/* Side by side when the panel has room, one above the other when it
          is too narrow for both names. */}
      <div className="flex min-w-0 flex-wrap gap-2 *:flex-1">
        {children}
        <Popover
          onOpenChange={(open) => {
            if (!open) return
            setOpenedWith(picks)
            closeSearch()
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={disabled}>
              <ShirtIcon />
              {picked.length ? `Extras · ${picked.length}` : "Extras"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label="Extras"
            className="w-[min(26rem,calc(100vw-2rem))]"
            onEscapeKeyDown={(event) => {
              // Escape first empties and closes the search, then the box.
              if (!showSearch) return
              event.preventDefault()
              closeSearch()
            }}
          >
            {/* Underlined tabs, as Tyler drew them on 19 Oct 2026, with the
                search as a magnifying glass at the row's right end. */}
            {/* The tab row reaches the box's top and sides, so the line
                under it runs edge to edge, and the words sit as far in as
                the pictures below: 12 pixels from every edge, counting the
                glass's own button padding on the right. */}
            <div className="-mx-2.5 -mt-2.5 flex min-w-0 items-center gap-2 border-b pt-0.5 pr-1.5 pl-3">
              <TabsPrimitive.Root
                value={kind}
                onValueChange={(value) => {
                  setKind(value as ExtraKind)
                  closeSearch()
                }}
                // Sideways only, with no bar drawn: a bar here stood in the
                // row as a grey thumb beside the magnifying glass.
                className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
              >
                <TabsPrimitive.List className="flex h-10 w-max items-stretch gap-4">
                  {EXTRA_KINDS.map((each) => (
                    <TabsPrimitive.Trigger
                      key={each}
                      value={each}
                      className="inline-flex items-center border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=active]:border-foreground data-[state=active]:text-foreground"
                    >
                      {EXTRA_KIND_LABELS[each].tab}
                    </TabsPrimitive.Trigger>
                  ))}
                </TabsPrimitive.List>
              </TabsPrimitive.Root>
              {ofKind.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Search ${labels.tab.toLowerCase()}`}
                  aria-pressed={showSearch}
                  className={cn(showSearch && "bg-muted")}
                  onClick={() => (showSearch ? closeSearch() : setSearching(true))}
                >
                  <SearchIcon />
                </Button>
              ) : null}
            </div>
            {ofKind.length ? (
              <>
                {showSearch ? (
                  <Input
                    type="search"
                    autoFocus
                    value={search}
                    maxLength={200}
                    placeholder={`Search ${labels.tab.toLowerCase()}`}
                    aria-label={`Search ${labels.tab.toLowerCase()}`}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                ) : null}
                {shown.length ? (
                  <ul
                    aria-label={labels.tab}
                    className="grid max-h-80 grid-cols-3 content-start gap-2 overflow-y-auto p-0.5"
                  >
                    {shown.map((extra) => {
                      const on = picks[kind] === extra.id
                      return (
                        <li key={extra.id} className="min-w-0">
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => pick(kind, on ? null : extra.id)}
                            className={cn(
                              "relative grid w-full min-w-0 gap-1 rounded-lg border bg-background p-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              on && "border-primary ring-2 ring-primary/30"
                            )}
                          >
                            <img
                              src={extra.image_url}
                              alt=""
                              draggable={false}
                              className="aspect-square w-full rounded-md bg-muted object-contain"
                            />
                            <span className="truncate font-medium">{extra.name}</span>
                            {on ? (
                              <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                                <CheckIcon className="size-3.5" />
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No {labels.tab.toLowerCase()} matches "{search.trim()}".
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 px-0.5 pb-0.5">
                  <Checkbox
                    id={noneId}
                    checked={!picks[kind]}
                    onCheckedChange={(checked) => {
                      if (checked) pick(kind, null)
                    }}
                  />
                  <Label htmlFor={noneId} className="text-xs text-muted-foreground">
                    None
                  </Label>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {labels.none}.{" "}
                <Link
                  to="/admin/video-editor/actors"
                  search={{ tab: kind }}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Make one
                </Link>
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {picked.length ? (
        <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Extras picked">
          {picked.map((extra) => (
            <li
              key={extra.id}
              className="flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md border bg-background pl-2 text-xs"
            >
              <span className="truncate">{extra.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={`Take off ${extra.name}`}
                onClick={() => pick(extra.kind, null)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
