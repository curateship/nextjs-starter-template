/**
 * Deliberate Trade-owned fork of the shell Automations list. Recipes omit
 * templates, live switches, scheduled columns and member tests.
 */
import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SelectAllTableHead,
  SortableTableHeader,
} from "@/components/shared/sortable-table-header"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  createRecipe,
  deleteRecipes,
  duplicateRecipe,
  getRecipeErrorMessage,
  renameRecipe,
  toRecipeListItem,
  type RecipeListItem,
  type RecipesPage,
} from "@/lib/api/trade/recipes"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "name" | "steps" | "updated"

const RECIPE_COLUMNS = [
  { key: "name", label: "Name", column: "main" },
  { key: "steps", label: "Steps", column: "meta" },
  {
    key: "updated",
    label: "Updated",
    column: "meta",
    className: "hidden sm:table-cell",
  },
] satisfies Array<{
  key: SortColumn
  label: string
  column: "main" | "meta"
  className?: string
}>

export function RecipesListPage({ initial }: { initial: RecipesPage }) {
  const navigate = useNavigate()
  const { config } = useShellRuntime()
  const [recipes, setRecipes] = React.useState(initial.recipes)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>(
    "updated",
    "desc",
    (column) => (column === "updated" ? "desc" : "asc")
  )
  const [search, setSearch] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createTouched, setCreateTouched] = React.useState(false)
  const [createAttempted, setCreateAttempted] = React.useState(false)
  const [runCreate, creating] = useAsyncAction(getRecipeErrorMessage)
  const [renameTarget, setRenameTarget] = React.useState<RecipeListItem | null>(
    null
  )
  const [renameName, setRenameName] = React.useState("")
  const [renameTouched, setRenameTouched] = React.useState(false)
  const [renameAttempted, setRenameAttempted] = React.useState(false)
  const [runRename, renaming] = useAsyncAction(getRecipeErrorMessage)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<
    RecipeListItem[] | null
  >(null)
  const [runDelete, deleting] = useAsyncAction(getRecipeErrorMessage)
  const selection = useSelection()
  const selectedIds = selection.selected
  const closingDeleteTargets = useLastValue(deleteTargets)

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = search.trim().toLowerCase()
    return recipes
      .filter(
        (recipe) =>
          !query ||
          recipe.name.toLowerCase().includes(query) ||
          recipe.summary.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (sort === "name") return factor * left.name.localeCompare(right.name)
        if (sort === "steps") {
          return (
            factor *
            (left.nodeCount - right.nodeCount ||
              left.name.localeCompare(right.name))
          )
        }
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [direction, recipes, search, sort])

  const { page, pageSize, visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${search}|${sort}|${direction}`
  )

  useClearSelectionOnListChange(
    selection.setSelected,
    `${search}|${sort}|${direction}|${page}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => visible.map((recipe) => recipe.id),
    [visible]
  )
  const selectedRecipes = React.useMemo(
    () => recipes.filter((recipe) => selectedIds.has(recipe.id)),
    [recipes, selectedIds]
  )

  const openEditor = (recipeId: string) =>
    navigate({
      to: "/admin/recipes/$recipeId",
      params: { recipeId },
    })

  const closeCreate = () => {
    setCreateOpen(false)
    setCreateName("")
    setCreateTouched(false)
    setCreateAttempted(false)
  }

  const handleCreate = async () => {
    if (creating) return
    setCreateAttempted(true)
    if (!createName.trim()) {
      showErrorToast("Recipe name is required.")
      return
    }
    await runCreate(async () => {
      const created = await createRecipe(createName)
      setRecipes((current) => [toRecipeListItem(created), ...current])
      toast.success(`Created "${created.name}".`)
      closeCreate()
      await openEditor(created.id)
    })
  }

  const openRename = (recipe: RecipeListItem) => {
    setRenameTarget(recipe)
    setRenameName(recipe.name)
    setRenameTouched(false)
    setRenameAttempted(false)
  }

  const closeRename = () => {
    setRenameTarget(null)
    setRenameName("")
    setRenameTouched(false)
    setRenameAttempted(false)
  }

  const handleRename = async () => {
    if (!renameTarget || renaming) return
    setRenameAttempted(true)
    if (!renameName.trim()) {
      showErrorToast("Recipe name is required.")
      return
    }
    await runRename(async () => {
      const saved = await renameRecipe(renameTarget.id, renameName)
      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === saved.id ? toRecipeListItem(saved) : recipe
        )
      )
      toast.success(`Renamed recipe to "${saved.name}".`)
      closeRename()
    })
  }

  const handleDuplicate = async (recipe: RecipeListItem) => {
    if (duplicatingId) return
    setDuplicatingId(recipe.id)
    dismissErrorToast()
    try {
      const copied = await duplicateRecipe(recipe.id)
      setRecipes((current) => [toRecipeListItem(copied), ...current])
      toast.success(`Created "${copied.name}".`)
    } catch (error) {
      showErrorToast(getRecipeErrorMessage(error))
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTargets?.length || deleting) return
    await runDelete(async () => {
      const ids = new Set(deleteTargets.map((recipe) => recipe.id))
      const { count } = await deleteRecipes([...ids])
      setRecipes((current) => current.filter((recipe) => !ids.has(recipe.id)))
      toast.success(
        describeBulkResult({
          done: count,
          kept: ids.size - count,
          one: "recipe",
          many: "recipes",
          verb: "deleted",
        })
      )
      selection.clear()
      setDeleteTargets(null)
    })
  }

  return (
    <>
      <DashboardTable
        title="Recipes"
        count={sorted.length}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setDeleteTargets(selectedRecipes)}
                disabled={deleting}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="recipe-search"
              aria-label="Search recipes"
              placeholder="Search recipes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New recipe
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={RECIPE_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="recipes"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sorted.length === 0}
        emptyText={
          search.trim()
            ? "No recipes match that search."
            : "No recipes yet. Create the first one."
        }
        emptyColSpan={5}
        footer={footer}
      >
        {visible.map((recipe) => (
          <TableRow
            key={recipe.id}
            className="group"
            rowAction={() => void openEditor(recipe.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(recipe.id)}
                onCheckedChange={() => selection.toggle(recipe.id)}
                aria-label={`Select ${recipe.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <Link
                to="/admin/recipes/$recipeId"
                params={{ recipeId: recipe.id }}
                className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
                title={recipe.name}
              >
                {recipe.name}
              </Link>
            </TableCell>
            <TableCell column="meta">{recipe.summary}</TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              {formatDate(recipe.updated_at)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Duplicate ${recipe.name}`}
                disabled={duplicatingId !== null}
                onClick={() => void handleDuplicate(recipe)}
              >
                {duplicatingId === recipe.id ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Rename ${recipe.name}`}
                onClick={() => openRename(recipe)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${recipe.name}`}
                onClick={() => setDeleteTargets([recipe])}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <FormDialog
        open={createOpen}
        dirty={Boolean(createName.trim())}
        busy={creating}
        onClose={closeCreate}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>New recipe</DialogTitle>
              <DialogDescription>
                Start with a blank canvas and add the trade steps in order.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void handleCreate()
              }}
            >
              <DialogBody className="grid gap-2">
                <Label htmlFor="recipe-name">Name</Label>
                <Input
                  id="recipe-name"
                  value={createName}
                  maxLength={80}
                  placeholder="DCA on watched coins"
                  onChange={(event) => setCreateName(event.target.value)}
                  onBlur={() => setCreateTouched(true)}
                  aria-invalid={
                    (!createName.trim() &&
                      (createTouched || createAttempted)) ||
                    undefined
                  }
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={creating}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Create recipe
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>

      <FormDialog
        open={renameTarget !== null}
        dirty={renameName.trim() !== (renameTarget?.name ?? "")}
        busy={renaming}
        onClose={closeRename}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Rename recipe</DialogTitle>
              <DialogDescription>
                Only the name changes. The drawing stays exactly as it is.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void handleRename()
              }}
            >
              <DialogBody className="grid gap-2">
                <Label htmlFor="rename-recipe-name">Name</Label>
                <Input
                  id="rename-recipe-name"
                  value={renameName}
                  maxLength={80}
                  placeholder="DCA on watched coins"
                  onChange={(event) => setRenameName(event.target.value)}
                  onBlur={() => setRenameTouched(true)}
                  aria-invalid={
                    (!renameName.trim() &&
                      (renameTouched || renameAttempted)) ||
                    undefined
                  }
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={renaming}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={renaming}>
                  {renaming ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Save name
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTargets !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets(null)
        }}
        title={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? `Delete ${closingDeleteTargets.length} recipes?`
            : closingDeleteTargets?.[0]
              ? `Delete ${quoteOneLine(closingDeleteTargets[0].name)}?`
              : "Delete this recipe?"
        }
        description={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "The recipes and their drawings are permanently removed. Deletion stops if any selected recipe has a live run."
            : "The recipe and its drawing are permanently removed. A recipe with a live run cannot be deleted."
        }
        confirmLabel={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "Delete recipes"
            : "Delete recipe"
        }
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
