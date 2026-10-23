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
import { DIRECTORY_NEAR_RADII_KM } from "@/lib/directory/public-search"
import type { DealsPageSearch } from "@/lib/promotions/deals-page"
import { useSearchBoxText } from "@/lib/nav/list-search"

/**
 * The band at the top of the Deals page: where the page sits, its name, the
 * line under it, and one bar holding what a visitor searches by.
 *
 * The bar asks the same question the directory's and the Events page's do, in
 * the same order: what is it, where, and how far. The band itself, its width
 * and its dots are `PublicHeroBand`, shared with both, so a change to one
 * reaches all three.
 *
 * What is typed writes to the address, so a narrowed page survives a reload
 * and can be sent to somebody. The Cuisine and Neighbourhood buttons are not
 * in the bar: they sit in the row above the cards with the "when" chips,
 * because they narrow a list that is already on the screen.
 */
export function DealsHero({
  crumbs,
  intro,
  current,
  radius,
  onSearchChange,
  onNearChange,
  onRadiusChange,
  onNearClear,
}: {
  /** The breadcrumbs, drawn inside the band above the title. */
  crumbs: React.ReactNode
  /** "Deals on now at Eat Drink Toronto." */
  intro: string
  /** The address as it stands, so a box keeps what it is not changing. */
  current: DealsPageSearch
  radius: number
  onSearchChange: (value: string) => void
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
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Deals</h1>
        <p className="text-base text-muted-foreground">{intro}</p>
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
            placeholder="Search deals or places"
            aria-label="Search deals"
            className="border-0 pl-9 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        <PublicHeroBarDivider />

        <div className="relative min-w-0 flex-1">
          <MapPinIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="deals-place"
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
            htmlFor="deals-radius"
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
              <SelectTrigger id="deals-radius" className="border-0 shadow-none">
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
            Within {radius} km of {current.area ?? "your location"}. Places with
            no pin on the map are left out.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onNearClear}>
            Clear location
          </Button>
        </p>
      ) : null}
    </PublicHeroBand>
  )
}
