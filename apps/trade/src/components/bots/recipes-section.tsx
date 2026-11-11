import * as React from "react"
import { CopyIcon, Loader2Icon, PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react"

import type { BotsSectionProps } from "@/components/bots/bots-dashboard"
import { RecordMenu } from "@/components/bots/bots-record"
import { RecipeSavedResults } from "@/components/bots/recipe-saved-results"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { RecipeEditor } from "@/components/recipes/recipe-editor"
import { RecipeOverviewPanel } from "@/components/recipes/recipe-overview-panel"
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
import { cn } from "@/lib/utils"

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
  { key: "steps", label: "Steps", column: "meta", className: "hidden @3xl:table-cell" },
  { key: "updated", label: "Updated", column: "meta", className: "hidden @2xl:table-cell" },
] as const

/**
 * A recipe's name split at its dashes, drawn as the name and a chip per part
 * (Tyler, 11 Nov 2026: "revamp the recipes table design", after his drawing):
 * "Hyper Liquid - Large cap - DCA ladder" reads Hyper Liquid, then Large cap
 * and DCA ladder as chips.
 */
function nameParts(name: string): { name: string; chips: string[] } {
  const [first, ...rest] = name.split(" - ").map((part) => part.trim()).filter(Boolean)
  return { name: first ?? name, chips: rest }
}

/** The dot's colour for where a recipe's bot stands. */
const STATUS_DOT: Record<string, string> = {
  Running: "bg-emerald-500",
  Paused: "bg-amber-500",
  Stopping: "bg-amber-500",
  Stopped: "bg-muted-foreground",
}

/**
 * Where a recipe's bot stands: a dot and a word, on a grey pill once it has
 * run, then the day it stopped or where it runs, in grey.
 */
function RunStatus({ recipe }: { recipe: RecipeListItem }) {
  const run = recipe.run
  if (!run) {
    return (
      <span className="inline-flex items-center gap-2 px-2 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
        Never run
      </span>
    )
  }
  const after =
    run.status === "Stopped"
      ? run.stoppedAt
        ? formatDate(run.stoppedAt)
        : null
      : run.activeCount > 1
        ? `${run.activeCount} wallets`
        : run.walletLabel
  return (
    <span className="inline-flex items-center gap-3 whitespace-nowrap">
      <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-0.5 font-medium">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[run.status] ?? "bg-muted-foreground")} aria-hidden />
        {run.status}
      </span>
      {after ? <span className="text-muted-foreground">{after}</span> : null}
    </span>
  )
}

/** Switched-on recipes first, then paused, stopping, stopped, never run. */
function runRank(recipe: RecipeListItem) {
  return ({ Running: 0, Paused: 1, Stopping: 2, Stopped: 3 })[recipe.run?.status ?? "Stopped"] + (recipe.run ? 0 : 1)
}

/**
 * Recipes on the Bots dashboard: the workspace's trading plans. A line picked
 * shows the recipe's Last result and Parameters on the right, with Open canvas
 * in the footer, and the line's cog opens the canvas too (Tyler, 11 Nov 2026,
 * replacing 9 Nov's "clicking on the recipe should just go to the canvas").
 * Opened, the canvas fills the middle with its step list beside it; the right
 * panel holds the picked step's settings, or the same two cards with no step
 * picked. New recipe is the header's one New button, a dropdown holding the
 * name.
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
      // The picked or opened recipe went: the first row opens in its place.
      if (openId && gone.has(openId)) go({ view: "recipes", q: search.q })
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
      // The button that reopens a shut right panel, last in the header.
      end={headingEnd}
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
          // A line is picked, its Last result and Parameters on the right;
          // Open canvas there, or the cog, opens its canvas (Tyler, 11 Nov
          // 2026: "In the footer add a button to go to canvas. ANd in the
          // middle panel, link the cog to the canvas editor").
          onOpen={() => go({ view: "recipes", open: recipe.id, q: search.q })}
          cog={{
            label: `Open ${recipe.name} on its canvas`,
            onPress: () => go({ view: "recipes", open: recipe.id, full: true, q: search.q }, { push: true }),
          }}
          onDelete={() => setDeleting([recipe])}
          onRightClick={(x, y) => setRowMenu({ id: recipe.id, x, y })}
        >
          <MainCell name={nameParts(recipe.name).name}>
            {nameParts(recipe.name).chips.map((chip) => (
              <Chip key={chip} muted className="bg-muted/60">
                {chip}
              </Chip>
            ))}
            {recipe.isValid ? null : <Chip muted>Draft</Chip>}
          </MainCell>
          <TableCell column="meta">
            <RunStatus recipe={recipe} />
          </TableCell>
          <TableCell column="meta" className="hidden whitespace-nowrap @3xl:table-cell">
            <span className="inline-flex min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 font-mono text-xs tabular-nums">
              {recipe.nodeCount}
            </span>
            <span className="ml-2 text-muted-foreground">{recipe.nodeCount === 1 ? "step" : "steps"}</span>
          </TableCell>
          <TableCell column="meta" className="hidden @2xl:table-cell" title={formatDateTime(new Date(recipe.updated_at))}>
            {formatDate(recipe.updated_at)}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )

  // The line picked shows its Last result and Parameters on the right, with
  // Open canvas in the footer, as a picked backtest shows its Result.
  const picked = loaded.opened && loaded.opened.id === openId ? loaded.opened : null
  const pickedRow = picked ? recipes.find((recipe) => recipe.id === picked.id) : undefined
  const openCanvas = (recipeId: string, node?: string) =>
    go({ view: "recipes", open: recipeId, full: true, q: search.q, node }, { push: true })
  const right = picked
    ? {
        label: "Recipe",
        content: (
          <RecipeOverviewPanel
            key={picked.id}
            recipeId={picked.id}
            graph={picked.graph}
            menu={pickedRow ? menuFor(pickedRow) : null}
            onPickStep={(nodeId) => openCanvas(picked.id, nodeId)}
            onOpenBacktest={(runId) => openElsewhere("backtests", runId)}
            footer={
              <Button type="button" size="sm" className="ml-auto" onClick={() => openCanvas(picked.id)}>
                <WorkflowIcon className="size-4" />
                Open canvas
              </Button>
            }
          />
        ),
      }
    : undefined

  return frame({ header, middle: table, right, ids, openId, windows })
}
