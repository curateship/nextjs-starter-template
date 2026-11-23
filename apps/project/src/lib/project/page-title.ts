import { resolveAppName } from "@/lib/branding"

/**
 * A Project page's browser tab: "My dashboard · Project". The root route
 * builds every tab title, but it only knows the shell's own pages, so it
 * writes "Page" for these. A route's own `head` wins over the root's, because
 * the router keeps the deepest route's title, so each Project route names
 * itself here. The app name comes from the root route's branding, the same
 * place the root reads it.
 */
export function pageTitleHead(page: string, matches: ReadonlyArray<{ loaderData?: unknown }>) {
  const root = matches[0]?.loaderData as { appName?: string | null } | undefined
  return { meta: [{ title: `${page} · ${resolveAppName(root?.appName)}` }] }
}
