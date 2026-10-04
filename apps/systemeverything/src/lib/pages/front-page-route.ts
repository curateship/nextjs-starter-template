import type { CatchAllPage } from "@/lib/app-options"

export type FrontPageRouteData =
  | { source: "app"; data: unknown }
  | { source: "landing"; data: unknown }

/** Gives an app-owned catch-all first refusal on `/` before the shell loads. */
export async function loadFrontPageRoute(
  appPage: CatchAllPage | null,
  loadLandingPage: () => unknown | Promise<unknown>
): Promise<FrontPageRouteData> {
  const appData = appPage
    ? ((await appPage.loader({ path: "/" })) ?? null)
    : null
  if (appData !== null) return { source: "app", data: appData }

  return {
    source: "landing",
    data: (await loadLandingPage()) ?? null,
  }
}
