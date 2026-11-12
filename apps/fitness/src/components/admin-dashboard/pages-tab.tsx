import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { useNewPageForm } from "@/components/admin-dashboard/new-page-form"
import { PagePanel } from "@/components/admin-dashboard/page-panel"
import { pageEditSearch } from "@/lib/admin-dashboard/page-edit-search"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import type { AdminPagesSearch, AdminSearch } from "@/lib/admin-dashboard/admin-search"
import {
  getPageVisibilityErrorMessage,
  getWrittenPageErrorMessage,
  removeWrittenPage,
  savePageVisibility,
  type PagesOverview,
  type PublicPageRow,
} from "@/lib/api/content/pages"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSiteAddress } from "@/lib/hooks/use-site-address"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { PAGE_GROUP_LABELS, PAGE_GROUPS, pageGroup, type PageGroup } from "@/lib/pages/page-groups"
import {
  PAGE_VISIBILITIES,
  PAGE_VISIBILITY_LABELS,
  type PageVisibility,
} from "@/lib/pages/page-visibility"

/** What the route's loader read for Pages: every public page, with its visits. */
export type PagesLoaded = PagesOverview

type PageSort = "page" | "address" | "status" | "visits"

/** "Your pages" reads better as a tab than the list's own "Pages". */
const TAB_LABELS: Record<PageGroup, string> = { yours: "Your pages", system: PAGE_GROUP_LABELS.system }

/**
 * The Admin dashboard's Pages section (Tyler, 9 Nov 2026: "consolidate the
 * pages, navigation and styling into the admin dashboard. Create a new link
 * called "Pages" under overview", then picked "Page settings"). It was the
 * `/admin/pages` screen until then.
 *
 * - **Middle:** every public page in the CRM's one header and table shape.
 *   The header has the tabs Your pages and System pages (`page-groups.ts`
 *   says which is which), the search box, and New page, a dropdown form.
 * - **Right:** the page picked (`PagePanel`): who can see it, its address,
 *   visits, Open, and Edit page, which opens the page builder.
 *
 * The rows come from the page registry, so a page added by dropping in a
 * `*.page.ts` file shows here with no other edit; the visits are the traffic
 * tracker's counts. The loader reads them once; search, tab and sort work on
 * that copy.
 */
