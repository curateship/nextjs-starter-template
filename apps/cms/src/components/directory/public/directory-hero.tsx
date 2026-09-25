import * as React from "react"
import { Loader2Icon, MapPinIcon, SearchIcon, LocateFixedIcon } from "lucide-react"

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DirectorySuggestionList,
  useDirectorySuggestions,
} from "@/components/directory/public/directory-suggestions"
import { useNearPlace } from "@/components/directory/public/use-near-place"
import {
  DIRECTORY_NEAR_RADII_KM,
  type DirectoryBrowseSearch,
} from "@/lib/directory/public-search"
import { usePublicTheme } from "@/lib/branding"
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
 * **The band runs the whole width of the window** and sits flush under the
 * header, so it reads as the top of the page rather than as a card on it. It
 * is drawn inside the page's own column, which is 1152px and centred, so it
 * has to climb back out. `self-center` is how: a child wider than its column
 * and centred on it spills the same amount either side, and the column is
 * itself centred in the window, so the band lands flush against both edges.
 * It works whether or not the site centres its public text, which a left or
 * right offset would not. The lift under the header is the page's own top
 * spacing from Settings → Styling, not a number written here.
 *
 * Nothing in it names a colour. A site that changed its spacing or its
 * palette gets those here too.
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
  const theme = usePublicTheme()
  const bleed = useWindowWidth()

  return (
    /*
     * `text-left` for the same reason the page's column has it: a site's
     * Styling settings can centre its public text, which is right for a page
     * of marketing and wrong for a directory. The band sits outside that
     * column, so it has to say so itself.
     */
    <section
      className="mb-4 self-center border-b bg-muted/60 py-10 text-left md:mb-6 md:py-14"
      style={{
        width: bleed,
        // The page's top spacing, cancelled, so the band starts where the
        // header ends. Read from the site's settings, because a site that
        // widened its spacing would otherwise get a strip of background above
        // a band that is meant to be the top of the page.
        marginTop: -theme.mainSpacing,
        // Dots rather than a flat fill, at a twentieth of the text colour, so
        // the pattern follows a site into dark mode instead of being a grey
        // nobody chose.
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 0)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
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

        {/*
         * A form, so Enter runs the search from whichever box the visitor is
         * in. The typed text is handed over straight away rather than waiting
         * for the pause the box usually takes, because somebody who pressed
         * Enter has finished typing.
         */}
        <form
          className="flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-lg shadow-foreground/5 md:flex-row md:items-center"
          onSubmit={(event) => {
            event.preventDefault()
            onSearchChange(text)
          }}
        >
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

          <div className="hidden self-stretch border-l md:block" aria-hidden="true" />

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

          <div className="hidden self-stretch border-l md:block" aria-hidden="true" />

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
                <SelectTrigger id="directory-radius" className="border-0 shadow-none">
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
        </form>

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
      </div>
    </section>
  )
}

/**
 * The window's width without its scrollbar.
 *
 * `100vw` counts the scrollbar on Windows, and a band that wide adds a
 * sideways scroll to every page it is on. `clientWidth` is the number
 * `100vw` should have been, and it can only be read in a browser, so `100vw`
 * is what the server draws and the exact number replaces it on arrival. On a
 * Mac, where the scrollbar floats over the page, the two are the same and
 * nothing moves.
 */
function useWindowWidth() {
  const [width, setWidth] = React.useState("100vw")
  React.useEffect(() => {
    const measure = () =>
      setWidth(`${document.documentElement.clientWidth}px`)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  return width
}
