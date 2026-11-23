import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, ListOrderedIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { SequenceRecord } from "@/components/crm/sequence-records"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell } from "@/components/ui/table"
import {
  createSequence,
  deleteSequences,
  duplicateSequence,
  getSequenceErrorMessage,
  type SequenceItem,
} from "@/lib/api/email/sequences"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import type { CrmBroadcastList, CrmBroadcastSearch, CrmSearch } from "@/lib/crm/crm-search"
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
 * The Broadcasts section's two header tabs, Broadcasts and Sequences (Tyler,
 * 16 Nov 2026: "So we have 2 tabs broadcast and sequence"), beside the
 * section's name as Admin's Pages has its tabs. A switch lets go of the open
 * record, the search and the newsletters' dropdown, which mean nothing on
 * the other list.
 */
export function BroadcastListTabs({
  list,
  counts,
}: {
  list: CrmBroadcastList
  counts: Record<CrmBroadcastList, number>
}) {
  const setListSearch = useListSearchNavigate()
  return (
    <DashboardTabs
      value={list}
      onValueChange={(value) =>
        setListSearch({
          list: value === "sequences" ? "sequences" : undefined,
          open: undefined,
          q: undefined,
          view: undefined,
        })
      }
      tabs={[
        { value: "broadcasts", label: "Broadcasts", count: counts.broadcasts },
        { value: "sequences", label: "Sequences", count: counts.sequences },
      ]}
    />
  )
}

/** "New subscriber welcome", "2 automations", or "Not used yet". */
function usedByText(sequence: SequenceItem) {
  const users = sequence.used_by
  if (users.length === 0) return "Not used yet"
  if (users.length === 1) return users[0]!.name
  return `${users.length} automations`
}

/**
 * The Sequences list: every set of emails on the site, one row each, opened
 * and written on the right (`workspace/docs/email/sequences.md`). A sequence
 * has no start of its own; an automation's Send sequence step sends it.
 */
