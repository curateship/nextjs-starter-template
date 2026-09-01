import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 } }),
}))

vi.mock("@/lib/api/trade/recipes", () => ({
  createRecipe: vi.fn(),
  deleteRecipes: vi.fn(),
  duplicateRecipe: vi.fn(),
  getRecipeErrorMessage: (error: unknown) => String(error),
  renameRecipe: vi.fn(),
  toRecipeListItem: (recipe: unknown) => recipe,
}))

const { RecipesListPage } = await import("./recipes-list-page")

describe("the Recipes dashboard", () => {
  it("shows recipe steps without automation-only controls", () => {
    const html = renderToStaticMarkup(
      <RecipesListPage
        initial={{
          recipes: [
            {
              id: "recipe-1",
              name: "Buy the dip",
              summary: "3 steps",
              isValid: true,
              nodeCount: 3,
              updated_at: "2026-09-01T12:00:00.000Z",
            },
          ],
        }}
      />
    )

    expect(html).toContain("Recipes")
    expect(html).toContain("Buy the dip")
    expect(html).toContain("3 steps")
    expect(html).toContain("New recipe")
    expect(html).not.toContain("Trigger")
    expect(html).not.toContain("Templates")
    expect(html).not.toContain("Live")
  })
})
