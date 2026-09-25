import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListPlusIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CustomSectionDialog } from "@/components/directory/custom-section-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CUSTOM_SECTION_LAYOUT_LABELS,
  MAX_CUSTOM_SECTIONS,
} from "@/lib/directory/custom-fields"
import {
  getCustomSectionErrorMessage,
  loadCustomSectionDeleteImpact,
  removeCustomSection,
  saveCustomSectionOrder,
  type CustomSectionSummary,
} from "@/lib/api/directory/custom-sections"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { plural } from "@/lib/format/plural"

/**
 * The screen where a site invents fields for its own listings.
 *
 * The order is the order they appear on a listing's page, which is why the
 * columns do not sort: a sorted view of a hand-arranged list would show an
 * arrangement nobody chose, and the up and down buttons would then move rows
 * somewhere other than where they went.
 */
export function CustomSectionsDashboard({
  sections,
}: {
  sections: CustomSectionSummary[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<
    { section: CustomSectionSummary | null } | null
  >(null)
  const [confirm, setConfirm] = React.useState<{
    section: CustomSectionSummary
    listings: number
  } | null>(null)
  const [run, busy] = useAsyncAction(getCustomSectionErrorMessage)

  const full = sections.length >= MAX_CUSTOM_SECTIONS

  const move = React.useCallback(
    (index: number, by: -1 | 1) => {
      const next = index + by
      if (next < 0 || next >= sections.length) return
      const order = sections.map((section) => section.id)
      const [moved] = order.splice(index, 1)
      order.splice(next, 0, moved)
      void run(async () => {
        await saveCustomSectionOrder(order)
        await router.invalidate()
      })
    },
    [router, run, sections]
  )

  const askToDelete = React.useCallback(
    (section: CustomSectionSummary) => {
      void run(async () => {
        const impact = await loadCustomSectionDeleteImpact(section.slug)
        setConfirm({ section, ...impact })
      })
    },
    [run]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!confirm) return
    const done = await run(async () => {
      const { name } = await removeCustomSection(confirm.section.id)
      await router.invalidate()
      toast.success(`${name} was deleted.`)
    })
    if (done) setConfirm(null)
  }, [confirm, router, run])

  return (
    <>
      <DashboardTable
        title="Listing fields"
        icon={<ListPlusIcon className="text-muted-foreground" />}
        count={sections.length}
        fillHeight
        className="h-auto max-h-full"
        controls={
          <DisabledReason
            disabled={full}
            reason={`A site can have ${MAX_CUSTOM_SECTIONS} sections. Delete one before adding another.`}
          >
            <DashboardToolbarButton
              type="button"
              disabled={full}
              onClick={() => setEditing({ section: null })}
            >
              <PlusIcon className="size-4" />
              New section
            </DashboardToolbarButton>
          </DisabledReason>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Section</TableHead>
              <TableHead column="meta">Fields</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Arrangement
              </TableHead>
              <TableHead column="meta">Listings using it</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sections.length === 0}
        emptyText="No extra fields yet. A section is a heading with fields under it — “The wine”, “Classes” — and it shows on every listing that fills it in."
        emptyColSpan={5}
        // A site is capped at twelve sections, so the list never needs paging
        // — it says how many there are and stops.
        footer={{
          type: "summary",
          count: sections.length,
          label: plural(sections.length, "section", "sections"),
        }}
      >
        {sections.map((section, index) => (
          <TableRow
            key={section.id}
            className="group"
            rowAction={() => setEditing({ section })}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block min-w-0 truncate text-left text-sm font-medium group-hover:underline"
                title={section.name}
                onClick={() => setEditing({ section })}
              >
                {section.name}
              </button>
              {section.fields.length ? (
                <span className="line-clamp-2 whitespace-normal text-xs text-muted-foreground">
                  {section.fields.map((field) => field.label).join(" · ")}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Nothing in it yet — it shows on no listing.
                </span>
              )}
            </TableCell>
            <TableCell column="meta">{section.fields.length}</TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {CUSTOM_SECTION_LAYOUT_LABELS[section.layout]}
            </TableCell>
            <TableCell column="meta">
              {section.listings.toLocaleString()}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || index === 0}
                  aria-label={`Move ${section.name} up`}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUpIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || index === sections.length - 1}
                  aria-label={`Move ${section.name} down`}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDownIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${section.name}`}
                  onClick={() => setEditing({ section })}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Delete ${section.name}`}
                  onClick={() => askToDelete(section)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <CustomSectionDialog
        open={editing !== null}
        section={editing?.section ?? null}
        onClose={() => setEditing(null)}
        onSaved={(saved, wasNew) => {
          setEditing(null)
          void router.invalidate()
          toast.success(
            wasNew ? `${saved.name} was created.` : "Section saved."
          )
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title="Delete this section?"
        description={
          confirm
            ? [
                `${confirm.section.name} and its fields go for good.`,
                confirm.listings
                  ? `${confirm.listings} ${plural(confirm.listings, "listing loses", "listings lose")} what was filled in under it — the listings themselves stay.`
                  : "No listing has filled anything in under it.",
              ].join(" ")
            : null
        }
        confirmLabel="Delete section"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
