import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { findSkyCity, getSkyCityErrorMessage } from "@/lib/api/notes/sky-city"
import { sunTimes, type SkyCity } from "@/lib/notes/sky-city"
import { showErrorToast } from "@/lib/toast/error-toast"

const timeOf = (at: Date) => at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * Settings → General → Sky city (Tyler, 8 Nov 2026: "it shows the sun and its
 * almost night here"): the city whose real sunrise and sunset a page cover's
 * sky follows. Typed and left, it is looked up once; the line under it says
 * what was found and today's sun times there. Emptied, the sky goes back to
 * fixed hours: night from 6 PM.
 */
export function SkyCityField({ city, onChange }: { city: SkyCity | null; onChange: (city: SkyCity | null) => void }) {
  const [text, setText] = React.useState(city?.label ?? "")
  const [busy, setBusy] = React.useState(false)
  const shown = city?.label ?? ""

  // A city saved elsewhere, or found, shows as its full name.
  const [lastShown, setLastShown] = React.useState(shown)
  if (shown !== lastShown) {
    setLastShown(shown)
    setText(shown)
  }

  const commit = async () => {
    const name = text.trim()
    if (name === shown) return
    if (!name) {
      onChange(null)
      return
    }
    setBusy(true)
    try {
      const found = await findSkyCity(name)
      if (!found) {
        showErrorToast(`No city called "${name}" was found. Try its full name, or add the country.`)
        setText(shown)
        return
      }
      onChange(found)
    } catch (error) {
      showErrorToast(getSkyCityErrorMessage(error))
      setText(shown)
    } finally {
      setBusy(false)
    }
  }

  const today = city ? sunTimes(new Date(), city.latitude, city.longitude) : null
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="sky-city"
        hint="A page cover set to Sky follows this city's real sunrise and sunset, so its evenings come earlier in winter. Empty uses fixed hours: night from 6 PM on each viewer's own clock."
      >
        Sky city
      </FieldLabel>
      <Input
        id="sky-city"
        value={text}
        disabled={busy}
        placeholder="Toronto"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      <p className="text-xs text-muted-foreground">
        {busy
          ? "Looking it up…"
          : city && today?.sunrise && today.sunset
            ? `${city.label}. Today the sun rises at ${timeOf(today.sunrise)} and sets at ${timeOf(today.sunset)}, your time.`
            : city
              ? `${city.label}. The sun does not ${today?.up ? "set" : "rise"} there today.`
              : "No city: fixed hours."}
      </p>
    </div>
  )
}
