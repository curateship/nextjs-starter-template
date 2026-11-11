import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { HandshakeIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { ConversationRecord } from "@/components/crm/conversation-record"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { LEAD_DELETE_DETAIL, LeadBulkMenu } from "@/components/crm/lead-bulk-menu"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { addLeadToContactList, deleteLeads, getLeadErrorMessage } from "@/lib/api/crm/leads"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { Chip, CrmTable, CrmTableRow, Dot, DOT, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { LeadImportDialog } from "@/components/crm/lead-import"
import { LeadRecord } from "@/components/crm/lead-record"
import { NewLeadDropdown } from "@/components/crm/new-lead-dropdown"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { FilterPopover } from "@/components/shared/filter-popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { LeadPersonItem, LeadsPage } from "@/lib/api/people/contacts"
import { CRM_STAGE_LABELS, CRM_STAGES } from "@/lib/crm/crm"
import type { CrmLeadsSearch, CrmSearch } from "@/lib/crm/crm-search"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { applyReplyDraft, noReplyDrafts, replyDraftFor, type ReplyDrafts } from "@/lib/crm/reply-drafts"
import { formatMoney } from "@/lib/format/money"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"

type LeadSort = NonNullable<CrmLeadsSearch["sort"]>

/**
 * The CRM's Leads section (Tyler, 9 Nov 2026: "leads are completely seperate
 * from people"). Every address that wrote in, or was written to from the CRM,
 * in one list of its own. Subscribers are another list; one address may be
 * on both, and each list shows only its own kind.
 *
 * - **Middle:** each lead's stage dot and name, address, company, stage,
 *   deal value and when they arrived, in the CRM's one header and table
 *   shape. Search looks through name, address and company; Filter, and the
 *   Leads card on the left page, narrow it to one stage (`?stage=`).
 * - **Right:** a lead somebody has written to opens on their newest
 *   conversation, read and answered in place as in Inbox
 *   (`ConversationRecord`); a lead nobody has written to opens the lead panel
 *   (`LeadRecord`). Its ⋮ adds them to the subscribers, or opens them there
 *   when they already are one.
 */
export function CrmLeadsTab({
  page,
  search,
  heading,
  headingEnd,
  frame,
  onOpenSubscriber,
}: {
  page: LeadsPage
  search: CrmSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
  /** Opens the subscriber on the same address, in Subscribers. */
  onOpenSubscriber: (contactId: string) => void
}) {
  const router = useRouter()
  const listSearch = search as CrmLeadsSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = listSearch.q ?? ""
  // One stage, from the Leads card on the left or Filter here.
  const stage = listSearch.stage
  const sort: LeadSort = listSearch.sort ?? "created"
  const direction = listSearch.direction ?? "desc"
  const pageNumber = listSearch.page ?? 1
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize))
  const ids = page.leads.map((lead) => lead.id)
  const openId = listSearch.open ?? ids[0]
  const openLead = page.leads.find((lead) => lead.id === openId) ?? null
  const refresh = () => void router.invalidate()
  const [importOpen, setImportOpen] = React.useState(false)

  // Mass select and the right-click menu, as on Subscribers (Tyler, 9 Nov
  // 2026: "leads table is missing right click function", "Its also missing
  // mass select").
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, `${q}|${stage ?? ""}|${sort}|${direction}|${pageNumber}`)
  const selectedIds = ids.filter((id) => selection.selected.has(id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<LeadPersonItem | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [runRow, rowBusy] = useAsyncAction(getLeadErrorMessage)
  const leadById = new Map(page.leads.map((lead) => [lead.id, lead]))

  const removeLead = (lead: LeadPersonItem) =>
    void runRow(async () => {
      await deleteLeads([lead.id])
      setDeleteTarget(null)
      if (lead.id === openId) setOpen(undefined)
      await router.invalidate()
    }, `Deleted ${lead.email}.`)

  const rowMenuItems = (id: string): RowMenuItem[] => {
    const lead = leadById.get(id)
    if (!lead) return []
    return [
      lead.contactId
        ? {
            label: "Open in Subscribers",
            icon: <UsersIcon className="size-4" />,
            onSelect: () => onOpenSubscriber(lead.contactId!),
          }
        : {
            label: "Add to subscribers",
            icon: <UserPlusIcon className="size-4" />,
            onSelect: () =>
              void runRow(async () => {
                await addLeadToContactList(lead.id)
                toast.success(`${lead.email} is on the subscriber list.`)
                await router.invalidate()
              }),
          },
      { label: "Delete lead", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleteTarget(lead) },
    ]
  }

  // Half-written replies, kept here so moving to another lead and back keeps
  // them, as the Inbox's are.
  const [replyDrafts, setReplyDrafts] = React.useState<ReplyDrafts>(noReplyDrafts)

  // Newest, the biggest deal and the furthest stage first; words A to Z.
  const toggleSort = useListSort<LeadSort>({ sort, direction }, (column) =>
    column === "created" || column === "value" ? "desc" : "asc"
  )
  const columns: TableHeaderColumn<LeadSort>[] = [
    { key: "name", label: "Lead", column: "main", className: "min-w-40" },
    { key: "email", label: "Email", column: "preview", className: "hidden md:hidden @xl:table-cell" },
    { key: "company", label: "Company", column: "preview", className: "hidden md:hidden @4xl:table-cell" },
    { key: "stage", label: "Status", column: "preview" },
    { key: "value", label: "Value", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
    { key: "created", label: "Added", column: "meta" },
  ]

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={stage ? 1 : 0}
            onClear={() => setListSearch({ stage: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="crm-lead-stage" label="Status">
              <Select
                value={stage ?? "all"}
                onValueChange={(value) =>
                  setListSearch({ stage: value === "all" ? undefined : value, page: undefined, open: undefined })
                }
              >
                <SelectTrigger id="crm-lead-stage" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every status</SelectItem>
                  {CRM_STAGES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CRM_STAGE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          <NewLeadDropdown
            onCreated={async (leadId) => {
              await router.invalidate()
              setOpen(leadId)
            }}
            onImport={() => setImportOpen(true)}
          />
        }
        selected={
          massSelect && selectedIds.length ? (
            <LeadBulkMenu
              selectedIds={selectedIds}
              onDeleted={() => {
                if (openId && selectedIds.includes(openId)) setOpen(undefined)
              }}
              onDone={() => selection.clear()}
              onRefresh={() => router.invalidate()}
            />
          ) : null
        }
        menuLabel="More for leads"
        search={{
          name: "lead-search",
          label: "Search leads",
          placeholder: "Search leads",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      <CrmTable<LeadSort>
        columns={columns}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? {
                noun: "leads",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          page.leads.length > 0 ? null : q.trim() || stage ? (
            <span className="grid justify-items-center gap-2">
              {q.trim() ? `No lead matches "${q.trim()}".` : `No lead is ${CRM_STAGE_LABELS[stage!].toLowerCase()}.`}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setListSearch({ q: undefined, stage: undefined, page: undefined })}
              >
                Clear filters
              </Button>
            </span>
          ) : (
            "No leads yet. Everyone who writes in, whom you write to from Inbox, or you add with New lead lands here."
          )
        }
      >
        {page.leads.map((lead) => {
          const name = lead.name?.trim() || lead.email
          return (
            <CrmTableRow
              key={lead.id}
              open={lead.id === openId}
              label={name}
              tick={{ shown: massSelect, ticked: selection.selected.has(lead.id), onToggle: () => selection.toggle(lead.id) }}
              onOpen={() => setOpen(lead.id)}
              onDelete={() => setDeleteTarget(lead)}
              onRightClick={(x, y) => setRightClick({ id: lead.id, x, y })}
            >
              <MainCell name={name} avatar={{ name: lead.name, email: lead.email }} lead={<Dot className={DOT.stage[lead.stage]} label={CRM_STAGE_LABELS[lead.stage]} />} />
              <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                <span className="block max-w-64 truncate text-muted-foreground">{lead.email}</span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
                <span className="block max-w-48 truncate text-muted-foreground">{lead.company || "None"}</span>
              </TableCell>
              <TableCell column="preview">
                <Chip muted>{CRM_STAGE_LABELS[lead.stage]}</Chip>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
                {lead.valueCents > 0 ? formatMoney(lead.valueCents) : "None"}
              </TableCell>
              <TableCell column="mutedMeta">{formatInboxTime(lead.created_at)}</TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      {totalPages > 1 || pageNumber > 1 ? (
        <div className="border-t">
          <DashboardTablePagination
            page={pageNumber}
            pageSize={page.pageSize}
            total={page.total}
            totalPages={totalPages}
            onPageChange={(next) => {
              const clamped = Math.max(1, Math.min(next, totalPages))
              setListSearch({ page: clamped > 1 ? clamped : undefined })
            }}
          />
        </div>
      ) : null}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={rowMenuItems(rightClick.id)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete ${closingDeleteTarget?.email ?? "this lead"}?`}
        description={LEAD_DELETE_DETAIL}
        confirmLabel="Delete lead"
        loading={rowBusy}
        onConfirm={() => {
          if (deleteTarget) removeLead(deleteTarget)
        }}
      />
      {importOpen ? (
        <LeadImportDialog onClose={() => setImportOpen(false)} onImported={() => router.invalidate()} />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${q}|${stage ?? ""}`,
    showRightFor: listSearch.open,
    middle,
    right: {
      label: "Lead",
      showLabel: "Show the lead",
      content: openLead?.newestThreadId ? (
        <ConversationRecord
          key={openLead.id}
          threadId={openLead.newestThreadId}
          fallbackName={openLead.name}
          fallbackEmail={openLead.email}
          emptyLine={null}
          replyFromFallback={null}
          replyDraft={replyDraftFor(replyDrafts, openLead.newestThreadId)}
          onReplyDraftChange={(threadId, update) => setReplyDrafts((current) => applyReplyDraft(current, threadId, update))}
          onListChanged={refresh}
          onOpenContact={onOpenSubscriber}
        />
      ) : openLead ? (
        <LeadRecord key={openLead.id} leadId={openLead.id} onOpenContact={onOpenSubscriber} onChanged={async () => refresh()} />
      ) : (
        <EmptyRecord
          title="Lead"
          icon={<HandshakeIcon aria-hidden />}
          line={listSearch.open ? "That lead is not there any more." : "Nobody has written in yet."}
          hideLabel="Hide the lead"
        />
      ),
    },
  })
}
