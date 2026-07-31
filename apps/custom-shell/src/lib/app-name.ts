import { rootRouteId, useLoaderData } from "@tanstack/react-router"

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
