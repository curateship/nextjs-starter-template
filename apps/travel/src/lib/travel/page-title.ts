import { resolveAppName } from "@/lib/branding"

/**
 * A Travel page's browser tab: "Tokyo · Travel". The root route only knows the
 * shell's own pages, so each Travel route names itself here, the way Project's
 * routes do.
 */
export function pageTitleHead(page: string, matches: ReadonlyArray<{ loaderData?: unknown }>) {
  const root = matches[0]?.loaderData as { appName?: string | null } | undefined
  return { meta: [{ title: `${page} · ${resolveAppName(root?.appName)}` }] }
}
