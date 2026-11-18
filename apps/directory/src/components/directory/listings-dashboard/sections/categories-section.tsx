import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, CornerDownRightIcon, FolderTreeIcon, PlusIcon, StoreIcon, Trash2Icon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmGroupRow, CrmTable, CrmTableRow } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import {
  AutoSaveWords,
  NoMatches,
  PickGroup,
  RecordMenu,
  useAutoSave,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { ImageUpload } from "@/components/shared/image-upload"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getCategoryErrorMessage,
  loadCategoryDeleteImpact,
  removeCategory,
  saveCategory,
  saveNewCategory,
  type Category,
} from "@/lib/api/directory/categories"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { slugFromTitle } from "@/lib/directory/slugs"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

/** Where the categories with no parent and no children sit. */
const ON_THEIR_OWN = "on-their-own"

type Family = { key: string; label: string; rows: { category: Category; depth: number }[] }

/**
 * The tree as headings: a top-level category with subcategories is a
 * heading that folds its family, itself first and then every category under
 * it, indented (Tyler's polish pick, 18 Nov 2026: "Parent categories become
 * folding headings"). Categories with no parent and no children sit last
 * under one heading of their own. A search answers with a flat list, so a
 * match deep in the tree is never hidden under a fold.
 */
function familiesOf(categories: Category[], words: string): Family[] {
  const query = words.trim().toLowerCase()
  if (query) {
    const found = categories
      .filter((category) => category.name.toLowerCase().includes(query))
      .map((category) => ({ category, depth: 0 }))
    return found.length ? [{ key: "found", label: "", rows: found }] : []
  }
  const ordered = categoryTreeOrder(categories)
  const families: Family[] = []
  const alone: Family = { key: ON_THEIR_OWN, label: "On their own", rows: [] }
  let current: Family | null = null
  for (const row of ordered) {
    if (row.depth === 0) {
      const hasChildren = categories.some((other) => other.parentId === row.category.id)
      if (hasChildren) {
        current = { key: row.category.id, label: row.category.name, rows: [row] }
        families.push(current)
      } else {
        current = null
        alone.rows.push(row)
      }
    } else if (current) {
      current.rows.push(row)
    }
  }
  return alone.rows.length ? [...families, alone] : families
}

/**
 * The Categories row: the site's category tree in folding families, each
 * row with its listings counted. Pressing a count opens Listings narrowed to
 * that category (Tyler's polish pick: "Pressing a category's listing count
 * opens Listings narrowed to that category"). It was the Categories page,
 * whose rows opened a window and had a "+" for a child.
 *
 * - **Header:** "N selected" (Delete), search, Select, New category.
 * - **Rows:** the cog and the bin; right-click holds Mass select, New
 *   category under it, Duplicate and Delete.
 * - **Right:** the open category, which saves itself. Its ⋮ holds where it
 *   sits in the tree.
 */
