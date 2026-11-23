import {
  Loader2Icon,
  MapPinIcon,
  SearchIcon,
  LocateFixedIcon,
} from "lucide-react"

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
import {
  PublicHeroBand,
  PublicHeroBar,
  PublicHeroBarDivider,
} from "@/components/shared/public-hero-band"
import {
  DirectorySuggestionList,
  useDirectorySuggestions,
} from "@/components/directory/public/directory-suggestions"
import { useNearPlace } from "@/components/directory/public/use-near-place"
import {
  DIRECTORY_NEAR_RADII_KM,
  type DirectoryBrowseSearch,
} from "@/lib/directory/public-search"
import { useSearchBoxText } from "@/lib/nav/list-search"

/**
 * The band at the top of the browse page: the directory's name, the line under
 * it, and one bar holding everything a visitor searches with.
 *
 * **One bar rather than three rows.** What somebody wants, where, and how far
 * they will go are one question asked once, and the old page asked them in
 * three places down the screen. The bar keeps the three controls in the order
 * they are thought of and ends with the button that runs them.
 *
 * The band itself, its width and its dots are `PublicHeroBand`, which the
 * Events page uses too.
 */
export function DirectoryHero({
  title,
  intro,
  current,
  radius,
  onSearchChange,
  onNearChange,
  onRadiusChange,
  onNearClear,
}: {
  title: string
  intro: string
  current: DirectoryBrowseSearch
  radius: number
  onSearchChange: (value: string) => void
  onNearChange: (near: string, place: string, radius: number) => void
  onRadiusChange: (radius: number) => void
  onNearClear: () => void
}) {
  // The shell's own search-box behaviour: the box keeps what is being typed,
  // the address catches up once typing pauses, and Back or a pasted link puts
  // the box back in step.
  const [text, setText] = useSearchBoxText(current.q ?? "", onSearchChange)
  const suggestions = useDirectorySuggestions({
    text,
    onSearch: () => onSearchChange(text),
  })
  const picker = useNearPlace({ radius, onNearChange })
  const nearActive = Boolean(current.near)

  return (
    <PublicHeroBand>
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          {title}
        </h1>
        {/* The site's browse intro from Settings → Directory. A site that
              never wrote one gets the title alone rather than a gap. */}
        {intro ? (
          <p className="text-base text-muted-foreground">{intro}</p>
        ) : null}
      </div>

      {/* The typed text is handed over straight away rather than waiting
            for the pause the box usually takes, because somebody who pressed
            Enter has finished typing. */}
      <PublicHeroBar onSubmit={() => onSearchChange(text)}>
        {/* `relative` because the suggestion list hangs off the bottom of the
              box rather than pushing the results below it down the page. */}
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search listings"
            aria-label="Search listings"
            className="border-0 pl-9 text-base shadow-none focus-visible:ring-0"
            {...suggestions.inputProps}
          />
          <DirectorySuggestionList box={suggestions} />
        </div>

        <PublicHeroBarDivider />

        <div className="relative min-w-0 flex-1">
          <MapPinIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="directory-place"
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
            htmlFor="directory-radius"
            className="pl-1 text-sm font-medium whitespace-nowrap"
          >
            Within
          </label>
          {/* Within stays shut until there is somewhere to measure from, and
                says why. A distance picked before that would do nothing, and
                the visitor would only find out from results that look wrong. */}
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
                id="directory-radius"
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
            // typed words go into the address, and a typed place is looked
            // up. Submitting handles the words, so only the place is left.
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
            Within {radius} km of {current.place ?? "your location"}.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onNearClear}>
            Clear location
          </Button>
        </p>
      ) : null}
    </PublicHeroBand>
  )
}
