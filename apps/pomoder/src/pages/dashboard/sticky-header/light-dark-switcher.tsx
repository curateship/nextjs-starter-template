import * as React from "react"

import { loadThemePreference, saveThemePreference } from "@/lib/api/theme"

// Two themes only — no "follow system" option. Dark is the product's identity
// and the default; light is a first-class, equally calm alternative.
export type Theme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
  authenticated?: boolean
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const THEME_VALUES: Theme[] = ["dark", "light"]

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  return value !== null && THEME_VALUES.includes(value as Theme)
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.nonce =
    document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
      ?.content || ""
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

export function ThemeProvider({
  children,
  authenticated = false,
  defaultTheme = "dark",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme
    }

    const storedTheme = localStorage.getItem(storageKey)
    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(nextTheme)

      const themeColor = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]'
      )
      if (themeColor) {
        themeColor.content = nextTheme === "light" ? "#f3efe8" : "#0b0b0e"
      }

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [disableTransitionOnChange]
  )

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
      if (authenticated) {
        // Write-through so the choice syncs across the user's devices; the
        // local value already applied the theme without waiting on the network.
        void saveThemePreference(nextTheme).catch(() => undefined)
      }
    },
    [authenticated, storageKey]
  )

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  React.useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  // For signed-in users, reconcile with the saved preference once on mount so a
  // choice made on another device wins. A null result (never saved) leaves the
  // local/guest choice untouched.
  React.useEffect(() => {
    if (!authenticated) {
      return
    }

    let cancelled = false
    void loadThemePreference()
      .then((saved) => {
        if (cancelled || !isTheme(saved)) {
          return
        }
        localStorage.setItem(storageKey, saved)
        setThemeState(saved)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [authenticated, storageKey])

  // Keep the theme in sync across tabs.
  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return
      }
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
