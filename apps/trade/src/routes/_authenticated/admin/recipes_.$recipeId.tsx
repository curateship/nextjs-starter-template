import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { RecipeEditor } from "@/components/recipes/recipe-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getRecipe,
  getRecipeLoadErrorMessage,
  type RecipeDetail,
} from "@/lib/api/trade/recipes"

type RecipeEditorSearch = { node?: string }

function readRecipeEditorSearch(
  search: Record<string, unknown>
): RecipeEditorSearch {
  return {
    node:
      typeof search.node === "string" &&
      search.node.length > 0 &&
      search.node.length <= 64
        ? search.node
        : undefined,
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/recipes_/$recipeId"
)({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Recipe") }],
  }),
  gcTime: 0,
  validateSearch: readRecipeEditorSearch,
  loader: async ({ params }): Promise<RecipeDetail> => {
    const recipe = await getRecipe(params.recipeId)
    if (!recipe) throw new Error("NOT_FOUND")
    return recipe
  },
  component: AdminRecipeEditorRoute,
  errorComponent: routeErrorComponent(getRecipeLoadErrorMessage),
})

function AdminRecipeEditorRoute() {
  const recipe = Route.useLoaderData() as RecipeDetail
  const { node } = Route.useSearch()
  useTradePageTitle(recipe.name)
  return <RecipeEditor key={recipe.id} initial={recipe} openNode={node} />
}
