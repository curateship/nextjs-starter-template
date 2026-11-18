import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { AtSignIcon, MailIcon, SendIcon, StoreIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote, DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell } from "@/components/ui/table"
import { getListingsDashboardErrorMessage, loadListingSends } from "@/lib/api/directory/listings-dashboard"
import { getOutreachErrorMessage, sendOutreach, type loadOutreach } from "@/lib/api/directory/outreach"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Data = Awaited<ReturnType<typeof loadOutreach>>
type Row = Data["listings"][number]

/** One send carries this many, the most the server takes at once. */
const SEND_GROUP = 50

function stateOf(row: Row) {
  if (row.status === "opted_out") return "Opted out"
  if (row.sendStatus === "sent") return "Already contacted"
  if (row.status === "sent") return "Already tried"
  return "Ready"
}

/**
 * The Outreach row: published listings nobody owns yet that have a contact
 * email, to invite their owners to claim them. It was the Claim outreach
 * page, which no menu linked to; its Send history is an Overview widget now.
 *
 * - **Header:** "N selected" (Send invitations), search, Select. Ticks
 *   survive paging, and the count is the whole selection, so nothing goes to
 *   rows somebody has scrolled away from unaware.
 * - **Sending more than 50:** split into groups of 50 by itself (Tyler's
 *   polish pick, 18 Nov 2026: "Sending to more than 50 owners splits into
 *   groups of 50 by itself instead of greying out Send"), with the count of
 *   how far it got.
 * - **Right:** the listing's owner email, its last invitation and every
 *   one sent, and Send invitation in the footer (Tyler's polish pick: "An
 *   Outreach row opens the listing on the right").
 */
