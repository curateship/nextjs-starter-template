import * as React from "react"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"

import { CategoryCombobox } from "@/components/directory/category-combobox"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/api/directory/categories"
import type { BulkRecordChange } from "@/lib/bulk-change"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Changing every ticked row on a dashboard, beside the Delete button that
 * already worked this way.
 *
 * Deleting forty rows was one press; moving forty rows into a new category was
 * forty windows opened and saved. The actions here are the four that are one
 * field each, so each can be said in a sentence and confirmed before it runs.
 *
 * Every action asks first, and the question names the count and the exact
 * change. A wrong bulk edit is as hard to undo as a wrong bulk delete: there is
 * no record of what each row held before it.
 *
 * Which actions appear is the kind's own business. Deals have no categories and
 * no featured flag, so their menu is publishing and nothing else, and the
 * menu is absent altogether while no row is ticked.
 */

export function BulkChangeMenu({
  count,
  one,
  many,
  busy,
  categories,
  canFeature = false,
  onRun,
}: {
  /** How many rows are ticked. Nothing renders at zero. */
  count: number
  /** The record's name, singular — "listing". */
  one: string
  /** The record's name, plural — "listings". */
  many: string
  /** A change is in flight, so nothing may be started or dismissed. */
  busy: boolean
  /**
   * The site's categories, for the Set a category window. Null for a kind that
   * has none, which drops the action from the menu.
   */
  categories: Category[] | null
  /** Events only: the free featured switch an admin sets by hand. */
  canFeature?: boolean
  /** Resolves true when the change went through, which is when a window closes. */
  onRun: (change: BulkRecordChange) => Promise<boolean>
}) {
  /** The confirmation that is open, with the sentence it has to say. */
  const [confirm, setConfirm] = React.useState<{
    title: string
    description: string
    label: string
    change: BulkRecordChange
  } | null>(null)
  const [categoryOpen, setCategoryOpen] = React.useState(false)
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<"add" | "replace">("add")

  const rows = React.useMemo(
    () => (categories ? categoryTreeOrder(categories) : []),
    [categories]
  )
  const chosen = categoryId ? new Set([categoryId]) : new Set<string>()
  const chosenName =
    rows.find((row) => row.category.id === categoryId)?.category.name ?? ""

  if (count === 0) return null

  const these = `${count} ${plural(count, one, many)}`

  const askStatus = (status: "draft" | "published") =>
    setConfirm({
      title:
        status === "published" ? `Publish ${these}?` : `Unpublish ${these}?`,
      description:
        status === "published"
          ? `${these} go live, and each one's public page starts existing. The ones already published are left as they are.`
          : `${these} come off the site, and each one's public page stops existing. Nothing is deleted, and the ones already drafts are left as they are.`,
      label: status === "published" ? `Publish ${these}` : `Unpublish ${these}`,
      change: { kind: "status", status },
    })

  const askFeatured = (featured: boolean) =>
    setConfirm({
      title: featured ? `Feature ${these}?` : `Stop featuring ${these}?`,
      description: featured
        ? `${these} are shown first on the Events page. This is the free switch an admin sets, so nobody is charged and no paid placement is created.`
        : `${these} stop being shown first on the Events page. This is the free switch an admin sets, so no paid placement is ended and nobody is refunded.`,
      label: featured ? `Feature ${these}` : `Stop featuring ${these}`,
      change: { kind: "featured", featured },
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={busy}
          >
            Change ({count})
            <ChevronDownIcon className="size-4" />
          </DashboardToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {categories ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setCategoryId(null)
                  setMode("add")
                  setCategoryOpen(true)
                }}
              >
                Set a category…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => askStatus("published")}>
            Publish
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => askStatus("draft")}>
            Unpublish
          </DropdownMenuItem>
          {canFeature ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => askFeatured(true)}>
                Feature
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => askFeatured(false)}>
                Stop featuring
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.label ?? ""}
        // Nothing here removes data, so the button is the ordinary one. The
        // question is still asked, because the change cannot be undone row by
        // row.
        destructive={false}
        loading={busy}
        // Stays open with its spinner until the change has actually gone
        // through, the way Delete beside it does. A failure leaves the question
        // on screen so it can be pressed again.
        onConfirm={() => {
          if (!confirm) return
          void onRun(confirm.change).then((went) => {
            if (went) setConfirm(null)
          })
        }}
      />

      {/* The category window is its own confirmation: the picker, what happens
          to the categories each record already has, and a button that names
          both. A second dialog on top of it would be a modal over a modal. */}
      <Dialog
        open={categoryOpen}
        onOpenChange={(open) => {
          if (busy) return
          setCategoryOpen(open)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set a category on {these}</DialogTitle>
            <DialogDescription>
              One category, on every ticked row. Say whether it joins the
              categories each one already has or replaces them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The category</CardTitle>
                <CardDescription>
                  A {one} already in it is counted as unchanged rather than as a
                  failure.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="bulk-category-field">Category</Label>
                  <CategoryCombobox
                    idPrefix="bulk-category"
                    rows={rows}
                    checked={chosen}
                    disabled={busy}
                    // One category, so picking a second replaces the first and
                    // picking the chosen one again clears it.
                    onToggle={(id) =>
                      setCategoryId((current) => (current === id ? null : id))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bulk-category-mode">
                    What happens to the categories they already have
                  </Label>
                  <Select
                    value={mode}
                    disabled={busy}
                    onValueChange={(value) =>
                      setMode(value === "replace" ? "replace" : "add")
                    }
                  >
                    <SelectTrigger id="bulk-category-mode" className="w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">
                        Add it to the categories they already have
                      </SelectItem>
                      <SelectItem value="replace">
                        Replace their categories with it
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setCategoryOpen(false)}
            >
              Cancel
            </Button>
            {/* Enabled with nothing picked on purpose: a greyed-out button
                does not say what is missing, and the toast does. */}
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return
                if (!categoryId) {
                  showErrorToast("Pick the category to set first.")
                  return
                }
                void onRun({ kind: "category", categoryId, mode }).then(
                  (went) => {
                    if (went) setCategoryOpen(false)
                  }
                )
              }}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {mode === "replace"
                ? `Replace the categories on ${these}`
                : `Add ${chosenName || "it"} to ${these}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
