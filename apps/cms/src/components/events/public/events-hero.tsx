import * as React from "react"
import {
  Loader2Icon,
  LocateFixedIcon,
  MapPinIcon,
  SearchIcon,
} from "lucide-react"

import {
  PublicHeroBand,
  PublicHeroBar,
  PublicHeroBarDivider,
} from "@/components/shared/public-hero-band"
import { useNearPlace } from "@/components/directory/public/use-near-place"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { EventCategory } from "@/lib/api/events/public"
import { DIRECTORY_NEAR_RADII_KM } from "@/lib/directory/public-search"
import type { EventsPageSearch } from "@/lib/events/events-page"
import { useSearchBoxText } from "@/lib/nav/list-search"

/** The value the category box carries while no category is picked. */
const EVERY_CATEGORY = "all"

/**
 * The band at the top of the Events page: where the page sits, its name, the
 * time zone line, the two buttons a visitor acts with, and one bar holding
 * what they search by.
 *
 * The bar asks the same question the directory's does, in the same order:
 * what is it, what kind, where, and how far. The category is a box rather than
 * a row of chips because a site with twenty categories wrapped the chips over
 * three lines and pushed the events off the screen.
 *
 * Typing and the category box write to the address, so a filtered page
 * survives a reload and can be sent to somebody. The band itself is
 * `PublicHeroBand`, shared with the directory.
 */
export function EventsHero({
  crumbs,
  intro,
  actions,
  current,
  categories,
  radius,
  onSearchChange,
  onCategoryChange,
  onNearChange,
  onRadiusChange,
  onNearClear,
}: {
  /** The breadcrumbs, drawn inside the band above the title. */
  crumbs: React.ReactNode
  /** "All times are Eastern Time." */
  intro: string
  /** Suggest an event and Subscribe, drawn opposite the title. */
  actions: React.ReactNode
  /** The address as it stands, so a box keeps what it is not changing. */
  current: EventsPageSearch
  categories: EventCategory[]
  radius: number
  onSearchChange: (value: string) => void
  onCategoryChange: (slug: string | undefined) => void
  onNearChange: (near: string, area: string, radius: number) => void
  onRadiusChange: (radius: number) => void
  onNearClear: () => void
}) {
  // The shell's own search-box behaviour: the box keeps what is being typed,
  // the address catches up once typing pauses, and Back or a pasted link puts
  // the box back in step.
  const [text, setText] = useSearchBoxText(current.q ?? "", onSearchChange)
  const picker = useNearPlace({ radius, onNearChange })
  const nearActive = Boolean(current.near)

  return (
    <PublicHeroBand>
      {crumbs}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Events
          </h1>
          <p className="text-base text-muted-foreground">{intro}</p>
        </div>
        {/* The buttons sit with the title rather than in the bar: suggesting
            an event and subscribing to the calendar are not ways of narrowing
            the list down. */}
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      {/* The typed words are handed over straight away rather than waiting for
          the pause the box usually takes, because somebody who pressed Enter
          has finished typing. */}
      <PublicHeroBar onSubmit={() => onSearchChange(text)}>
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="border-0 pl-9 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        {categories.length ? (
          <div className="flex min-w-0 items-center">
            <Select
              value={current.category ?? EVERY_CATEGORY}
              onValueChange={(value) =>
                onCategoryChange(value === EVERY_CATEGORY ? undefined : value)
              }
            >
              <SelectTrigger
                id="events-category"
                aria-label="Category"
                className="border-0 font-medium shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY_CATEGORY}>All categories</SelectItem>
                {categories.map((row) => (
                  <SelectItem key={row.id} value={row.slug}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <PublicHeroBarDivider />

        <div className="relative min-w-0 flex-1">
          <MapPinIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="events-place"
            value={picker.place}
            onChange={(event) => picker.setPlace(event.target.value)}
            placeholder="Town, city, or postcode"
            aria-label="Near"
            className="border-0 pl-9 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={picker.useMyLocation}
              disabled={picker.locating}
              aria-label="Use my location"
            >
              {picker.locating ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <LocateFixedIcon />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Use my location</TooltipContent>
        </Tooltip>

        <PublicHeroBarDivider />

        <div className="flex items-center gap-2">
          <label
            htmlFor="events-radius"
            className="pl-1 text-sm font-medium whitespace-nowrap"
          >
            Within
          </label>
          {/* Within stays shut until there is somewhere to measure from, and
              says why. A distance picked before that would do nothing, and the
              visitor would only find out from results that look wrong. */}
          <DisabledReason
            disabled={!nearActive}
            reason="Pick a location first."
          >
            <Select
              disabled={!nearActive}
              value={String(radius)}
              onValueChange={(value) => onRadiusChange(Number(value))}
            >
              <SelectTrigger
                id="events-radius"
                className="border-0 shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIRECTORY_NEAR_RADII_KM.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} km
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DisabledReason>
        </div>

        <Button
          type="submit"
          disabled={picker.searching}
          onClick={() => {
            // Two jobs on one press, because the bar asks one question: the
            // typed words go into the address, and a typed place is looked up.
            // Submitting handles the words, so only the place is left.
            if (picker.place.trim()) void picker.searchPlace()
          }}
        >
          {picker.searching ? <Loader2Icon className="animate-spin" /> : null}
          Search
        </Button>
      </PublicHeroBar>

      {picker.message ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {picker.message}
        </p>
      ) : null}

      {nearActive ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Within {radius} km of {current.area ?? "your location"}. Events with
            no place on the map are left out.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onNearClear}>
            Clear location
          </Button>
        </p>
      ) : null}
    </PublicHeroBand>
  )
}
