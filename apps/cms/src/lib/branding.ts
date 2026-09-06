import * as React from "react"
import { rootRouteId, useLoaderData } from "@tanstack/react-router"
import type {
  PublicNavigationItem,
  PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import {
  normalizePublicHeader,
  type PublicHeader,
} from "@/lib/pages/public-header"
import {
  normalizePublicSystemCopy,
  type PublicSystemCopy,
} from "@/lib/pages/public-metadata"
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
 * The logo drawn instead of the one above while the visitor is in dark mode, or
 * "" when none is set. A separate hook rather than an object beside the light
 * one so each stays a plain string: `useLoaderData` compares what `select`
 * returns, and a fresh object every time compares as changed every time.
 *
 * Which of the two is actually shown is decided in CSS, not here — see
 * `BrandLogo`.
 */
export function useBrandLogoDark() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.logoDark?.trim() ?? "",
  })
}

export function usePublicNavigation(): PublicNavigationItem[] {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicNavigation ?? [],
  })
}

export function usePublicFooter(): PublicNavigationLink[] {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicFooter ?? [],
  })
}

export function usePublicFooterCopyright() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicFooterCopyright ?? "",
  })
}

/** App-wide placement and sizing for the full signed-out header. */
export function usePublicHeader(): PublicHeader {
  const saved = useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicHeader,
  })

  return React.useMemo(() => normalizePublicHeader(saved), [saved])
}

/** Whether the site's public search page may be offered to visitors. */
export function usePublicSearchEnabled() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicSearchEnabled ?? true,
  })
}

/** Copy for the public fallback pages, carried by the resilient root loader. */
export function usePublicSystemCopy(): PublicSystemCopy {
  const saved = useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicSystemCopy,
  })

  return React.useMemo(() => normalizePublicSystemCopy(saved), [saved])
}

/** The app's public styling, normalized again at the paint boundary. */
export function usePublicTheme(): PublicTheme {
  const saved = useLoaderData({
    from: rootRouteId,
    select: (data) => data.publicTheme,
  })

  return React.useMemo(
    () => (saved ? normalizePublicTheme(saved) : createDefaultPublicTheme()),
    [saved]
  )
}
