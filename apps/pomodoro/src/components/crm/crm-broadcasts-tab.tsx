import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, LayoutTemplateIcon, MailIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { BroadcastRecord, BROADCAST_STATUS_LABELS, broadcastProgress, TemplateRecord } from "@/components/crm/broadcast-records"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, Dot, DOT, MainCell, useFolds } from "@/components/crm/crm-table"
import { TableCell } from "@/components/ui/table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { ViewMenu, type ViewChoice } from "@/components/shared/view-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createBroadcast,
  deleteBroadcasts,
  deleteBroadcastTemplates,
  duplicateBroadcast,
  getBroadcastErrorMessage,
  loadBroadcastTemplates,
  setDefaultBroadcastTemplate,
  updateBroadcast,
  type BroadcastListItem,
  type BroadcastsPage,
  type BroadcastTemplateItem,
} from "@/lib/api/email/broadcasts"
import type { SegmentChoice } from "@/lib/api/people/contact-segments"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import type { CrmBroadcastSearch, CrmBroadcastView, CrmSearch } from "@/lib/crm/crm-search"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The CRM's Broadcasts tab (Part C of the CRM task, 7 Nov 2026): every
 * newsletter as rows under Drafts, Scheduled, Sent and Templates, written in
 * the right panel, never on a page of its own (Tyler: "consolidate this into
 * the CRM dashboard too and not linked it outside").
 *
 * - **Header:** the CRM's one header: "N selected" while rows are ticked,
 *   New newsletter, and the ⋮ with Search and Mass select.
 * - **Rows:** the name and when it last changed or went, the subject, then
 *   how far its send got. Right-click has Mass select, Make a copy, Delete.
 * - **Right:** the open newsletter (`BroadcastRecord`) or a template
 *   (`TemplateRecord`). The app's own emails have a section of their own,
 *   System emails, since 9 Nov 2026.
 */
export function CrmBroadcastsTab({
  page,
  templates,
  segments,
  blockDefaults,
  search,
  heading,
  headingEnd,
  frame,
}: {
  page: BroadcastsPage
  templates: BroadcastTemplateItem[]
  segments: SegmentChoice[]
  blockDefaults: BroadcastBlockDefaults
  search: CrmSearch
  /** The start of the middle's header: the section's icon and name. */
  heading: React.ReactNode
  /** The end of the middle's header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  /** Draws the section into the dashboard's one frame. */
  frame: CrmFrame
}) {
  const router = useRouter()
  // The reader left only this tab's keys in the address (`readCrmSearch`).
  const listSearch = search as CrmBroadcastSearch
  const view: CrmBroadcastView = listSearch.view ?? "all"
  const folds = useFolds()
  const setListSearch = useListSearchNavigate()
  const setOpenRecord = useOpenRecord()
  const openId = listSearch.open
  const refresh = () => router.invalidate()

  const open = (id: string | undefined) => setOpenRecord(id)

  const query = (listSearch.q ?? "").trim().toLowerCase()
  const shownTemplates = templates.filter((template) => !query || template.name.toLowerCase().includes(query))
  const ids = view === "templates" ? shownTemplates.map((template) => template.id) : page.broadcasts.map((item) => item.id)

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, `${view}|${query}`)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<BroadcastListItem[] | null>(null)
  const closingDeleteTargets = useLastValue(deleteTargets)
  const [runDelete, deleting] = useAsyncAction(getBroadcastErrorMessage)
  const [templateDelete, setTemplateDelete] = React.useState<BroadcastTemplateItem | null>(null)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const copy = async (broadcastId: string) => {
    try {
      const made = await duplicateBroadcast(broadcastId)
      // The copy is a draft, so it opens under Drafts.
      // The list is read again first, then the new one opened: the other way
      // round, the read raced the address change and the row only showed
      // after another click (Tyler, 7 Nov 2026).
      await refresh()
      setListSearch({ view: undefined, q: undefined, open: made.id })
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    }
  }

  const startFrom = async (template: BroadcastTemplateItem) => {
    try {
      const made = await createBroadcast(template.name)
      await updateBroadcast({ broadcastId: made.id, blocks: template.blocks })
      // The list is read again first, then the new one opened: the other way
      // round, the read raced the address change and the row only showed
      // after another click (Tyler, 7 Nov 2026).
      await refresh()
      setListSearch({ view: undefined, q: undefined, open: made.id })
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    }
  }

  const pills: ViewChoice[] = [
    { value: "all", label: "All", count: page.counts.drafts + page.counts.scheduled + page.counts.sent },
    { value: "drafts", label: "Drafts", count: page.counts.drafts },
    { value: "scheduled", label: "Scheduled", count: page.counts.scheduled },
    { value: "sent", label: "Sent", count: page.counts.sent },
    { value: "templates", label: "Templates", count: page.counts.templates },
  ]
  const ticked = page.broadcasts.filter((item) => selection.selected.has(item.id))

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={deleting}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  onClick={() => {
                    menu.close()
                    setDeleteTargets(ticked)
                  }}
                >
                  <Trash2Icon className="size-4 text-muted-foreground" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        view={
          <ViewMenu
        label="Which newsletters"
        value={view}
        onValueChange={(value) =>
        setListSearch({
        view: value === "all" ? undefined : value,
        // A newsletter stays open across its pills; a template is another
        // kind of record, so crossing to or from it lets go.
        ...((value === "templates") !== (view === "templates") ? { open: undefined } : {}),
        })
        }
        choices={pills}
        />
        }
        primary={
          <NewBroadcastDropdown
            onCreated={(broadcastId) => {
              // Read the list again first, then open the new one (see `copy`).
              void refresh().then(() =>
                setListSearch({ view: undefined, q: undefined, open: broadcastId })
              )
            }}
          />
        }
        menuLabel="More for broadcasts"
        search={{
          name: "broadcast-search",
          label: view === "templates" ? "Search templates" : "Search newsletters",
          placeholder: view === "templates" ? "Search templates" : "Search newsletters",
          value: listSearch.q ?? "",
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={view === "templates" ? null : { on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      {view === "templates" ? (
        <CrmTable
          columns={[
            { key: "name", label: "Template", sortable: false, column: "main", className: "min-w-40" },
            { key: "blocks", label: "Blocks", sortable: false, column: "preview" },
            { key: "default", label: "Starts new ones", sortable: false, column: "preview", className: "hidden md:hidden @2xl:table-cell" },
            { key: "changed", label: "Changed", sortable: false, column: "meta" },
          ]}
          sort="changed"
          direction="desc"
          onSort={() => undefined}
          empty={shownTemplates.length ? null : query ? "No template matches that." : "No template yet. A newsletter's ⋮ saves one."}
        >
          {shownTemplates.map((template) => (
            <CrmTableRow
              key={template.id}
              open={template.id === openId}
              label={template.name}
              onOpen={() => open(template.id)}
              onDelete={() => setTemplateDelete(template)}
            >
              <MainCell name={template.name} lead={<Dot className={DOT.quiet} />} />
              <TableCell column="preview">
                <Chip muted>
                  {template.blocks.length} {plural(template.blocks.length, "block")}
                </Chip>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                {template.isDefault ? <Chip>Yes</Chip> : <span className="text-muted-foreground">No</span>}
              </TableCell>
              <TableCell column="mutedMeta">{formatInboxTime(template.updated_at)}</TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
      ) : (
        <CrmTable
          columns={[
            { key: "name", label: "Newsletter", sortable: false, column: "main", className: "min-w-40" },
            { key: "subject", label: "Subject", sortable: false, column: "preview", className: "min-w-48" },
            { key: "status", label: "Status", sortable: false, column: "preview" },
            { key: "sent", label: "Sent", sortable: false, column: "preview", className: "hidden md:hidden @4xl:table-cell" },
            { key: "changed", label: view === "drafts" ? "Changed" : view === "scheduled" ? "Goes" : view === "sent" ? "Went" : "When", sortable: false, column: "meta" },
          ]}
          sort="changed"
          direction="desc"
          onSort={() => undefined}
          select={
            massSelect
              ? {
                  noun: "newsletters",
                  disabled: page.broadcasts.length === 0,
                  checked: selection.selectAllState(page.broadcasts.map((item) => item.id)),
                  onToggle: () => selection.toggleVisible(page.broadcasts.map((item) => item.id)),
                }
              : null
          }
          empty={
            page.broadcasts.length ? null : query ? (
              <span className="grid justify-items-center gap-2">
                No newsletter matches "{query}".
                <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                  Clear filters
                </Button>
              </span>
            ) : view === "drafts" || view === "all" ? (
              "No draft. New newsletter starts one."
            ) : view === "scheduled" ? (
              "Nothing is waiting to go out."
            ) : (
              "Nothing has been sent yet."
            )
          }
        >
          {sectionsOf(page.broadcasts, view).map((section) => (
            <React.Fragment key={section.key}>
              {section.label ? (
                <CrmGroupRow
                  label={section.label}
                  count={section.items.length}
                  folded={folds.folded(section.key)}
                  onToggle={() => folds.toggle(section.key)}
                />
              ) : null}
              {folds.folded(section.key) ? null : section.items.map((item) => (
            <CrmTableRow
              key={item.id}
              open={item.id === openId}
              label={item.name}
              tick={{ shown: massSelect, ticked: selection.selected.has(item.id), onToggle: () => selection.toggle(item.id) }}
              onOpen={() => open(item.id)}
              onDelete={() => setDeleteTargets([item])}
              onRightClick={(x, y) => setRightClick({ id: item.id, x, y })}
            >
              <MainCell name={item.name} lead={<Dot className={DOT.broadcast[item.status]} label={BROADCAST_STATUS_LABELS[item.status]} />} />
              <TableCell column="preview" className="max-w-80 min-w-48">
                <span className="block truncate text-muted-foreground">{item.subject.trim() || "No subject yet"}</span>
              </TableCell>
              <TableCell column="preview">
                <Chip muted={item.status === "draft"}>{BROADCAST_STATUS_LABELS[item.status]}</Chip>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @4xl:table-cell">
                <span className="block max-w-56 truncate">{broadcastProgress(item)}</span>
              </TableCell>
              <TableCell column="mutedMeta">
                {formatInboxTime(item.sent_at ?? item.scheduled_at ?? item.updated_at)}
              </TableCell>
            </CrmTableRow>
              ))}
            </React.Fragment>
          ))}
        </CrmTable>
      )}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
          items={[
            { label: "Make a copy", icon: <CopyIcon className="size-4" />, onSelect: () => void copy(rightClick.id) },
            {
              label: "Delete",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              onSelect: () => {
                const item = page.broadcasts.find((entry) => entry.id === rightClick.id)
                if (item) setDeleteTargets([item])
              },
            },
          ]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  const openTemplate = view === "templates" ? shownTemplates.find((template) => template.id === openId) ?? null : null

  const right = view === "templates" ? (
    openTemplate ? (
      <TemplateRecord
        key={openTemplate.id}
        template={openTemplate}
        blockDefaults={blockDefaults}
        onUse={() => void startFrom(openTemplate)}
        onDelete={() => setTemplateDelete(openTemplate)}
        onMakeDefault={(isDefault) =>
          void setDefaultBroadcastTemplate(openTemplate.id, isDefault)
            .then(refresh)
            .catch((error) => showErrorToast(getBroadcastErrorMessage(error)))
        }
      />
    ) : (
      <EmptyRecord title="Template" icon={<LayoutTemplateIcon aria-hidden />} line="Click a template to see it here." hideLabel="Hide the template" />
    )
  ) : openId ? (
    <BroadcastRecord
      key={openId}
      broadcastId={openId}
      segments={segments}
      blockDefaults={blockDefaults}
      templates={() => loadBroadcastTemplates().then((read) => read.templates)}
      onListChanged={() => void refresh()}
      onCopy={(broadcastId) => void copy(broadcastId)}
      onDelete={(item) => setDeleteTargets([item])}
    />
  ) : (
    <EmptyRecord
      title="Newsletter"
      icon={<MailIcon aria-hidden />}
      line={page.broadcasts.length ? "Click a newsletter to write it here." : "Nothing here yet."}
      hideLabel="Hide the newsletter"
    />
  )

  const rightLabel = view === "templates" ? "Template" : "Newsletter"
  return frame({
    ids,
    showMiddleFor: view,
    showRightFor: openId,
    middle,
    right: { label: rightLabel, showLabel: `Show the ${rightLabel.toLowerCase()}`, content: right },
    windows: (
      <>
        <ConfirmDialog
          open={deleteTargets !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleteTargets(null)
          }}
          title={
            closingDeleteTargets && closingDeleteTargets.length === 1
              ? `Delete ${quoteOneLine(closingDeleteTargets[0]!.name)}?`
              : `Delete ${closingDeleteTargets?.length ?? 0} newsletters?`
          }
          description="The email and everything in it goes for good. Anything already sent stays sent: this cannot unsend it."
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={() => {
            const targets = deleteTargets
            if (!targets) return
            void runDelete(async () => {
              await deleteBroadcasts(targets.map((item) => item.id))
              setDeleteTargets(null)
              selection.clear()
              // The list first, then letting go of the open one, for the same
              // reason as `copy`: the other way round the row stayed on screen.
              await refresh()
              if (openId && targets.some((item) => item.id === openId)) setListSearch({ open: undefined })
            })
          }}
        />
        <ConfirmDialog
          open={templateDelete !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setTemplateDelete(null)
          }}
          title={templateDelete ? `Delete ${quoteOneLine(templateDelete.name)}?` : "Delete this template?"}
          description="The template goes for good. Newsletters already started from it keep their words."
          confirmLabel="Delete"
          onConfirm={() => {
            const target = templateDelete
            if (!target) return
            void deleteBroadcastTemplates([target.id])
              .then(async () => {
                setTemplateDelete(null)
                await refresh()
                setListSearch({ open: undefined })
              })
              .catch((error) => showErrorToast(getBroadcastErrorMessage(error)))
          }}
        />
      </>
    ),
  })
}

/**
 * The header's one primary button: a name, then the newsletter opens on the
 * right to write. Only you see the name.
 */
function NewBroadcastDropdown({ onCreated }: { onCreated: (broadcastId: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [run, creating] = useAsyncAction(getBroadcastErrorMessage)
  return (
    <NewRecordDropdown
      label="New newsletter"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create newsletter"
      busy={creating}
      onSubmit={() =>
        void run(async () => {
          if (!name.trim()) {
            showErrorToast("Give the newsletter a name first.")
            return
          }
          const made = await createBroadcast(name)
          setName("")
          setOpen(false)
          onCreated(made.id)
        })
      }
      trigger={
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New newsletter">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New newsletter</span>
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-broadcast-name">Name</Label>
        <Input
          id="new-broadcast-name"
          autoFocus
          maxLength={255}
          placeholder="March update"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">Only you see this name.</p>
      </div>
    </NewRecordDropdown>
  )
}

/**
 * The All view's sections: Drafts, Scheduled, then Sent (which holds a send
 * still going or paused), each a folding heading with its count. Another view
 * is one state already, so it has no heading.
 */
function sectionsOf(items: BroadcastListItem[], view: CrmBroadcastView) {
  if (view !== "all") return [{ key: view, label: null as string | null, items }]
  const sections = [
    { key: "drafts", label: "Drafts", items: items.filter((item) => item.status === "draft") },
    { key: "scheduled", label: "Scheduled", items: items.filter((item) => item.status === "scheduled") },
    {
      key: "sent",
      label: "Sent",
      items: items.filter((item) => item.status === "sending" || item.status === "paused" || item.status === "sent"),
    },
  ]
  return sections.filter((section) => section.items.length > 0)
}