export function PagesTab({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
}: {
  loaded: PagesLoaded
  search: AdminSearch
  /** The button that reopens the left panel; the tabs follow it. */
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  const router = useRouter()
  const siteAddress = useSiteAddress()
  const listSearch = search as AdminPagesSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = listSearch.q ?? ""
  const group = listSearch.group ?? "yours"
  const [sort, setSort] = React.useState<PageSort>("visits")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  // Kept in the browser, as the Pages screen kept it: the visits start
  // biggest first, the words A to Z.
  const toggleSort = (column: PageSort) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection(column === "visits" ? "desc" : "asc")
  }

  const counts = React.useMemo(() => {
    const found: Record<PageGroup, number> = { yours: 0, system: 0 }
    for (const row of loaded.rows) found[pageGroup(row)] += 1
    return found
  }, [loaded.rows])

  const shown = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    const found = loaded.rows.filter(
      (row) => pageGroup(row) === group && (!query || `${row.name} ${row.path}`.toLowerCase().includes(query))
    )
    const sign = direction === "asc" ? 1 : -1
    return found.sort((a, b) => sign * comparePages(a, b, sort))
  }, [loaded.rows, group, q, sort, direction])
  const shownIds = shown.map((row) => row.path)
  const openId = listSearch.open ?? shownIds[0]
  const openPage = loaded.rows.find((row) => row.path === openId) ?? null

  // The choice being written, so the box shows the pick for the length of the
  // round trip rather than snapping back.
  const [saving, setSaving] = React.useState<{ path: string; visibility: PageVisibility } | null>(null)
  const [runVisibility] = useAsyncAction(getPageVisibilityErrorMessage)
  const changeVisibility = (row: PublicPageRow, next: PageVisibility) => {
    setSaving({ path: row.path, visibility: next })
    void runVisibility(async () => {
      await savePageVisibility({ path: row.path, visibility: next })
      await router.invalidate()
    }).finally(() => setSaving(null))
  }

  const [deleting, setDeleting] = React.useState<PublicPageRow | null>(null)
  const closingDelete = useLastValue(deleting)
  const [runDelete, deleteBusy] = useAsyncAction(getWrittenPageErrorMessage)
  const removePage = () => {
    const target = deleting
    if (!target?.writtenPageId) return
    const id = target.writtenPageId
    void runDelete(async () => {
      await removeWrittenPage(id)
      if (listSearch.open === target.path) setListSearch({ open: undefined })
      await router.invalidate()
      setDeleting(null)
    })
  }

  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const rightClicked = rightClick ? loaded.rows.find((row) => row.path === rightClick.id) : undefined
  const rowMenuItems = (row: PublicPageRow): RowMenuItem[] => [
    {
      label: "Open in a new tab",
      icon: <ExternalLinkIcon className="size-4" />,
      onSelect: () => window.open(siteAddress(row.path), "_blank", "noreferrer"),
    },
    ...(row.blocks
      ? [
          {
            label: "Edit page",
            icon: <PencilIcon className="size-4" />,
            onSelect: () => void router.navigate({ to: "/admin/dashboard", search: pageEditSearch(row.path) }),
          },
        ]
      : []),
    ...(row.writtenPageId
      ? [
          {
            label: "Delete page",
            icon: <Trash2Icon className="size-4" />,
            destructive: true,
            onSelect: () => setDeleting(row),
          },
        ]
      : []),
  ]

  const columns: TableHeaderColumn<PageSort>[] = [
    { key: "page", label: "Page", column: "main", className: "min-w-40" },
    { key: "address", label: "Address", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    { key: "status", label: "Who can see it", column: "preview", className: "hidden md:hidden @xl:table-cell" },
    { key: "visits", label: `Visits, ${loaded.visitDays} days`, column: "meta" },
  ]

  return frame({
    header: (
      <CrmListHeader
        tabs={
          <>
            {heading}
            <DashboardTabs
              value={group}
              onValueChange={(value) =>
                setListSearch({ group: value === "yours" ? undefined : value, open: undefined })
              }
              tabs={PAGE_GROUPS.map((value) => ({ value, label: TAB_LABELS[value], count: counts[value] }))}
            />
          </>
        }
        end={headingEnd}
        primary={<NewPageButton />}
        menuLabel="More for pages"
        search={{
          name: "pages-search",
          label: "Search pages",
          placeholder: "Search pages",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={null}
      />
    ),
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <CrmTable<PageSort>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          empty={
            shown.length > 0 ? null : q.trim() ? (
              <span className="grid justify-items-center gap-2">
                {`No page matches "${q.trim()}".`}
                <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                  Clear filters
                </Button>
              </span>
            ) : group === "yours" ? (
              "No pages of your own yet. New page adds the first one."
            ) : (
              "No system pages are declared."
            )
          }
        >
          {shown.map((row) => (
            <CrmTableRow
              key={row.path}
              open={row.path === openId}
              label={row.name}
              onOpen={() => setOpen(row.path)}
              // A page built from blocks opens in the builder from its cog;
              // any other page has none, and its cog opens it on the right.
              cog={
                row.blocks
                  ? {
                      label: `Edit ${row.name}`,
                      onPress: () => void router.navigate({ to: "/admin/dashboard", search: pageEditSearch(row.path) }),
                    }
                  : undefined
              }
              onDelete={row.writtenPageId ? () => setDeleting(row) : undefined}
              onRightClick={(x, y) => setRightClick({ id: row.path, x, y })}
            >
              <TableCell column="main" className="w-full max-w-0 min-w-40">
                <span className="flex min-w-0 items-center gap-2">
                  <OpenBar />
                  <span data-row-name="" className="truncate font-medium">
                    {row.name}
                  </span>
                  {row.blocks ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.blockCount === 1 ? "1 block" : `${row.blockCount} blocks`}
                    </span>
                  ) : null}
                </span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
                <span className="block max-w-48 truncate">{row.path}</span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                <Chip>{PAGE_VISIBILITY_LABELS[saving?.path === row.path ? saving.visibility : row.visibility]}</Chip>
              </TableCell>
              <TableCell column="mutedMeta">{row.visits.toLocaleString()}</TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>

        {rightClick && rightClicked ? (
          <CrmRowMenu
            key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
            at={rightClick}
            massSelect={null}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Page",
      content: (
        <PagePanel
          key={openPage?.path ?? "none"}
          page={openPage}
          visitDays={loaded.visitDays}
          approximate={loaded.approximate}
          saving={saving && openPage && saving.path === openPage.path ? saving.visibility : null}
          onVisibilityChange={(next) => {
            if (openPage) changeVisibility(openPage, next)
          }}
          onDelete={() => setDeleting(openPage)}
        />
      ),
    },
    ids: shownIds,
    openId,
    windows: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this page?"
        description={
          closingDelete
            ? `${closingDelete.name} goes for good, and ${closingDelete.path} stops existing. Anyone following a link to it gets the not-found page.`
            : null
        }
        confirmLabel="Delete page"
        loading={deleteBusy}
        onConfirm={removePage}
      />
    ),
  })
}

/**
 * New page in the header, a dropdown form under the button. A new page opens
 * in the builder straight away, in this section, because everything on it is
 * built there.
 */
function NewPageButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const form = useNewPageForm(async (page) => {
    setOpen(false)
    await router.navigate({ to: "/admin/dashboard", search: pageEditSearch(page.path) })
  })
  return (
    <NewRecordDropdown
      label="New page"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create page"
      busy={form.saving}
      onSubmit={() => void form.submit()}
      trigger={
        <DashboardToolbarButton type="button" aria-label="New page">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New page</span>
        </DashboardToolbarButton>
      }
    >
      {form.fields}
    </NewRecordDropdown>
  )
}

function comparePages(a: PublicPageRow, b: PublicPageRow, sort: PageSort) {
  if (sort === "visits") return a.visits - b.visits || a.path.localeCompare(b.path)
  if (sort === "address") return a.path.localeCompare(b.path)
  // Most open first when ascending, the address breaking a tie.
  if (sort === "status")
    return PAGE_VISIBILITIES.indexOf(a.visibility) - PAGE_VISIBILITIES.indexOf(b.visibility) || a.path.localeCompare(b.path)
  return a.name.localeCompare(b.name)
}
