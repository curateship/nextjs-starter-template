import * as React from "react"
import { CopyIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import type { BotsSectionProps } from "@/components/bots/bots-dashboard"
import { RecordMenu } from "@/components/bots/bots-record"
import { RecipeSavedResults } from "@/components/bots/recipe-saved-results"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { RecipeEditor } from "@/components/recipes/recipe-editor"
import { FoldingMenu } from "@/components/shared/folding-menu"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { TableCell } from "@/components/ui/table"
import {
  createRecipe,
  deleteRecipes,
  duplicateRecipe,
  getRecipeErrorMessage,
  renameRecipe,
  toRecipeListItem,
  type RecipeDetail,
  type RecipeListItem,
} from "@/lib/api/trade/recipes"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

/** What the route read for Recipes: the workspace's recipes, and the one opened on its canvas. */
export type RecipesLoaded = {
  view: "recipes"
  recipes: RecipeListItem[]
  opened: RecipeDetail | null
}

type Column = "name" | "status" | "steps" | "updated"

const COLUMNS = [
  { key: "name", label: "Name", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "steps", label: "Steps", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "updated", label: "Updated", column: "meta", className: "hidden @2xl:table-cell" },
] as const

/** Where a recipe's bot stands, in a few words. */
function runWords(recipe: RecipeListItem) {
  const run = recipe.run
  if (!run) return "Never run"
  if (run.status === "Stopped") return run.stoppedAt ? `Stopped ${formatDate(run.stoppedAt)}` : "Stopped"
  return run.activeCount > 1 ? `${run.status} on ${run.activeCount} wallets` : `${run.status} · ${run.walletLabel}`
}

/** Switched-on recipes first, then paused, stopping, stopped, never run. */
function runRank(recipe: RecipeListItem) {
  return ({ Running: 0, Paused: 1, Stopping: 2, Stopped: 3 })[recipe.run?.status ?? "Stopped"] + (recipe.run ? 0 : 1)
}

/**
 * Recipes on the Bots dashboard: the workspace's trading plans. The table has
 * no right panel, because a line opens its canvas at once (Tyler, 9 Nov 2026:
 * "clicking on the recipe should just go to the canvas"). Opened, the canvas
 * fills the middle and its five steps come from + Add step. The right panel
 * shows only while a step is picked, holding its settings (Tyler: "just dont
 * show the right panel until a node is clicked on"). New recipe is the
 * header's one New button, a dropdown holding the name.
 */
export function RecipesSection({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
  go,
  openElsewhere,
  onChanged,
}: BotsSectionProps & { loaded: RecipesLoaded }) {
  const [read, setRead] = React.useState({ from: loaded.recipes, recipes: loaded.recipes })
  if (read.from !== loaded.recipes) setRead({ from: loaded.recipes, recipes: loaded.recipes })
  const recipes = read.recipes
  const setRecipes = (change: (current: RecipeListItem[]) => RecipeListItem[]) =>
    setRead((was) => ({ from: was.from, recipes: change(was.recipes) }))
  const [massOn, setMassOn] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = React.useState<RecipeListItem[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [duplicating, setDuplicating] = React.useState<string | null>(null)
  const [rowMenu, setRowMenu] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  // Clicking away keeps the typed name for the next opening (UI standard, "New …").
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<Column>("status", "asc", (column) =>
    column === "updated" ? "desc" : "asc"
  )

  const query = (search.q ?? "").trim().toLowerCase()
  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return recipes
      .filter(
        (recipe) =>
          !query || recipe.name.toLowerCase().includes(query) || recipe.summary.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (sort === "status") return way * (runRank(left) - runRank(right) || left.name.localeCompare(right.name))
        if (sort === "name") return way * left.name.localeCompare(right.name)
        if (sort === "steps") return way * (left.nodeCount - right.nodeCount || left.name.localeCompare(right.name))
        return way * left.updated_at.localeCompare(right.updated_at)
      })
  }, [recipes, query, sort, direction])

  const ids = sorted.map((recipe) => recipe.id)
  const openId = search.open
  const chosen = recipes.filter((recipe) => ticked.has(recipe.id) && ids.includes(recipe.id))

  const create = async () => {
    const name = newName.trim()
    if (!name || creating) {
      if (!name) showErrorToast("Recipe name is required.")
      return
    }
    setCreating(true)
    try {
      const created = await createRecipe(name)
      setRecipes((current) => [toRecipeListItem(created), ...current])
      setNewName("")
      setNewOpen(false)
      onChanged()
      go({ view: "recipes", open: created.id, full: true }, { push: true })
    } catch (error) {
      showErrorToast(getRecipeErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const rename = async (recipe: RecipeListItem, name: string) => {
    if (!name) {
      showErrorToast("Recipe name is required.")
      return
    }
    try {
      const saved = await renameRecipe(recipe.id, name)
      setRecipes((current) =>
        current.map((one) => (one.id === saved.id ? { ...toRecipeListItem(saved), run: one.run } : one))
      )
    } catch (error) {
      showErrorToast(getRecipeErrorMessage(error))
    }
  }

  const duplicate = async (recipe: RecipeListItem) => {
    if (duplicating) return
    setDuplicating(recipe.id)
    try {
      const copied = await duplicateRecipe(recipe.id)
      // Under the one it came from, and picked, so the copy is where you are
      // looking rather than wherever the list happens to start.
      setRecipes((current) => {
        const at = current.findIndex((one) => one.id === recipe.id)
        const next = [...current]
        next.splice(at + 1, 0, toRecipeListItem(copied))
        return next
      })
      onChanged()
      go({ view: "recipes", open: copied.id, q: search.q })
    } catch (error) {
      showErrorToast(getRecipeErrorMessage(error))
    } finally {
      setDuplicating(null)
    }
  }

  const remove = async (targets: RecipeListItem[]) => {
    setDeleteBusy(true)
    try {
      const gone = new Set(targets.map((recipe) => recipe.id))
      const { count } = await deleteRecipes([...gone])
      setRecipes((current) => current.filter((recipe) => !gone.has(recipe.id)))
      setTicked(new Set())
      onChanged()
      if (count < gone.size) {
        showErrorToast(describeBulkResult({ done: count, kept: gone.size - count, one: "recipe", many: "recipes", verb: "deleted" }))
      }
      if (search.full && openId && gone.has(openId)) go({ view: "recipes" })
    } catch (error) {
      // A recipe with a live run cannot be deleted; the server says which.
      showErrorToast(getRecipeErrorMessage(error))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  const menuFor = (recipe: RecipeListItem) => (
    <RecordMenu
      label="Recipe menu"
      name={{ value: recipe.name, onCommit: (name) => void rename(recipe, name) }}
      actions={[
        {
          label: duplicating === recipe.id ? "Duplicating…" : "Duplicate",
          icon: duplicating === recipe.id ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />,
          disabled: duplicating !== null,
          onClick: () => void duplicate(recipe),
        },
        { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onClick: () => setDeleting([recipe]) },
      ]}
      tabs={[
        {
          value: "saved-results",
          label: "Saved results",
          content: (close) => (
            <RecipeSavedResults
              recipeId={recipe.id}
              onOpen={(runId) => {
                close()
                openElsewhere("backtests", runId)
              }}
            />
          ),
        },
      ]}
    />
  )

  const windows = (
    <>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting && deleting.length > 1
            ? `Delete ${deleting.length} recipes?`
            : deleting?.[0]
              ? `Delete "${deleting[0].name}"?`
              : "Delete this recipe?"
        }
        description="Its canvas goes with it. Its backtests and bots stay. A recipe with a bot still switched on cannot be deleted: stop the bot first."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
      {rowMenu ? (
        <CrmRowMenu
          at={rowMenu}
          massSelect={{
            on: massOn,
            onToggle: () => {
              setMassOn(!massOn)
              setTicked(massOn ? new Set() : new Set([rowMenu.id]))
            },
          }}
          items={(() => {
            const recipe = recipes.find((one) => one.id === rowMenu.id)
            if (!recipe) return []
            return [
              { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => void duplicate(recipe) },
              { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting([recipe]) },
            ]
          })()}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </>
  )

  if (search.full && loaded.opened && loaded.opened.id === openId) {
    const opened = loaded.opened
    const listed = recipes.find((recipe) => recipe.id === opened.id)
    return (
      <RecipeEditor
        key={opened.id}
        initial={opened}
        node={search.node}
        onNode={(node) => go({ ...search, node: node ?? undefined })}
        heading={headingEnd}
        menu={listed ? menuFor(listed) : null}
        onBack={() => go({ view: "recipes", open: opened.id, q: search.q }, { push: true })}
        onOpenBacktest={(runId) => openElsewhere("backtests", runId)}
        frame={(panels) => frame({ ...panels, ids, openId, windows })}
      />
    )
  }

  const header = (
    <CrmListHeader
      tabs={heading}
      selected={
        chosen.length ? (
          <SelectedMenu
            count={chosen.length}
            onClear={() => setTicked(new Set())}
            pages={{}}
            main={(menu) => (
              <SelectedMenuRow
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  menu.close()
                  setDeleting(chosen)
                }}
              >
                <Trash2Icon className="size-4" />
                Delete
              </SelectedMenuRow>
            )}
          />
        ) : null
      }
      primary={
        <FoldingMenu
          label="New recipe"
          open={newOpen}
          onOpenChange={setNewOpen}
          trigger={
            <Button type="button" size="sm">
              <PlusIcon className="size-4" />
              <span className="@max-3xl:sr-only">New recipe</span>
            </Button>
          }
        >
          <form
            className="grid gap-3 p-1"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="new-recipe-name">Recipe name</FieldLabel>
              <Input
                id="new-recipe-name"
                autoFocus
                value={newName}
                maxLength={80}
                placeholder="DCA on watched coins"
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create recipe
              </Button>
            </div>
          </form>
        </FoldingMenu>
      }
      menuLabel="More for recipes"
      search={{
        name: "recipes-search",
        label: "Search recipes",
        placeholder: "Search recipes",
        value: search.q ?? "",
        onChange: (q) => go({ ...search, q: q || undefined }),
      }}
      massSelect={{
        on: massOn,
        onToggle: () => {
          setMassOn(!massOn)
          setTicked(new Set())
        },
      }}
    />
  )

  const allTicked = ids.length > 0 && ids.every((id) => ticked.has(id))
  const table = (
    <CrmTable
      columns={[...COLUMNS]}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      select={
        massOn
          ? {
              noun: "recipes",
              disabled: ids.length === 0,
              checked: allTicked ? true : ids.some((id) => ticked.has(id)) ? "indeterminate" : false,
              onToggle: () => setTicked(allTicked ? new Set() : new Set(ids)),
            }
          : null
      }
      empty={
        sorted.length > 0 ? null : query ? (
          <span className="grid justify-items-center gap-2">
            {`No recipes match "${search.q}".`}
            <Button type="button" variant="outline" size="sm" onClick={() => go({ view: "recipes" })}>
              Clear filters
            </Button>
          </span>
        ) : (
          "No recipes yet. Press New recipe to make the first one."
        )
      }
    >
      {sorted.map((recipe) => (
        <CrmTableRow
          key={recipe.id}
          open={recipe.id === openId}
          label={recipe.name}
          tick={
            massOn
              ? {
                  shown: true,
                  ticked: ticked.has(recipe.id),
                  onToggle: () =>
                    setTicked((current) => {
                      const next = new Set(current)
                      if (next.has(recipe.id)) next.delete(recipe.id)
                      else next.add(recipe.id)
                      return next
                    }),
                }
              : null
          }
          onOpen={() => go({ view: "recipes", open: recipe.id, full: true, q: search.q }, { push: true })}
          onDelete={() => setDeleting([recipe])}
          onRightClick={(x, y) => setRowMenu({ id: recipe.id, x, y })}
        >
          <MainCell name={recipe.name}>{recipe.isValid ? null : <Chip muted>Draft</Chip>}</MainCell>
          <TableCell column="meta">{runWords(recipe)}</TableCell>
          <TableCell column="meta" className="hidden @4xl:table-cell">
            {recipe.summary}
          </TableCell>
          <TableCell column="meta" className="hidden @2xl:table-cell" title={formatDateTime(new Date(recipe.updated_at))}>
            {formatDate(recipe.updated_at)}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )

  // No right panel: a recipe's line opens its canvas at once (Tyler, 9 Nov 2026:
  // "clicking on the recipe should just go to the canvas").
  return frame({ header, middle: table, ids, openId, windows })
}
