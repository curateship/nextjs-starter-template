import type { ThemeMode } from "@/components/kibo-ui/theme-switcher"

import { APP_THEME_STORAGE_KEY, PINNED_SKILLS_STORAGE_KEY } from "@/app/constants"

function isAppTheme(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

export function loadThemeSetting(): ThemeMode {
  const value = localStorage.getItem(APP_THEME_STORAGE_KEY)
  return isAppTheme(value) ? value : "system"
}

export function resolveIsDarkTheme(theme: ThemeMode) {
  return (
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  )
}

export function applyThemePreference(theme: ThemeMode, onResolvedThemeChange: (isDark: boolean) => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const updateThemeClass = () => {
    const isDark = theme === "dark" || (theme === "system" && media.matches)
    document.documentElement.classList.toggle("dark", isDark)
    onResolvedThemeChange(isDark)
  }

  updateThemeClass()
  if (theme !== "system") return

  media.addEventListener("change", updateThemeClass)
  return () => media.removeEventListener("change", updateThemeClass)
}

export function loadPinnedSkillSettings(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_SKILLS_STORAGE_KEY) ?? "[]")
    if (Array.isArray(value)) return uniqueStrings(value)
    if (value && typeof value === "object") {
      return uniqueStrings(Object.values(value).flat())
    }
    return []
  } catch {
    return []
  }
}

function uniqueStrings(values: unknown[]) {
  const result: string[] = []
  for (const value of values) {
    if (typeof value === "string" && value && !result.includes(value)) {
      result.push(value)
    }
  }
  return result
}
