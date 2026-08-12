import { rootRouteId, useLoaderData } from "@tanstack/react-router"
import type { PublicNavigationLink } from "@/lib/pages/public-navigation"

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

/** The site's primary colour on public pages, or blank for the shell default. */
export function usePublicAccentColor() {
  return useLoaderData({
    from: rootRouteId,
    select: (data) => data.accentColor?.trim() ?? "",
  })
}

export function usePublicNavigation(): PublicNavigationLink[] {
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
