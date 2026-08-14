import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CornerDownRightIcon,
  FolderTreeIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CategoryDialog } from "@/components/directory/category-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getCategoryErrorMessage,
  loadCategoryDeleteImpact,
  removeCategory,
  type Category,
} from "@/lib/api/directory/categories"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { plural } from "@/lib/format/plural"

/**
 * The category tree, drawn as an indented list. The order is the tree itself,
 * which is why the columns do not sort — sorting a tree alphabetically would
 * tear children away from their parents. Searching flattens it: matches show
 * as a plain list so a deep match is not hidden under a fold.
 */

/** The tree flattened parent-first, with how deep each row sits. */
function treeRows(categories: Category[]): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>()
  for (const category of categories) {
    const key = category.parentId ?? null
    byParent.set(key, [...(byParent.get(key) ?? []), category])
  }
  const rows: { category: Category; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    // Deeper than the tree can honestly be is a cycle left by hand-edited
    // data; stopping keeps the page up rather than looping forever.
    if (depth > 10) return
    for (const category of byParent.get(parentId) ?? []) {
      rows.push({ category, depth })
      walk(category.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

export function CategoriesDashboard({
  categories,
  searchText,
}: {
  categories: Category[]
  searchText: string
}) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const navigate = useListSearchNavigate()
  const [text, setText] = useSearchBoxText(searchText, (value) =>
    navigate({ q: value || undefined })
  )

  /** The window's subject: editing a category, or creating one under a parent. */
  const [editing, setEditing] = React.useState<
    { category: Category | null; parentId: string | null } | null
  >(null)
  const [run, busy] = useAsyncAction(getCategoryErrorMessage)
  const [confirm, setConfirm] = React.useState<{
    category: Category
    children: number
    listings: number
  } | null>(null)

  const rows = React.useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) return treeRows(categories)
    // A search answers with a flat list on purpose: a match three levels deep
    // shown at its tree indent would look like a child of nothing.
    return categories
      .filter((category) => category.name.toLowerCase().includes(query))
      .map((category) => ({ category, depth: 0 }))
  }, [categories, searchText])
  const { visible, footer } = useClientPage(
    rows,
    config.dashboardRowsPerPage,
    searchText
  )

  const askToDelete = React.useCallback(
    (category: Category) => {
      void run(async () => {
        const impact = await loadCategoryDeleteImpact(category.id)
        setConfirm({ category, ...impact })
      })
    },
    [run]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!confirm) return
    const done = await run(async () => {
      const { name } = await removeCategory(confirm.category.id)
      await router.invalidate()
      toast.success(`${name} was deleted.`)
    })
    if (done) setConfirm(null)
  }, [confirm, router, run])

  return (
    <>
      <DashboardTable
        title="Categories"
        icon={<FolderTreeIcon className="text-muted-foreground" />}
        count={rows.length}
        fillHeight
        // Short lists keep their natural height. Once the surface reaches the
        // page's available height, only the rows scroll and the footer stays.
        className="h-auto max-h-full"
        controls={
          <>
            <DashboardToolbarSearch
              name="category-search"
              aria-label="Search categories"
              placeholder="Search categories…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setEditing({ category: null, parentId: null })}
            >
              <PlusIcon className="size-4" />
              New category
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Category</TableHead>
              <TableHead column="meta">Listings in it</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Address
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={rows.length === 0}
        emptyText={
          searchText.trim()
            ? "No category matches that search."
            : "No categories yet. Create the first one."
        }
        emptyColSpan={4}
        footer={footer}
      >
        {visible.map(({ category, depth }) => (
          <TableRow
            key={category.id}
            className="group"
            // The name opens the category, so the whole row does too — the
            // shared row keeps its hands off the buttons in the last column.
            rowAction={() => setEditing({ category, parentId: null })}
          >
            <TableCell column="main">
              <div
                className="flex min-w-0 items-center gap-2"
                style={depth ? { paddingLeft: `${depth * 1.25}rem` } : undefined}
              >
                {depth ? (
                  <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
                <button
                  type="button"
                  className="block min-w-0 truncate text-left text-sm font-medium group-hover:underline"
                  title={category.name}
                  onClick={() => setEditing({ category, parentId: null })}
                >
                  {category.name}
                </button>
              </div>
              {category.description ? (
                <span
                  className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                  style={depth ? { paddingLeft: `${depth * 1.25}rem` } : undefined}
                  title={category.description}
                >
                  {category.description}
                </span>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              {category.listingCount.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              <span className="block max-w-48 truncate" title={category.slug}>
                {category.slug}
              </span>
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`New category inside ${category.name}`}
                  onClick={() =>
                    setEditing({ category: null, parentId: category.id })
                  }
                >
                  <PlusIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${category.name}`}
                  onClick={() => setEditing({ category, parentId: null })}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Delete ${category.name}`}
                  onClick={() => askToDelete(category)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <CategoryDialog
        open={editing !== null}
        category={editing?.category ?? null}
        categories={categories}
        parentId={editing?.parentId ?? null}
        onClose={() => setEditing(null)}
        onSaved={(saved, wasNew) => {
          setEditing(null)
          void router.invalidate()
          toast.success(wasNew ? `${saved.name} was created.` : "Category saved.")
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title="Delete this category?"
        description={
          confirm
            ? [
                `${confirm.category.name} goes for good.`,
                confirm.children
                  ? `Its ${confirm.children} ${plural(confirm.children, "subcategory moves", "subcategories move")} up a level.`
                  : null,
                confirm.listings
                  ? `${confirm.listings} ${plural(confirm.listings, "listing loses", "listings lose")} the tag — the listings themselves stay.`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")
            : null
        }
        confirmLabel="Delete category"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
