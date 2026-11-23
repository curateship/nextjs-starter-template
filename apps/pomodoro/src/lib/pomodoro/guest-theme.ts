import * as React from "react"

import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"

/**
 * Where a member's light, dark or system choice waits while this browser is
 * signed out. The theme itself lives under the shell's "theme" key, which a
 * guest's forced dark overwrites, so without this a member who logged out and
 * back in would come back dark.
 */
const SIGNED_IN_THEME_KEY = "pomoder-signed-in-theme"

const THEMES = ["light", "dark", "system"] as const

function isTheme(value: string | null): value is (typeof THEMES)[number] {
  return THEMES.some((theme) => theme === value)
}

/**
 * Guests always get dark mode. Tyler, 10 Oct 2026: "The light and dark goes
 * into user dropdown and guess always get dark mode." A guest has no switch,
 * and the shell's "d" key cannot turn them light either, because any change
 * away from dark while signed out is put straight back.
 *
 * A signed-in member's choice is set aside when they sign out and given back
 * when they sign in again. A member with no choice yet starts dark, the
 * product's resting look.
 *
 * `signedIn` is undefined while the page is still asking who is signed in,
 * and then nothing changes, so a member is never briefly treated as a guest.
 * It is also undefined when an admin fixed the site to light or dark, which
 * the shell's provider already applies over anything stored here.
 */
export function useGuestsStayDark(signedIn: boolean | undefined) {
  const { theme, setTheme } = useTheme()

  React.useEffect(() => {
    if (signedIn === undefined) return
    try {
      if (signedIn) {
        const saved = localStorage.getItem(SIGNED_IN_THEME_KEY)
        localStorage.removeItem(SIGNED_IN_THEME_KEY)
        if (isTheme(saved)) setTheme(saved)
        else if (localStorage.getItem("theme") === null) setTheme("dark")
        return
      }
      const stored = localStorage.getItem("theme")
      if (
        isTheme(stored) &&
        stored !== "dark" &&
        localStorage.getItem(SIGNED_IN_THEME_KEY) === null
      )
        localStorage.setItem(SIGNED_IN_THEME_KEY, stored)
      setTheme("dark")
    } catch {
      // Blocked storage keeps whatever the provider resolved.
    }
  }, [signedIn, setTheme])

  // A guest pressing the shell's "d" key, or another tab writing the theme.
  React.useEffect(() => {
    if (signedIn !== false || theme === "dark") return
    try {
      setTheme("dark")
    } catch {
      // Blocked storage keeps whatever the provider resolved.
    }
  }, [signedIn, theme, setTheme])
}
