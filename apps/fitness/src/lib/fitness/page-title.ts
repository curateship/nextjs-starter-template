import { resolveAppName } from "@/lib/branding"

/**
 * A Fitness page's browser tab: "Programs · Fitness". The root route builds
 * every tab title but only knows the shell's own pages, so each Fitness route
 * names itself here. The app name comes from the root route's branding.
 */
export function pageTitleHead(page: string, matches: ReadonlyArray<{ loaderData?: unknown }>) {
  const root = matches[0]?.loaderData as { appName?: string | null } | undefined
  return { meta: [{ title: `${page} · ${resolveAppName(root?.appName)}` }] }
}