export function CategoriesSection({ data, search, frame, onChanged }: SectionProps<Category[]>) {
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const families = React.useMemo(() => familiesOf(data, q), [data, q])
  const [folded, setFolded] = React.useState<Set<string>>(() => new Set())
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [newUnder, setNewUnder] = React.useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null })
  const [confirm, setConfirm] = React.useState<
    { categories: Category[]; children: number; listings: number; posts: number; events: number } | null
  >(null)
  const [run, busy] = useAsyncAction(getCategoryErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  useClearSelectionOnListChange(selection.setSelected, q)
  const shown = families.flatMap((family) => (folded.has(family.key) ? [] : family.rows))
  const ids = shown.map((row) => row.category.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openCategory = data.find((category) => category.id === openId) ?? null

  const openListings = (category: Category) =>
    void navigate({ to: "/admin/listings", search: { category: category.id } })

  const askToDelete = (list: Category[]) =>
    void run(async () => {
      // One category's words name what it takes; several add up each one's.
      const impacts = await Promise.all(list.map((category) => loadCategoryDeleteImpact(category.id)))
      setConfirm({
        categories: list,
        children: impacts.reduce((sum, impact) => sum + impact.children, 0),
        listings: impacts.reduce((sum, impact) => sum + impact.listings, 0),
        posts: impacts.reduce((sum, impact) => sum + impact.posts, 0),
        events: impacts.reduce((sum, impact) => sum + impact.events, 0),
      })
    })

  /** A copy beside it: the same words and parent, a free address. It opens on the right. */
  const duplicate = (category: Category) =>
    void run(async () => {
      const copy = await saveNewCategory({
        name: `${category.name} copy`,
        description: category.description,
        metaDescription: category.metaDescription,
        featuredImage: category.featuredImage,
        parentId: category.parentId,
      })
      await onChanged()
      setOpen(copy.id)
    })

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.filter((category) => selection.selected.has(category.id))
  const rightClicked = rightClick ? data.find((category) => category.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={FolderTreeIcon} label="Categories" />}
        end={<PanelReopenButton side="right" label="Show the category" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    askToDelete(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for categories"
        search={{
          name: "category-search",
          label: "Search categories",
          placeholder: "Search categories",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        primary={
          <NewCategoryDropdown
            categories={data}
            state={newUnder}
            onStateChange={setNewUnder}
            onCreated={async (made) => {
              await onChanged()
              setOpen(made.id)
            }}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Category", column: "main", className: "min-w-40", sortable: false },
          { key: "listings", label: "Listings in it", column: "meta", sortable: false },
          { key: "slug", label: "Address", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? {
                noun: "categories",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          families.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="categories" onClear={() => setListSearch({ q: undefined })} />
          ) : (
            "No categories yet. Make the first one with New category."
          )
        }
      >
        {families.map((family) => (
          <React.Fragment key={family.key}>
            {family.label ? (
              <CrmGroupRow
                label={family.label}
                count={family.rows.length}
                folded={folded.has(family.key)}
                onToggle={() =>
                  setFolded((current) => {
                    const next = new Set(current)
                    if (next.has(family.key)) next.delete(family.key)
                    else next.add(family.key)
                    return next
                  })
                }
              />
            ) : null}
            {folded.has(family.key)
              ? null
              : family.rows.map(({ category, depth }) => (
                  <CrmTableRow
                    key={category.id}
                    open={category.id === openId}
                    label={category.name}
                    tick={{
                      shown: massSelect,
                      ticked: selection.selected.has(category.id),
                      onToggle: () => selection.toggle(category.id),
                    }}
                    onOpen={() => {
                      setPressedId(category.id)
                      setOpen(category.id)
                    }}
                    onDelete={() => askToDelete([category])}
                    onRightClick={(x, y) => setRightClick({ id: category.id, x, y })}
                  >
                    <TableCell column="main" className="min-w-40">
                      <span className="flex min-w-0 items-center gap-2" style={depth ? { paddingLeft: `${depth * 1.25}rem` } : undefined}>
                        {depth ? <CornerDownRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                        <span data-row-name="" className="line-clamp-1 min-w-0 break-all font-medium">
                          {category.name}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell column="meta">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 tabular-nums text-muted-foreground"
                        aria-label={`Open the ${category.listingCount} listings in ${category.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          openListings(category)
                        }}
                      >
                        {category.listingCount.toLocaleString()}
                      </Button>
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
                      <span className="block max-w-48 truncate">{category.slug}</span>
                    </TableCell>
                  </CrmTableRow>
                ))}
          </React.Fragment>
        ))}
      </CrmTable>
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={[
            {
              label: "New category under it",
              icon: <PlusIcon className="size-4" />,
              onSelect: () => setNewUnder({ open: true, parentId: rightClicked.id }),
            },
            { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(rightClicked) },
            { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => askToDelete([rightClicked]) },
          ]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: q,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Category",
      showLabel: "Show the category",
      content: openCategory ? (
        <CategoryRecord
          key={openCategory.id}
          category={openCategory}
          categories={data}
          busy={busy}
          onSaved={() => void onChanged()}
          onOpenListings={() => openListings(openCategory)}
          onNewUnder={() => setNewUnder({ open: true, parentId: openCategory.id })}
          onDuplicate={() => duplicate(openCategory)}
          onDelete={() => askToDelete([openCategory])}
        />
      ) : (
        <EmptyRecord
          title="Category"
          icon={<FolderTreeIcon aria-hidden />}
          line={data.length ? "Click a category to see it here." : "Make a category with New category to see it here."}
          hideLabel="Hide the category"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm && confirm.categories.length > 1 ? `Delete ${confirm.categories.length} categories?` : "Delete this category?"}
        description={
          confirm
            ? [
                confirm.categories.length === 1
                  ? `${confirm.categories[0]!.name} goes for good.`
                  : `${confirm.categories.length} categories go for good.`,
                confirm.children
                  ? `${confirm.children} ${plural(confirm.children, "subcategory moves", "subcategories move")} up a level.`
                  : null,
                confirm.listings
                  ? `${confirm.listings} ${plural(confirm.listings, "listing loses", "listings lose")} the tag. The listings themselves stay.`
                  : null,
                confirm.posts ? `${confirm.posts} ${plural(confirm.posts, "post loses", "posts lose")} the tag too.` : null,
                confirm.events ? `${confirm.events} ${plural(confirm.events, "event loses", "events lose")} the tag too.` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : null
        }
        confirmLabel={confirm && confirm.categories.length > 1 ? `Delete ${confirm.categories.length} categories` : "Delete category"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            // One that fails does not stop the rest, and stays ticked
            // (`workspace/docs/changing-many-records.md`).
            const asked = confirm.categories
            const kept: typeof asked = []
            let reason: unknown
            for (const category of asked) {
              try {
                await removeCategory(category.id)
              } catch (error) {
                kept.push(category)
                reason ??= error
              }
            }
            selection.setSelected(new Set(kept.map((each) => each.id)))
            setConfirm(null)
            await onChanged()
            if (kept.length === asked.length) throw reason
            if (kept.length) {
              throw new Error(
                `${asked.length - kept.length} of ${asked.length} deleted. ${kept.map((each) => each.name).join(", ")} could not be, and ${kept.length === 1 ? "stays" : "stay"} ticked.`
              )
            }
          })
        }
      />
    ),
  })
}

/** Where a category may hang: anywhere but under itself or its own branch. The server refuses the same. */
function parentChoicesFor(categories: Category[], category: Category | null) {
  if (!category) return categoryTreeOrder(categories)
  const blocked = new Set([category.id])
  let grew = true
  while (grew) {
    grew = false
    for (const row of categories) {
      if (row.parentId && blocked.has(row.parentId) && !blocked.has(row.id)) {
        blocked.add(row.id)
        grew = true
      }
    }
  }
  return categoryTreeOrder(categories).filter(({ category: row }) => !blocked.has(row.id))
}

/** New category: a name and where it sits, as a dropdown under its button. Right-click's "New category under it" opens it with the parent picked. */
function NewCategoryDropdown({
  categories,
  state,
  onStateChange,
  onCreated,
}: {
  categories: Category[]
  state: { open: boolean; parentId: string | null }
  onStateChange: (state: { open: boolean; parentId: string | null }) => void
  onCreated: (made: Category) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [run, saving] = useAsyncAction(getCategoryErrorMessage)
  const choices = parentChoicesFor(categories, null)
  return (
    <NewRecordDropdown
      label="New category"
      open={state.open}
      onOpenChange={(open) => onStateChange({ open, parentId: open ? state.parentId : null })}
      submitLabel="Create category"
      busy={saving}
      onSubmit={() =>
        void run(async () => {
          if (!name.trim()) throw new Error("Give the category a name first.")
          const made = await saveNewCategory({ name: name.trim(), parentId: state.parentId })
          setName("")
          onStateChange({ open: false, parentId: null })
          await onCreated(made)
        })
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New category">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New category</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-category-name">Name</FieldLabel>
        <Input id="new-category-name" autoFocus value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-category-parent">Sits under</FieldLabel>
        <Select
          value={state.parentId ?? "top"}
          onValueChange={(value) => onStateChange({ open: true, parentId: value === "top" ? null : value })}
        >
          <SelectTrigger id="new-category-parent" className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Nothing, it is top level</SelectItem>
            {choices.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {" ".repeat(depth * 2)}
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </NewRecordDropdown>
  )
}

/** One category on the right: its words and photo, saving by themselves; its place in the tree in the ⋮. */
function CategoryRecord({
  category,
  categories,
  busy,
  onSaved,
  onOpenListings,
  onNewUnder,
  onDuplicate,
  onDelete,
}: {
  category: Category
  categories: Category[]
  busy: boolean
  onSaved: () => void
  onOpenListings: () => void
  onNewUnder: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [name, setName] = React.useState(category.name)
  const [slug, setSlug] = React.useState(category.slug)
  const [savedSlug, setSavedSlug] = React.useState(category.slug)
  const [description, setDescription] = React.useState(category.description)
  const [metaDescription, setMetaDescription] = React.useState(category.metaDescription)
  const [featuredImage, setFeaturedImage] = React.useState(category.featuredImage)
  const [parentId, setParentId] = React.useState(category.parentId)
  const ready = name.trim().length > 0
  const auto = useAutoSave({
    value: { name, slug: savedSlug, description, metaDescription, featuredImage, parentId },
    ready,
    message: getCategoryErrorMessage,
    save: async (next) => {
      await saveCategory({ id: category.id, ...next })
      onSaved()
    },
  })
  const parentName = categories.find((row) => row.id === parentId)?.name
  return (
    <RecordFrame
      avatar={
        featuredImage ? <img src={featuredImage} alt="" className="size-6 rounded-md object-cover" /> : <FolderTreeIcon aria-hidden />
      }
      title={name.trim() || "Untitled category"}
      line={parentName ? `Under ${parentName}` : "Top level"}
      hideLabel="Hide the category"
      actions={
        <RecordMenu
          label="Category menu"
          groups={
            <PickGroup title="Category">
              <PickMenuRow
                label="Sits under"
                value={parentName ?? "Nothing"}
                empty={!parentName}
                options={[
                  { value: "top", label: "Nothing, it is top level" },
                  ...parentChoicesFor(categories, category).map(({ category: row, depth }) => ({
                    value: row.id,
                    label: `${" ".repeat(depth * 2)}${row.name}`,
                  })),
                ]}
                selected={parentId ?? "top"}
                onPick={(value) => setParentId(value === "top" ? null : value)}
              />
            </PickGroup>
          }
          actions={[
            { label: "New category under it", icon: <PlusIcon className="size-4" />, onSelect: onNewUnder },
            { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: onDuplicate, disabled: busy },
            { label: "Delete category", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: onDelete, disabled: busy },
          ]}
        />
      }
      body={
        <PanelCard storageId="category-basics" icon={<FolderTreeIcon />} title="The category" openWhen={!ready}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel htmlFor="category-name">Name</FieldLabel>
              <Input id="category-name" value={name} aria-invalid={!ready} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="category-slug" hint="The category page's address part, like coffee-tea.">
                Address part
              </FieldLabel>
              <Input
                id="category-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                onBlur={() => {
                  const next = slug.trim() || slugFromTitle(name)
                  setSlug(next)
                  setSavedSlug(next)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="category-description" hint="Shown at the top of the category's public page. Optional.">
                Page description
              </FieldLabel>
              <Textarea id="category-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="category-meta" hint="What a search result shows under the category title. Optional.">
                  Search description
                </FieldLabel>
                <CharacterCount value={metaDescription} max={300} />
              </div>
              <Textarea
                id="category-meta"
                rows={2}
                maxLength={300}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
              />
            </div>
            <ImageUpload
              label="Photo"
              hint="Shown on the category's card and at the top of its page."
              value={featuredImage}
              aspect="square"
              fit="cover"
              className="max-w-24"
              onChange={(url) => setFeaturedImage(url)}
            />
          </div>
        </PanelCard>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={ready} why="Give it a name to save" />
            <span className="text-muted-foreground">
              · {category.listingCount.toLocaleString()} {plural(category.listingCount, "listing", "listings")}
            </span>
          </FooterState>
          <Button type="button" variant="outline" onClick={onOpenListings}>
            <StoreIcon />
            Open its listings
          </Button>
        </>
      }
    />
  )
}
