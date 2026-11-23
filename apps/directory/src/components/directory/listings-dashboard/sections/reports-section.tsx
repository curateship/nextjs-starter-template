import * as React from "react"
import { CheckIcon, FlagIcon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { WaitedChip } from "@/components/directory/listings-dashboard/queue-parts"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { ReportLinks } from "@/components/directory/report-links"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { closeListingReport, getListingReportErrorMessage, type ListingReportsPage } from "@/lib/api/directory/reports"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import {
  LISTING_REPORT_STATUS_LABELS,
  LISTING_REPORT_STATUSES,
  REPORT_KIND_LABELS,
  REPORT_KINDS,
  REPORT_REASON_LABELS,
} from "@/lib/directory/report-reasons"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Report = ListingReportsPage["reports"][number]
type Decision = "fixed" | "dismissed"

/**
 * The Reports row: problems visitors reported on a listing, an event or a
 * deal, opening on the open ones. It was the Reports page, a top-level item
 * of the left menu.
 *
 * - **Header:** "N selected" (Mark fixed, Dismiss), search, Select, Filter
 *   (Status and Kind).
 * - **Rows:** how long each has been open, amber from three days.
 * - **Right:** what they said, links to the page and its editor, and
 *   Dismiss or Mark fixed. Neither touches the page: Fixed means it was
 *   already corrected, Dismissed that there was nothing to correct.
 * - **Close many** (Tyler's polish pick, 18 Nov 2026: "Select on Reports,
 *   so ticked reports are marked Fixed or Dismissed together").
 */
export function ReportsSection({ data, search, frame, onChanged }: SectionProps<ListingReportsPage>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = search.status === "all" ? "all" : statusIn(search.status, LISTING_REPORT_STATUSES)
  const kind = search.kind
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [closing, setClosing] = React.useState<{ reports: Report[]; decision: Decision } | null>(null)
  const [run, busy] = useAsyncAction(getListingReportErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const listKey = `${q}|${status ?? ""}|${kind ?? ""}|${data.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.reports.map((report) => report.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = data.reports.find((report) => report.id === openId) ?? null
  const tickable = data.reports.filter((report) => report.status === "open").map((report) => report.id)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.reports.filter((report) => selection.selected.has(report.id))
  const filterCount = (status ? 1 : 0) + (kind ? 1 : 0)

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={FlagIcon} label="Reports" />}
        end={<PanelReopenButton side="right" label="Show the report" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      setClosing({ reports: ticked, decision: "fixed" })
                    }}
                  >
                    <CheckIcon className="size-4" />
                    Mark fixed
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      setClosing({ reports: ticked, decision: "dismissed" })
                    }}
                  >
                    <XIcon className="size-4" />
                    Dismiss
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        menuLabel="More for reports"
        search={{
          name: "report-search",
          label: "Search reports by title or what was said",
          placeholder: "Search reports",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={filterCount}
            onClear={() => setListSearch({ status: undefined, kind: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="reports-status" label="Status">
              <Select
                value={status ?? "open"}
                onValueChange={(next) => setListSearch({ status: next === "open" ? undefined : next, page: undefined })}
              >
                <SelectTrigger id="reports-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_REPORT_STATUSES.map((each) => (
                    <SelectItem key={each} value={each}>
                      {LISTING_REPORT_STATUS_LABELS[each]}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow id="reports-kind" label="About">
              <Select value={kind ?? "every"} onValueChange={(next) => setListSearch({ kind: next === "every" ? undefined : next, page: undefined })}>
                <SelectTrigger id="reports-kind" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="every">Listings, events and deals</SelectItem>
                  {REPORT_KINDS.map((each) => (
                    <SelectItem key={each} value={each}>
                      {REPORT_KIND_LABELS[each]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Page", column: "main", className: "min-w-40", sortable: false },
          { key: "waited", label: "Waited", column: "meta", sortable: false },
          { key: "kind", label: "About", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "reports", disabled: tickable.length === 0, checked: selection.selectAllState(tickable), onToggle: () => selection.toggleVisible(tickable) }
            : null
        }
        empty={
          data.reports.length > 0 ? null : q.trim() || kind ? (
            <NoMatches words={q} noun="reports" onClear={() => setListSearch({ q: undefined, status: undefined, kind: undefined, page: undefined })} />
          ) : status && status !== "open" ? (
            "Nothing with that status."
          ) : (
            "Nothing is open. Problems visitors report appear here."
          )
        }
      >
        {data.reports.map((report) => (
          <CrmTableRow
            key={report.id}
            open={report.id === openId}
            label={report.subjectTitle || "A report"}
            tick={{
              shown: massSelect,
              ticked: selection.selected.has(report.id),
              none: report.status !== "open",
              onToggle: () => selection.toggle(report.id),
            }}
            onOpen={() => {
              setPressedId(report.id)
              setOpen(report.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: report.id, x, y })}
          >
            <MainCell name={report.subjectTitle || "Untitled"} line={REPORT_REASON_LABELS[report.reason]} />
            <TableCell column="meta">
              {report.status === "open" ? <WaitedChip since={report.createdAt} /> : <Chip muted>{waitedText(report.createdAt)}</Chip>}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @xl:table-cell">
              <Chip muted>{REPORT_KIND_LABELS[report.kind]}</Chip>
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
              <Chip muted>{LISTING_REPORT_STATUS_LABELS[report.status]}</Chip>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={data.page} pageSize={data.pageSize} total={data.total} />
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={[]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Report",
      showLabel: "Show the report",
      content: openRow ? (
        <ReportRecord key={openRow.id} report={openRow} onClosed={() => void onChanged()} />
      ) : (
        <EmptyRecord
          title="Report"
          icon={<FlagIcon aria-hidden />}
          line={data.total ? "Click a report to see it here." : "Nothing to read yet."}
          hideLabel="Hide the report"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) setClosing(null)
        }}
        title={
          closing
            ? `${closing.decision === "fixed" ? "Mark" : "Dismiss"} ${closing.reports.length} ${plural(closing.reports.length, "report", "reports")}${closing.decision === "fixed" ? " fixed" : ""}?`
            : ""
        }
        description={
          closing
            ? closing.decision === "fixed"
              ? "Say this only once each page is corrected. Nothing on the pages changes here, and this cannot be undone."
              : "Each report is closed with nothing corrected. Nothing on the pages changes, and this cannot be undone."
            : null
        }
        confirmLabel={closing ? (closing.decision === "fixed" ? "Mark fixed" : "Dismiss") : ""}
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!closing) return
            const failed: string[] = []
            for (const report of closing.reports) {
              try {
                await closeListingReport({ id: report.id, decision: closing.decision })
              } catch {
                failed.push(report.subjectTitle || "A report")
              }
            }
            const total = closing.reports.length
            setClosing(null)
            selection.clear()
            await onChanged()
            // A part-done batch says how far it got, as Change does (`workspace/docs/changing-many-records.md`).
            if (failed.length) throw new Error(`${total - failed.length} of ${total} closed. ${failed.join(", ")} could not be, and stay open.`)
          })
        }
      />
    ),
  })
}

/** One report on the right: what they said, where it is, and the two answers. */
function ReportRecord({ report, onClosed }: { report: Report; onClosed: () => void }) {
  const [run, busy] = useAsyncAction(getListingReportErrorMessage)
  const done = report.status !== "open"
  const decide = (decision: Decision) =>
    void run(async () => {
      await closeListingReport({ id: report.id, decision })
      onClosed()
    })
  return (
    <RecordFrame
      avatar={<FlagIcon aria-hidden />}
      title={REPORT_REASON_LABELS[report.reason]}
      line={`${REPORT_KIND_LABELS[report.kind]}: ${report.subjectTitle || "Untitled"}`}
      hideLabel="Hide the report"
      actions={
        <RecordMenu
          label="Report menu"
          actions={
            done
              ? []
              : [
                  { label: "Mark fixed", icon: <CheckIcon className="size-4" />, onSelect: () => decide("fixed"), disabled: busy },
                  { label: "Dismiss", icon: <XIcon className="size-4" />, onSelect: () => decide("dismissed"), disabled: busy },
                ]
          }
        />
      }
      body={
        <PanelCard storageId="report-said" icon={<FlagIcon />} title={report.subjectTitle || "The page"} meta={`Reported ${formatDateTime(report.createdAt)}`}>
          <div className="grid gap-3">
            {/* Plain text in a paragraph, never markup, so nothing a stranger sent can draw anything. */}
            <p className="text-sm whitespace-pre-wrap">{report.note || "They left no note."}</p>
            <DetailRows>
              <DetailRow label="Their email" value={report.reporterEmail || "Not given"} />
              <DetailRow label="Status" value={LISTING_REPORT_STATUS_LABELS[report.status]} />
            </DetailRows>
            <ReportLinks report={report} />
          </div>
        </PanelCard>
      }
      footer={
        done ? (
          <FooterState>
            <span className="text-muted-foreground">Marked {LISTING_REPORT_STATUS_LABELS[report.status].toLowerCase()}.</span>
          </FooterState>
        ) : (
          <>
            <FooterState>
              <span className="text-muted-foreground">Nothing on the page has changed.</span>
            </FooterState>
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("dismissed")}>
              Dismiss
            </Button>
            <Button type="button" disabled={busy} onClick={() => decide("fixed")}>
              Mark fixed
            </Button>
          </>
        )
      }
    />
  )
}
