import * as React from "react"
import { rootRouteId, useLoaderData } from "@tanstack/react-router"

import {
  createDefaultPublicTheme,
  normalizePublicTheme,
  type PublicTheme,
} from "@/lib/public-theme"

/** Shown wherever the app name appears while nobody has set one. */
export const DEFAULT_APP_NAME = "Custom Shell"

/**
 * The name to display: the saved one, or the default when it is blank. Every
 * place that shows the app name goes through here so a blank setting never
 * paints an empty tab title or an empty heading.
 */
export function resolveAppName(appName: string | null | undefined) {
  return appName?.trim() || DEFAULT_APP_NAME
}

/**
 * The app name for the current page. It is an app-wide global loaded by the
 * root route rather than by the shell, so signed-out pages (sign in, register,
 * pricing) can read it before there is a session or a workspace.
 */
export function useAppName() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => resolveAppName(data.appName),
  })
}

/**
 * The brand logo for the current page, or "" when no logo is set. Loaded by the
 * root route alongside the app name for the same reason: the pages that show it
 * are drawn before anybody has signed in.
 */
export function useBrandLogo() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.logo?.trim() ?? "",
  })
}

/**
 * The look every public page wears, from the same root-route load as the app
 * name and logo. Normalized again here rather than trusted: this is the value
 * that gets painted, and the loader's data can also arrive from a cached page
 * that was serialized before a field existed.
 *
 * Turn it into CSS variables with `publicThemeStyle` (`lib/public-theme.ts`) —
 * `__root.tsx` puts those on `<body>` for every page outside `_authenticated`,
 * which is why a public page never has to apply the theme itself.
 */
export function usePublicTheme(): PublicTheme {
  const saved = useLoaderData({
    from: rootRouteId,
    select: (data) => data?.publicTheme,
  })
  // Memoized because normalizing builds a fresh object, and this one is read on
  // every render of every public page.
  return React.useMemo(
    () => (saved ? normalizePublicTheme(saved) : createDefaultPublicTheme()),
    [saved]
  )
}
