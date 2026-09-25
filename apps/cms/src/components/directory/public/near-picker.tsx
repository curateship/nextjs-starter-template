import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useNearPlace } from "@/components/directory/public/use-near-place"
import { DIRECTORY_NEAR_RADII_KM } from "@/lib/directory/public-search"

/**
 * Near a place and Within a distance: a typed town or postcode, the browser's
 * own location, and the distance picker. The directory's listings and the
 * Events page both use this one, so the two never differ on how a place is
 * found or when Within can be used.
 *
 * Within stays disabled until a place is active, and says why. A pick made
 * before there is anywhere to measure from would do nothing, and the visitor
 * would only find out later from results that look wrong.
 *
 * Renders a row and, under it, any message about finding the place, so the
 * page around it keeps its own gaps.
 */
export function NearPicker({
  idPrefix,
  near,
  radius,
  onNearChange,
  onRadiusChange,
  onNearClear,
  children,
}: {
  /** Names the two fields, like "directory-place" and "directory-radius". */
  idPrefix: string
  /** The active point from the address, or nothing before a place is picked. */
  near: string | undefined
  radius: number
  onNearChange: (near: string, place: string, radius: number) => void
  onRadiusChange: (radius: number) => void
  onNearClear: () => void
  /** Buttons that end the row, after "Clear location". */
  children?: React.ReactNode
}) {
  const picker = useNearPlace({ radius, onNearChange })
  const nearActive = Boolean(near)
  const placeId = `${idPrefix}-place`
  const radiusId = `${idPrefix}-radius`

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            void picker.searchPlace()
          }}
        >
          <div className="grid gap-1">
            <label htmlFor={placeId} className="text-sm font-medium">
              Near
            </label>
            <Input
              id={placeId}
              value={picker.place}
              onChange={(event) => picker.setPlace(event.target.value)}
              placeholder="Town, city, or postcode"
              className="sm:w-56"
            />
          </div>
          <Button type="submit" variant="outline" disabled={picker.searching}>
            Search place
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          onClick={picker.useMyLocation}
          disabled={picker.locating}
        >
          {picker.locating ? <Loader2Icon className="animate-spin" /> : null}
          Use my location
        </Button>
        <div className="grid gap-1">
          <label htmlFor={radiusId} className="text-sm font-medium">
            Within
          </label>
          <DisabledReason
            disabled={!nearActive}
            reason="Pick a location first."
          >
            <Select
              disabled={!nearActive}
              value={String(radius)}
              onValueChange={(value) => onRadiusChange(Number(value))}
            >
              <SelectTrigger id={radiusId}>
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
        {nearActive ? (
          <Button type="button" variant="ghost" onClick={onNearClear}>
            Clear location
          </Button>
        ) : null}
        {children}
      </div>
      {picker.message ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {picker.message}
        </p>
      ) : null}
    </>
  )
}
