import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PublicCategory } from "@/lib/api/directory/public"
import {
  DIRECTORY_NEAR_RADII_KM,
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  DEFAULT_DIRECTORY_NEAR_RADIUS_KM,
  formatDirectoryNearPoint,
  readDirectoryNearRadius,
  type DirectoryBrowseSearch,
  type DirectorySort,
} from "@/lib/directory/public-search"
import { focusRing } from "@/lib/layout/focus-ring"
import { useSearchBoxText } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"
import { findDirectoryPlace } from "@/lib/api/directory/public"

/**
 * The controls above the browse list: a search box, the category chips and the
 * order.
 *
 * All three write to the address rather than to memory, so a filtered list can
 * be sent to somebody, kept through a refresh, and returned to with Back after
 * opening a listing. The search box keeps what is being typed locally and only
 * puts it in the address once typing pauses — without that, every keystroke
 * would be a navigation and a fetch.
 */
export function DirectoryToolbar({
  current,
  sort,
  categories,
  onSearchChange,
  onSortChange,
  onNearChange,
  onRadiusChange,
  onNearClear,
  onClearAll,
}: {
  /** The address as it stands, so a chip can keep everything it is not changing. */
  current: DirectoryBrowseSearch
  sort: DirectorySort
  categories: PublicCategory[]
  onSearchChange: (value: string) => void
  onSortChange: (value: DirectorySort) => void
  onNearChange: (near: string, place: string, radius: number) => void
  onRadiusChange: (radius: number) => void
  onNearClear: () => void
  /** Back to the plain browse page: search, category and location all dropped. */
  onClearAll: () => void
}) {
  // The shell's own search-box behaviour, not a second copy of it: the box
  // keeps what is being typed, the address catches up once typing pauses, and
  // Back or a pasted link puts the box back in step.
  const [text, setText] = useSearchBoxText(current.q ?? "", onSearchChange)
  const [place, setPlace] = React.useState("")
  const [locationMessage, setLocationMessage] = React.useState("")
  const [searchingPlace, setSearchingPlace] = React.useState(false)
  const [locating, setLocating] = React.useState(false)
  const radius =
    readDirectoryNearRadius(current.radius) ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM
  const nearActive = Boolean(current.near)
  const anythingApplied = Boolean(current.q || current.category || current.near)

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "This browser cannot share your location. Enter a town, city, or postcode instead."
      )
      return
    }
    setLocationMessage("")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onNearChange(
          formatDirectoryNearPoint(position.coords),
          "your location",
          radius
        )
      },
      (error) => {
        setLocating(false)
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location sharing is off. Turn it on in your browser settings, or enter a town, city, or postcode instead."
            : "Your location is unavailable. Enter a town, city, or postcode instead."
        )
      },
      { timeout: 10_000, maximumAge: 300_000 }
    )
  }

  const searchPlace = async () => {
    setLocationMessage("")
    setSearchingPlace(true)
    try {
      const result = await findDirectoryPlace(place)
      if (!result.place) {
        setLocationMessage(
          result.error ?? "We could not look up that place. Try again."
        )
        return
      }
      setPlace("")
      onNearChange(
        formatDirectoryNearPoint(result.place),
        result.place.label,
        radius
      )
    } catch {
      setLocationMessage("We could not look up that place. Try again.")
    } finally {
      setSearchingPlace(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search listings"
          aria-label="Search listings"
          className="sm:max-w-xs"
        />
        {/* `shrink-0` because the trigger is only as wide as its own words —
            without it the row squeezes it down to the arrow alone. */}
        <div className="shrink-0 sm:ml-auto">
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as DirectorySort)}
          >
            <SelectTrigger aria-label="Order listings by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTORY_SORTS.filter(
                (option) => option !== "distance" || nearActive
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {DIRECTORY_SORT_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            void searchPlace()
          }}
        >
          <div className="grid gap-1">
            <label htmlFor="directory-place" className="text-sm font-medium">
              Near
            </label>
            <Input
              id="directory-place"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Town, city, or postcode"
              className="sm:w-56"
            />
          </div>
          <Button type="submit" variant="outline" disabled={searchingPlace}>
            Search place
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? <Loader2Icon className="animate-spin" /> : null}
          Use my location
        </Button>
        <div className="grid gap-1">
          <label htmlFor="directory-radius" className="text-sm font-medium">
            Within
          </label>
          <Select
            value={String(radius)}
            onValueChange={(value) => onRadiusChange(Number(value))}
          >
            <SelectTrigger id="directory-radius">
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
        </div>
        {nearActive ? (
          <Button type="button" variant="ghost" onClick={onNearClear}>
            Clear location
          </Button>
        ) : null}
        {/* One way back to the whole directory. Without it the only route was
            emptying the search box by hand, which on a phone means finding the
            box again first. Absent on a clean page, because there is nothing
            to clear. */}
        {anythingApplied ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setText("")
              onClearAll()
            }}
          >
            Clear search
          </Button>
        ) : null}
      </div>
      {locationMessage ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {locationMessage}
        </p>
      ) : null}
      {nearActive ? (
        <p className="text-sm text-muted-foreground">
          Showing nearest listings within {radius} km of{" "}
          {current.place ?? "your location"}. Listings without a map location
          follow the nearby results.
        </p>
      ) : null}

      {categories.length ? (
        <CategoryChips categories={categories} current={current} />
      ) : null}
    </div>
  )
}

/**
 * One chip per category with something published in it, plus an "All" chip.
 *
 * Real links rather than buttons, so a chip can be opened in a new tab and a
 * search engine can follow it — a filtered directory is a page in its own
 * right, not a state the browser happens to be in.
 */
function CategoryChips({
  categories,
  current,
}: {
  categories: PublicCategory[]
  current: DirectoryBrowseSearch
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      <li>
        <Chip current={current} category={undefined} active={!current.category}>
          All
        </Chip>
      </li>
      {categories.map((row) => (
        <li key={row.id}>
          <Chip
            current={current}
            category={row.slug}
            active={row.slug === current.category}
          >
            {row.name}
            <span className="ml-1 opacity-70">{row.listingCount}</span>
          </Chip>
        </li>
      ))}
    </ul>
  )
}

function Chip({
  current,
  category,
  active,
  children,
}: {
  current: DirectoryBrowseSearch
  category: string | undefined
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to="/directory"
      // The search and the order are kept — picking a category should not
      // silently throw away what somebody typed — but the page number goes,
      // because page 4 of the old list is nowhere in the new one.
      search={{
        q: current.q,
        sort: current.sort,
        category,
        near: current.near,
        place: current.place,
        radius: current.radius,
      }}
      aria-current={active ? "page" : undefined}
      className={cn(
        // A plain `border` with no colour named, so the Divider lines setting
        // reaches these the way it reaches every other line in the app.
        "inline-flex h-8 items-center rounded-md border px-3 text-sm",
        focusRing,
        active
          ? // Filled *and* bolder: the state has to survive somebody who
            // cannot tell the two backgrounds apart.
            "bg-primary font-medium text-primary-foreground"
          : "bg-card text-foreground hover:bg-accent"
      )}
    >
      {children}
    </Link>
  )
}