export function OutreachSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const rows = data.listings
  const ids = rows.map((row) => row.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = rows.find((row) => row.id === openId) ?? null
  const [massSelect, setMassSelect] = React.useState(false)
  // Kept across pages on purpose, unlike the other rows' selections.
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [sending, setSending] = React.useState<string[] | null>(null)
  const [progress, setProgress] = React.useState<string | null>(null)
  const [run, busy] = useAsyncAction(getOutreachErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  const ready = rows.filter((row) => row.status === "ready").map((row) => row.id)
  const ticked = [...selection.selected]

  /** Sends in groups of 50, one after the other, and says how far it got if one is refused. */
  const send = (list: string[]) =>
    void run(async () => {
      let sent = 0
      try {
        for (let start = 0; start < list.length; start += SEND_GROUP) {
          const group = list.slice(start, start + SEND_GROUP)
          setProgress(list.length > SEND_GROUP ? `Sending ${Math.min(start + group.length, list.length)} of ${list.length}` : "Sending")
          await sendOutreach(group)
          sent += group.length
        }
      } catch (error) {
        if (sent) {
          throw new Error(`${sent} of ${list.length} sent. ${getOutreachErrorMessage(error)}`, { cause: error })
        }
        throw error
      } finally {
        setProgress(null)
        setSending(null)
        selection.clear()
        await onChanged()
      }
    })

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && ready.includes(tickId)) selection.setSelected(new Set([tickId]))
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={SendIcon} label="Outreach" />}
        end={<PanelReopenButton side="right" label="Show the listing" />}
        selected={
          massSelect && ticked.length ? (
            progress ? (
              <span className="text-sm text-muted-foreground" role="status">
                {progress}
              </span>
            ) : (
              <SelectedMenu
                count={ticked.length}
                busy={busy}
                onClear={selection.clear}
                pages={{}}
                main={(menu) => (
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      setSending(ticked)
                    }}
                  >
                    <MailIcon className="size-4" />
                    Send invitations
                  </SelectedMenuRow>
                )}
              />
            )
          ) : null
        }
        menuLabel="More for outreach"
        search={{
          name: "outreach-search",
          label: "Search outreach by listing title or contact email",
          placeholder: "Search listings",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Listing", column: "main", className: "min-w-40", sortable: false },
          { key: "state", label: "Status", column: "meta", sortable: false },
          { key: "last", label: "Last invitation", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? {
                noun: "listings ready for outreach on this page",
                disabled: ready.length === 0,
                checked: selection.selectAllState(ready),
                onToggle: () => selection.toggleVisible(ready),
              }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="listings" onClear={() => setListSearch({ q: undefined, page: undefined })} />
          ) : (
            "No unclaimed published listing has a contact email on this site."
          )
        }
      >
        {rows.map((row) => (
          <CrmTableRow
            key={row.id}
            open={row.id === openId}
            label={row.title}
            tick={{ shown: massSelect, ticked: selection.selected.has(row.id), none: row.status !== "ready", onToggle: () => selection.toggle(row.id) }}
            onOpen={() => {
              setPressedId(row.id)
              setOpen(row.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
          >
            <MainCell name={row.title} line={row.email} />
            <TableCell column="meta">
              <Chip muted>{stateOf(row)}</Chip>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              {row.sentAt ? formatDate(row.sentAt) : "Never"}
              {row.sendStatus === "failed" ? <span className="ml-1 text-destructive">Failed</span> : null}
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
    showMiddleFor: `${q}|${data.page}`,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Listing",
      showLabel: "Show the listing",
      content: openRow ? (
        <OutreachRecord key={openRow.id} row={openRow} busy={busy} onSend={() => setSending([openRow.id])} />
      ) : (
        <EmptyRecord
          title="Listing"
          icon={<SendIcon aria-hidden />}
          line={data.total ? "Click a listing to see it here." : "Nothing to invite yet."}
          hideLabel="Hide the listing"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={sending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setSending(null)
        }}
        title={sending && sending.length > 1 ? `Send ${sending.length} invitations?` : "Send this invitation?"}
        description={
          sending
            ? sending.length > SEND_GROUP
              ? `Each owner gets one email asking them to claim their listing. ${sending.length} go out in groups of ${SEND_GROUP}, one after the other.`
              : `Each owner gets one email asking them to claim their listing, so ${sending.length} ${plural(sending.length, "email goes", "emails go")} out.`
            : null
        }
        confirmLabel={sending && sending.length > 1 ? `Send ${sending.length}` : "Send invitation"}
        loading={busy}
        onConfirm={() => {
          if (sending) send(sending)
        }}
      />
    ),
  })
}

/** One listing on the right: who would be written to, and every invitation sent so far. */
function OutreachRecord({ row, busy, onSend }: { row: Row; busy: boolean; onSend: () => void }) {
  const navigate = useNavigate()
  const sends = useLoad(() => loadListingSends(row.id), getListingsDashboardErrorMessage, { keys: [row.id, row.sentAt?.toString()] })
  return (
    <RecordFrame
      avatar={<SendIcon aria-hidden />}
      title={row.title}
      line={stateOf(row)}
      hideLabel="Hide the listing"
      actions={
        <RecordMenu
          label="Outreach menu"
          actions={[{ label: "Open the listing", icon: <StoreIcon className="size-4" />, onSelect: () => void navigate({ to: "/admin/listings", search: { open: row.id } }) }]}
        />
      }
      body={
        <>
          <PanelCard storageId="outreach-owner" icon={<AtSignIcon />} title="Who it goes to">
            <DetailRows>
              <DetailRow label="Owner email" value={row.email} />
              <DetailRow label="Last invitation" value={row.sentAt ? formatDate(row.sentAt) : "Never"} />
            </DetailRows>
            {row.sendStatus === "failed" && row.error ? <p className="mt-2 text-sm text-destructive">The last one failed: {row.error}</p> : null}
            {row.status === "opted_out" ? <DetailNote>They asked not to be written to again.</DetailNote> : null}
          </PanelCard>
          <PanelCard storageId="outreach-sends" icon={<MailIcon />} title="Sends" meta={sends.data?.length || undefined}>
            {sends.error ? (
              <ErrorRow message={sends.error} onRetry={sends.retry} />
            ) : !sends.data ? (
              <LoadingRow label="Reading…" />
            ) : sends.data.length ? (
              <DetailRows>
                {sends.data.map((send) => (
                  <DetailRow
                    key={send.id}
                    label={formatDate(send.at)}
                    value={send.status === "failed" ? `Failed: ${send.error || "no reason given"}` : send.status === "sent" ? `Sent to ${send.email}` : "Sending"}
                  />
                ))}
              </DetailRows>
            ) : (
              <DetailNote>No invitation has been sent about this listing yet.</DetailNote>
            )}
          </PanelCard>
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">Not claimed</span>
          </FooterState>
          {row.status === "ready" ? (
            <Button type="button" disabled={busy} onClick={onSend}>
              <MailIcon />
              Send invitation
            </Button>
          ) : null}
        </>
      }
    />
  )
}