export function CrmSequencesTab({
  sequences,
  blockDefaults,
  search,
  heading,
  headingEnd,
  frame,
}: {
  sequences: SequenceItem[]
  blockDefaults: BroadcastBlockDefaults
  search: CrmSearch
  /** The section's name and the two tabs. */
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const router = useRouter()
  const listSearch = search as CrmBroadcastSearch
  const setListSearch = useListSearchNavigate()
  const setOpenRecord = useOpenRecord()
  const openId = listSearch.open
  const refresh = () => router.invalidate()

  const query = (listSearch.q ?? "").trim().toLowerCase()
  const shown = sequences.filter((sequence) => !query || sequence.name.toLowerCase().includes(query))
  const ids = shown.map((sequence) => sequence.id)

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, query)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<SequenceItem[] | null>(null)
  const closingDeleteTargets = useLastValue(deleteTargets)
  const [runDelete, deleting] = useAsyncAction(getSequenceErrorMessage)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  /** The list read again first, then the new row opened, as the newsletters do. */
  const openAfterRefresh = async (id: string) => {
    await refresh()
    setListSearch({ q: undefined, open: id })
  }

  const copy = async (id: string) => {
    try {
      const made = await duplicateSequence(id)
      await openAfterRefresh(made.id)
    } catch (error) {
      showErrorToast(getSequenceErrorMessage(error))
    }
  }

  const ticked = shown.filter((sequence) => selection.selected.has(sequence.id))
  const openSequence = sequences.find((sequence) => sequence.id === openId) ?? null

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
        primary={<NewSequenceDropdown onCreated={(id) => void openAfterRefresh(id)} />}
        menuLabel="More for sequences"
        search={{
          name: "sequence-search",
          label: "Search sequences",
          placeholder: "Search sequences",
          value: listSearch.q ?? "",
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      <CrmTable
        columns={[
          { key: "name", label: "Sequence", sortable: false, column: "main", className: "min-w-40" },
          { key: "emails", label: "Emails", sortable: false, column: "preview" },
          { key: "used", label: "Used by", sortable: false, column: "preview", className: "min-w-40" },
          { key: "progress", label: "In progress", sortable: false, column: "preview", className: "hidden md:hidden @3xl:table-cell" },
          { key: "finished", label: "Finished", sortable: false, column: "preview", className: "hidden md:hidden @4xl:table-cell" },
          { key: "changed", label: "Changed", sortable: false, column: "meta" },
        ]}
        sort="changed"
        direction="desc"
        onSort={() => undefined}
        select={
          massSelect
            ? {
                noun: "sequences",
                disabled: shown.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          shown.length ? null : query ? (
            <span className="grid justify-items-center gap-2">
              No sequence matches "{query}".
              <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                Clear filters
              </Button>
            </span>
          ) : (
            "No sequence yet. New sequence starts one."
          )
        }
      >
        {shown.map((sequence) => {
          const emails = sequence.steps?.emails.length ?? 0
          return (
            <CrmTableRow
              key={sequence.id}
              open={sequence.id === openId}
              label={sequence.name}
              tick={{ shown: massSelect, ticked: selection.selected.has(sequence.id), onToggle: () => selection.toggle(sequence.id) }}
              onOpen={() => setOpenRecord(sequence.id)}
              onDelete={() => setDeleteTargets([sequence])}
              onRightClick={(x, y) => setRightClick({ id: sequence.id, x, y })}
            >
              <MainCell name={sequence.name} />
              <TableCell column="preview">
                <Chip muted>
                  {emails} {plural(emails, "email")}
                </Chip>
              </TableCell>
              <TableCell column="preview" className="max-w-64 min-w-40">
                <span className="block truncate text-muted-foreground">{usedByText(sequence)}</span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @3xl:table-cell">
                {sequence.in_progress}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @4xl:table-cell">
                {sequence.finished}
              </TableCell>
              <TableCell column="mutedMeta">{formatInboxTime(sequence.updated_at)}</TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
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
                const item = sequences.find((entry) => entry.id === rightClick.id)
                if (item) setDeleteTargets([item])
              },
            },
          ]}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  const right = openSequence ? (
    <SequenceRecord
      key={openSequence.id}
      initial={openSequence}
      blockDefaults={blockDefaults}
      onListChanged={() => void refresh()}
      onCopy={(id) => void copy(id)}
      onDelete={(item) => setDeleteTargets([item])}
    />
  ) : (
    <EmptyRecord
      title="Sequence"
      icon={<ListOrderedIcon aria-hidden />}
      line={
        sequences.length
          ? "Click a sequence to write its emails here."
          : "A sequence is a set of emails sent days apart. An automation's Send sequence step sends it. New sequence starts one."
      }
      hideLabel="Hide the sequence"
    />
  )

  return frame({
    ids,
    showMiddleFor: "sequences",
    showRightFor: openId,
    middle,
    right: { label: "Sequence", showLabel: "Show the sequence", content: right },
    windows: (
      <ConfirmDialog
        open={deleteTargets !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTargets(null)
        }}
        title={
          closingDeleteTargets && closingDeleteTargets.length === 1
            ? `Delete ${quoteOneLine(closingDeleteTargets[0]!.name)}?`
            : `Delete ${closingDeleteTargets?.length ?? 0} sequences?`
        }
        description="The sequence and its emails go for good. People partway through get nothing more from it. Emails already sent stay sent."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => {
          const targets = deleteTargets
          if (!targets) return
          void runDelete(async () => {
            await deleteSequences(targets.map((item) => item.id))
            setDeleteTargets(null)
            selection.clear()
            await refresh()
            if (openId && targets.some((item) => item.id === openId)) setListSearch({ open: undefined })
          })
        }}
      />
    ),
  })
}

/**
 * The header's primary button: a name, then the sequence opens on the right
 * with one empty email. Who gets it is set in an automation.
 */
function NewSequenceDropdown({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [run, creating] = useAsyncAction(getSequenceErrorMessage)
  return (
    <NewRecordDropdown
      label="New sequence"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create sequence"
      busy={creating}
      onSubmit={() =>
        void run(async () => {
          if (!name.trim()) {
            showErrorToast("Give the sequence a name first.")
            return
          }
          const made = await createSequence(name)
          setName("")
          setOpen(false)
          onCreated(made.id)
        })
      }
      trigger={
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New sequence">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New sequence</span>
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-sequence-name">Name</Label>
        <Input
          id="new-sequence-name"
          autoFocus
          maxLength={80}
          placeholder="Welcome series"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </NewRecordDropdown>
  )
}
