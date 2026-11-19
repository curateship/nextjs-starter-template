import * as React from "react"
import { Trash2Icon, UsersIcon } from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { ListPager, NoMatches, useOpenFirstRow } from "@/components/directory/listings-dashboard/section-parts"
import { EventRecord } from "@/components/events/events-dashboard/event-record"
import type { EventsLoaded, EventsSectionProps } from "@/components/events/events-dashboard/load-section"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import type { SignUpRow } from "@/lib/api/events/events-dashboard"
import { getSignUpErrorMessage, removeEventSignUp } from "@/lib/api/events/sign-ups"
import { SIGN_UP_FILTER_LABELS, SIGN_UP_FILTERS } from "@/lib/events/events-dashboard-search"
import { formatWallClock } from "@/lib/events/event-time"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Data = Extract<EventsLoaded, { section: "signups" }>

const STATUS_WORDS: Record<SignUpRow["status"], string> = {
  confirmed: "Coming",
  waiting: "Waiting",
  offered: "Seat held",
}

/**
 * The Sign-ups row (task events/37, Part 1): everyone signed up across the
 * site's events, newest first, with the event they are for. Filter shows who
 * is coming (the default), who is waiting for a seat, or both. A row opens
 * its event on the right, where its Sign-ups card is; that is where somebody
 * is added by hand. Removing somebody here is the same as the bin in that
 * card: their seat is freed, and the waiting list is offered it.
 */
export function SignUpsSection({ data, search, frame, onChanged }: EventsSectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const page = data.page
  const q = search.q ?? ""
  const who = search.who ?? "coming"
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<SignUpRow[] | null>(null)
  const [run, busy] = useAsyncAction(getSignUpErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  /** Bumped after a removal, so the event on the right reads its lists again. */
  const [recordRead, setRecordRead] = React.useState(0)

  const listKey = `${q}|${who}|${page.page}|${page.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const rows = page.rows
  const ids = rows.map((row) => row.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = rows.find((row) => row.id === openId) ?? null
  const ticked = rows.filter((row) => selection.selected.has(row.id))
  const rightClicked = rightClick ? rows.find((row) => row.id === rightClick.id) : undefined

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={UsersIcon} label="Sign-ups" />}
        end={<PanelReopenButton side="right" label="Show the event" />}
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
                    setConfirm(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Remove from the list
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for sign-ups"
        search={{
          name: "sign-up-search",
          label: "Search sign-ups by name, email or event",
          placeholder: "Search sign-ups",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={who === "coming" ? 0 : 1}
            onClear={() => setListSearch({ who: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="sign-ups-who" label="Show">
              <Select
                value={who}
                onValueChange={(value) => setListSearch({ who: value === "coming" ? undefined : value, page: undefined })}
              >
                <SelectTrigger id="sign-ups-who" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGN_UP_FILTERS.map((each) => (
                    <SelectItem key={each} value={each}>
                      {SIGN_UP_FILTER_LABELS[each]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={null}
      />
      <CrmTable<"person">
        columns={[
          { key: "person", label: "Person", column: "main", className: "min-w-40", sortable: false },
          { key: "event", label: "Event", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
          { key: "when", label: "Signed up", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="person"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? {
                noun: "sign-ups",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="sign-ups" onClear={() => setListSearch({ q: undefined, page: undefined })} />
          ) : who === "waiting" ? (
            "Nobody is waiting for a seat."
          ) : (
            "Nobody has signed up yet. Switch on Take sign-ups in an event's Sign-ups card."
          )
        }
      >
        {rows.map((row) => (
          <CrmTableRow
            key={row.id}
            open={row.id === openId}
            label={row.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) }}
            onOpen={() => {
              setPressedId(row.id)
              setOpen(row.id)
            }}
            onDelete={() => setConfirm([row])}
            onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
          >
            <MainCell name={row.name} line={row.answer ? `${row.email} · ${row.answer}` : row.email} />
            <TableCell column="mutedMeta" className="hidden md:hidden @lg:table-cell">
              {row.eventTitle}, {formatWallClock(row.eventStart)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              <Badge variant={row.status === "confirmed" ? "secondary" : "outline"}>{STATUS_WORDS[row.status]}</Badge>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={page.page} pageSize={page.pageSize} total={page.total} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={[
            {
              label: "Remove from the list",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              onSelect: () => setConfirm([rightClicked]),
            },
          ]}
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
      label: "Event",
      showLabel: "Show the event",
      content: openRow ? (
        <EventRecord
          key={`${openRow.eventId}:${recordRead}`}
          eventId={openRow.eventId}
          title={openRow.eventTitle}
          categories={data.categories}
          onSaved={() => void onChanged()}
          onOpenEvent={(id) => void setListSearch({ section: undefined, open: id, q: undefined, who: undefined, page: undefined })}
        />
      ) : (
        <EmptyRecord
          title="Event"
          icon={<UsersIcon aria-hidden />}
          line="Click a sign-up to see its event here."
          hideLabel="Hide the event"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm && confirm.length === 1 ? "Take them off the list?" : `Take ${confirm?.length ?? 0} people off their lists?`}
        description={
          confirm && confirm.length === 1
            ? `${confirm[0]!.name} (${confirm[0]!.email}) comes off the list for ${confirm[0]!.eventTitle}, and their seat is freed. They can sign up again while a seat is free.`
            : "Each comes off their event's list, and their seats are freed for the waiting lists."
        }
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            for (const row of confirm) await removeEventSignUp({ eventId: row.eventId, signUpId: row.id })
            selection.clear()
            setConfirm(null)
            setRecordRead((count) => count + 1)
            await onChanged()
          })
        }
      />
    ),
  })
}
