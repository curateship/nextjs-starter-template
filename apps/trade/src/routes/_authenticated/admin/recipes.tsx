import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { RecipesListPage } from "@/components/recipes/recipes-list-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getRecipeLoadErrorMessage,
  loadRecipesPage,
} from "@/lib/api/trade/recipes"

export const Route = createFileRoute("/_authenticated/admin/recipes")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Recipes") }],
  }),
  gcTime: 0,
  loader: () => loadRecipesPage(),
  component: AdminRecipesRoute,
  errorComponent: routeErrorComponent(getRecipeLoadErrorMessage),
})

function AdminRecipesRoute() {
  useTradePageTitle("Recipes")
  return <RecipesListPage initial={Route.useLoaderData()} />
}
