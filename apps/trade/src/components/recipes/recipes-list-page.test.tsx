// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { duplicateRecipe } from "@/lib/api/trade/recipes"
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

it("keeps duplicate requests independent and releases only the completed row", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const recipes = ["A", "B"].map((id) => ({
    id,
    name: id,
    summary: "3 steps",
    isValid: true,
    nodeCount: 3,
    updated_at: "2026-09-01T12:00:00.000Z",
  }))
  let finishA!: (value: unknown) => void
  let finishB!: (value: unknown) => void
  vi.mocked(duplicateRecipe).mockImplementation(
    (id) =>
      new Promise((resolve) => {
        if (id === "A") finishA = resolve as typeof finishA
        else finishB = resolve as typeof finishB
      })
  )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const button = (id: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="Duplicate ${id}"]`)!
  try {
    await act(async () =>
      root.render(<RecipesListPage initial={{ recipes }} />)
    )
    await act(async () => button("A").click())
    expect(button("A").disabled).toBe(true)
    expect(button("B").disabled).toBe(false)
    await act(async () => button("B").click())
    expect(button("B").disabled).toBe(true)
    await act(async () =>
      finishA({ ...recipes[0], id: "copy-a", name: "A copy" })
    )
    expect(button("A").disabled).toBe(false)
    expect(button("B").disabled).toBe(true)
    await act(async () =>
      finishB({ ...recipes[1], id: "copy-b", name: "B copy" })
    )
    expect(button("B").disabled).toBe(false)
    expect(host.textContent).toContain("B copy")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
