import * as React from "react"

/**
 * The Sounds button on the editor's left menu: Music, Sounds and Voices as
 * three tabs in one panel's header, where the panel's title used to be.
 * They were three buttons of their own until 4 Nov 2026 (Tyler: "Combine
 * music, voices and sound into one Rail tab with just "Sounds"").
 *
 * The tab ids are the old panels' ids, so nothing that names one changes.
 */
// Voices first (Tyler, 4 Nov 2026: "put voices as first tab").
export const SOUNDS_TABS = [
  { id: "voiceovers", label: "Voices" },
  { id: "music", label: "Music" },
  { id: "sounds", label: "Sounds" },
] as const

export type SoundsTab = (typeof SOUNDS_TABS)[number]["id"]

export function isSoundsTab(value: string): value is SoundsTab {
  return SOUNDS_TABS.some((tab) => tab.id === value)
}

/** Which tab the Sounds panel is on, for the picker its header shows when narrow. */
export const SoundsTabContext = React.createContext<{
  tab: SoundsTab
  onTabChange: (tab: SoundsTab) => void
} | null>(null)
