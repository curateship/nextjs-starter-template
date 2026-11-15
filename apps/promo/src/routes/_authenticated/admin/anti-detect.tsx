import { createFileRoute } from "@tanstack/react-router"

import { AntiDetectDashboard } from "@/components/anti-detect/anti-detect-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readAntiDetectSearch } from "@/lib/anti-detect/search"
import { getAntiDetectErrorMessage } from "@/lib/api/anti-detect"
import { loadBansPage } from "@/lib/api/bans"
import { loadProfilesPage } from "@/lib/api/browser/profiles"
import { loadProxies } from "@/lib/api/browser/proxies"
import { loadPhonesPage } from "@/lib/api/phones/phones"
import { loadProjectRows } from "@/lib/api/social/projects"
import { loadRedditAccounts } from "@/lib/api/social/reddit-accounts"

/**
 * The Anti Detect dashboard (`workspace/docs/anti-detect-dashboard.md`),
 * where Anti Detect in the left menu leads: Overview, Profiles, Proxies,
 * Phones and Bans as sections of one three-panel dashboard (Tyler, 12 Nov
 * 2026). The section, the project picked, the filters and the open row live
 * in the address (`readAntiDetectSearch`). A rack's own page is still
 * gone; Phones lists every phone, filtered by rack.
 *
 * Every section's rows are read here at once, so each row of the Dashboards
 * block has its count from the start and a switch draws at once. The
 * accounts in use say what each project's accounts run on, for the Projects
 * block.
 */
export const Route = createFileRoute("/_authenticated/admin/anti-detect")({
  validateSearch: (search: Record<string, unknown>) => readAntiDetectSearch(search),
  loader: async () => {
    const [profiles, proxies, phones, bans, projects, accounts] = await Promise.all([
      loadProfilesPage(),
      loadProxies(),
      loadPhonesPage(),
      loadBansPage(),
      loadProjectRows(),
      loadRedditAccounts(false),
    ])
    return { profiles, proxies, phones, bans, projects, accounts: accounts.accounts }
  },
  errorComponent: routeErrorComponent(getAntiDetectErrorMessage),
  component: AntiDetectRoute,
})

function AntiDetectRoute() {
  return <AntiDetectDashboard data={Route.useLoaderData()} search={Route.useSearch()} />
}
