import * as React from "react"

import { browserTimeZone } from "@/lib/project/days"

export type ZoneRow = { value: string; label: string }

/** "America/Toronto" for "America/Toronto", with spaces for underscores. */
export const zoneLabel = (zone: string) => zone.replaceAll("_", " ")

const NO_PINNED: ZoneRow[] = []

/**
 * Every zone for a time zone list: any pinned rows first, then the saved
 * zone, the browser's and the team's, then the rest. Shared by the time zone
 * picker and My settings' Time zone row (`ZoneChoices`).
 */
export function useZoneRows(value: string, pinned: ZoneRow[] = NO_PINNED, teamZone?: string) {
  return React.useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"]
    const first = [browserTimeZone(), teamZone].filter((zone): zone is string => Boolean(zone))
    const pinnedValues = new Set(pinned.map((row) => row.value))
    const saved = pinnedValues.has(value) || all.includes(value) ? [] : [value]
    const zones = [...new Set([...saved, ...first, ...all])]
    return [...pinned, ...zones.map((zone) => ({ value: zone, label: zoneLabel(zone) }))]
  }, [pinned, teamZone, value])
}
