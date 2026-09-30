import {
  createFileRoute,
  Link,
  useParams,
  useRouter,
} from "@tanstack/react-router"
import * as React from "react"

import {
  tradePageTitle,
  useTradePageTitle,
  type TitleMatch,
} from "@/app/page-title"
import { AddCreatorDialog } from "@/components/social/add-creator-dialog"
import { SocialDashboardPage } from "@/components/social/social-dashboard-page"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { loadRememberedChartView } from "@/lib/api/trade/chart-view"
import {
  getSocialErrorMessage,
  loadSocialDashboardData,
  type SocialDashboard,
} from "@/lib/api/trade/social"
import {
  emptyTradePanelLayouts,
  type TradePanelLayouts,
} from "@/lib/trade/panel-layout"

/**
 * What the loader hands the screen. Named rather than inferred, so the
 * route's type is not worked out from the component that reads it.
 */
type SocialRouteData = {
  dashboard: SocialDashboard
  panelLayouts: TradePanelLayouts
}

/**
 * One creator's dashboard, at `/social/<handle>`.
 *
 * Named `social_.$handle` for the same reason `flow-runs_.$runId` is: the list
 * of every creator and this screen are siblings rather than one nested inside
 * the other.
 *
 * The handle is the address, so a reload reopens the same creator and the
 * address can be pasted to somebody else. The loader reads the creator, their
 * figures and the newest page of posts in one trip, because
 * `workspace/docs/rules/instant-first.md` says the screen answers from what
 * the app already knows before anything else runs.
 */
export const Route = createFileRoute("/_authenticated/social_/$handle")({
  // The argument is named rather than inferred: leaving it to inference on a
  // route with a `$param` makes this route's own loader type circular, and
  // `useLoaderData` then answers `undefined`.
  head: ({ matches }: { matches: readonly TitleMatch[] }) => ({
    meta: [{ title: tradePageTitle(matches, "Creator") }],
  }),
  // Dropped on close, so opening a different creator never draws the last
  // one's posts while the new answer is on its way.
  gcTime: 0,
  loader: async ({ params }): Promise<SocialRouteData> => {
    const [dashboard, prefs] = await Promise.all([
      loadSocialDashboardData(params.handle),
      loadRememberedChartView().catch(() => null),
    ])
    return {
      dashboard,
      panelLayouts: prefs?.panelLayouts ?? emptyTradePanelLayouts(),
    }
  },
  component: SocialRoute,
  errorComponent: SocialRouteError,
})

function SocialRoute() {
  const { dashboard, panelLayouts } = Route.useLoaderData()
  useTradePageTitle(`@${dashboard.creator.handle}`)

  return (
    <SocialDashboardPage
      initial={dashboard}
      initialPanelLayouts={panelLayouts}
    />
  )
}

/**
 * A handle this member does not track gets a real sentence and the one action
 * that fixes it, rather than a crash or a bare retry. Adding it here lands on
 * the same address, already tracking.
 */
function SocialRouteError({ error }: { error: unknown }) {
  const router = useRouter()
  // Read by address rather than through `Route`, because naming the route
  // object inside its own error component makes the loader's type circular
  // and TypeScript gives up on it.
  const { handle } = useParams({ from: "/_authenticated/social_/$handle" })
  const [adding, setAdding] = React.useState(false)
  const untracked =
    error instanceof Error &&
    error.message.includes("SOCIAL_CREATOR_NOT_TRACKED")

  // A handle nobody tracks is not a failure, so it raises no error toast. It
  // is a page with one thing missing, and the button supplies it.
  if (!untracked) {
    return (
      <Card size="sm">
        <ErrorRow
          className="min-h-32"
          message={getSocialErrorMessage(error)}
          onRetry={() => void router.invalidate()}
        />
      </Card>
    )
  }

  return (
    <Card size="sm">
      <div className="grid min-h-32 justify-items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          You are not tracking @{handle} yet. Add the account and its posts will
          show up here.
        </p>
        <Button type="button" onClick={() => setAdding(true)}>
          Add @{handle}
        </Button>
        <Link
          to="/social"
          className={cn(
            "rounded-md text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground",
            focusRing
          )}
        >
          See every creator you track
        </Link>
      </div>
      <AddCreatorDialog
        open={adding}
        initialValue={handle}
        onOpenChange={setAdding}
        onAdded={() => {
          setAdding(false)
          void router.invalidate()
        }}
      />
    </Card>
  )
}
