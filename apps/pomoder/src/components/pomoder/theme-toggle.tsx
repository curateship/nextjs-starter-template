import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"

// An animated day/night switch: the thumb slides across a sky that shifts from
// a starry night to a warm dawn, and the moon crossfades into a sun.
export function ThemeToggle({
  showLabel = false,
}: {
  showLabel?: boolean
}) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === "light"
  const next = isLight ? "dark" : "light"

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          <Moon className="theme-icon-moon" aria-hidden="true" />
          <Sun className="theme-icon-sun" aria-hidden="true" />
        </span>
      </span>
      {showLabel ? (
        <span className="theme-toggle-text">{isLight ? "Light" : "Dark"}</span>
      ) : null}
    </button>
  )
}
