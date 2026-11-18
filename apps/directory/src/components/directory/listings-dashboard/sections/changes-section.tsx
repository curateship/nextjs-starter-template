import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, MessageSquareTextIcon, PencilRulerIcon, ReplyIcon, StoreIcon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { ChangedValue } from "@/components/directory/edit-request-parts"
import { DetailNote } from "@/components/directory/listings-dashboard/detail-rows"
import { QueueStatusFilter, WaitedChip } from "@/components/directory/listings-dashboard/queue-parts"
import { NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { decideEditRequest, getClaimErrorMessage, type ClaimsScreen } from "@/lib/api/directory/claims"
import { getListingErrorMessage } from "@/lib/api/directory/listings"
import { forgetListings, getListing } from "@/lib/directory/listing-cache"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { EDIT_REQUEST_STATUS_LABELS, EDIT_REQUEST_STATUSES, OWNER_EDITABLE_FIELDS } from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Change = ClaimsScreen["requests"][number]

/**
 * The Owner changes row: what listing owners have asked to change, opening
 * on the ones waiting. It was the second table of the Claims page; a row of
 * its own here, since a row of the Dashboards block has one header only.
 *
 * - **Header:** "N selected" (Turn down), search, Select, Filter (Status).
 * - **Rows:** how long each has waited, amber from three days.
 * - **Right:** each field they touched, what the listing says now above
 *   what they asked for (Tyler's polish pick, 18 Nov 2026: "An owner's edit
 *   request shows the listing's current value beside the requested one"),
 *   a note back, and Turn down or Apply the changes.
 *
 * Applying is one at a time on purpose: applying several people's edits
 * unread is what this queue exists to stop. Turning several down is offered.
 */
export function ChangesSection({ data, search, frame, onChanged }: SectionProps<ClaimsScreen>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = search.status === "all" ? "all" : statusIn(search.status, EDIT_REQUEST_STATUSES)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [refusing, setRefusing] = React.useState<Change[] | null>(null)
  const [run, busy] = useAsyncAction(getClaimErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  // Few enough to search in the browser: the server keeps no more than one screen of them.
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data.requests
    return data.requests.filter((change) => `${change.listingTitle} ${change.ownerName} ${change.ownerEmail}`.toLowerCase().includes(needle))
  }, [data.requests, q])
  useClearSelectionOnListChange(selection.setSelected, `${q}|${status ?? ""}`)
  const ids = rows.map((change) => change.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = data.requests.find((change) => change.id === openId) ?? null
  const tickable = rows.filter((change) => change.status === "pending").map((change) => change.id)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = rows.filter((change) => selection.selected.has(change.id))

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={PencilRulerIcon} label="Owner changes" />}
        end={<PanelReopenButton side="right" label="Show the change" />}
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
                    setRefusing(ticked)
                  }}
                >
                  <XIcon className="size-4" />
                  Turn down
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for owner changes"
        search={{
          name: "owner-change-search",
          label: "Search owner changes by listing, name or email",
          placeholder: "Search changes",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <QueueStatusFilter
            id="changes-status"
            value={status}
            waiting="pending"
            options={EDIT_REQUEST_STATUSES.map((each) => ({ value: each, label: EDIT_REQUEST_STATUS_LABELS[each] }))}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Listing", column: "main", className: "min-w-40", sortable: false },
          { key: "waited", label: "Waited", column: "meta", sortable: false },
          { key: "fields", label: "Changes", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "changes", disabled: tickable.length === 0, checked: selection.selectAllState(tickable), onToggle: () => selection.toggleVisible(tickable) }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="changes" onClear={() => setListSearch({ q: undefined, status: undefined })} />
          ) : status && status !== "pending" ? (
            "Nothing with that status."
          ) : (
            "Nothing is waiting. Owners' changes appear here before they go live."
          )
        }
      >
        {rows.map((change) => {
          const touched = OWNER_EDITABLE_FIELDS.filter((field) => change.changes[field.key] !== undefined)
          return (
            <CrmTableRow
              key={change.id}
              open={change.id === openId}
              label={change.listingTitle}
              tick={{
                shown: massSelect,
                ticked: selection.selected.has(change.id),
                none: change.status !== "pending",
                onToggle: () => selection.toggle(change.id),
              }}
              onOpen={() => {
                setPressedId(change.id)
                setOpen(change.id)
              }}
              onRightClick={(x, y) => setRightClick({ id: change.id, x, y })}
            >
              <MainCell name={change.listingTitle} line={`${change.ownerName} · ${change.ownerEmail}`} />
              <TableCell column="meta">
                {change.status === "pending" ? (
                  <WaitedChip since={change.createdAt} />
                ) : (
                  <Chip muted>{EDIT_REQUEST_STATUS_LABELS[change.status]}</Chip>
                )}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                <span className="block max-w-56 truncate">{touched.map((field) => field.label).join(", ") || "Nothing"}</span>
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
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
    showMiddleFor: `${q}|${status ?? ""}`,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Owner change",
      showLabel: "Show the change",
      content: openRow ? (
        <ChangeRecord key={openRow.id} change={openRow} onDecided={() => void onChanged()} />
      ) : (
        <EmptyRecord
          title="Owner change"
          icon={<PencilRulerIcon aria-hidden />}
          line={data.requests.length ? "Click a change to see it here." : "Nothing to read yet."}
          hideLabel="Hide the change"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={refusing !== null}
        onOpenChange={(open) => {
          if (!open) setRefusing(null)
        }}
        title={refusing && refusing.length > 1 ? `Turn down ${refusing.length} changes?` : "Turn down this change?"}
        description={
          refusing
            ? `Nothing on the listings changes. Each owner is emailed, so ${refusing.length} ${plural(refusing.length, "email goes", "emails go")} out.`
            : null
        }
        confirmLabel={refusing && refusing.length > 1 ? `Turn down ${refusing.length}` : "Turn down"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!refusing) return
            const failed: string[] = []
            for (const change of refusing) {
              try {
                await decideEditRequest({ id: change.id, decision: "reject" })
              } catch {
                failed.push(change.listingTitle)
              }
            }
            setRefusing(null)
            selection.clear()
            await onChanged()
            if (failed.length) {
              throw new Error(`${refusing.length - failed.length} of ${refusing.length} turned down. ${failed.join(", ")} could not be, and stay waiting.`)
            }
          })
        }
      />
    ),
  })
}

/** One owner change on the right: each touched field, now and asked for, then a note back. */
function ChangeRecord({ change, onDecided }: { change: Change; onDecided: () => void }) {
  const navigate = useNavigate()
  const [note, setNote] = React.useState("")
  const [run, busy] = useAsyncAction(getClaimErrorMessage)
  const decided = change.status !== "pending"
  // What the listing says now, for the before line of each field.
  const current = useLoad(() => getListing(change.listingId).then((record) => ({ record })), getListingErrorMessage, {
    keys: [change.listingId],
  })
  const now = current.data?.record?.listing
  const touched = OWNER_EDITABLE_FIELDS.filter((field) => change.changes[field.key] !== undefined)
  const decide = (decision: "approve" | "reject") =>
    void run(async () => {
      await decideEditRequest({ id: change.id, decision, note })
      // An applied change rewrote the listing, so its kept copy is stale.
      if (decision === "approve") forgetListings()
      onDecided()
    })
  const openListing = () => void navigate({ to: "/admin/listings", search: { open: change.listingId } })

  return (
    <RecordFrame
      avatar={<PencilRulerIcon aria-hidden />}
      title={change.listingTitle}
      line={decided ? EDIT_REQUEST_STATUS_LABELS[change.status] : `Waiting ${waitedText(change.createdAt)}`}
      hideLabel="Hide the change"
      actions={
        <RecordMenu
          label="Owner change menu"
          actions={[
            { label: "Open the listing", icon: <StoreIcon className="size-4" />, onSelect: openListing },
            ...(decided
              ? []
              : [
                  { label: "Apply the changes", icon: <CheckIcon className="size-4" />, onSelect: () => decide("approve"), disabled: busy },
                  { label: "Turn down", icon: <XIcon className="size-4" />, destructive: true, onSelect: () => decide("reject"), disabled: busy },
                ]),
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="owner-change-fields" icon={<PencilRulerIcon />} title="Before and after" meta={touched.length || undefined}>
            {touched.length ? (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Asked for by {change.ownerName} on {formatDate(change.createdAt)}.
                </p>
                {touched.map((field) => (
                  <div key={field.key} className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                    <div className="grid gap-1 rounded-md border bg-background p-2">
                      <span className="text-xs text-muted-foreground">Now</span>
                      {now ? (
                        <div className="opacity-70">
                          <ChangedValue
                            field={field.key}
                            changes={{
                              title: now.title,
                              metaDescription: now.metaDescription,
                              featuredImage: now.featuredImage,
                              contactLinks: now.contactLinks,
                              body: now.body,
                            }}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{current.error ? "Could not read the listing." : "Reading…"}</p>
                      )}
                    </div>
                    <div className="grid gap-1 rounded-md border bg-background p-2">
                      <span className="text-xs text-muted-foreground">Asked for</span>
                      <ChangedValue field={field.key} changes={change.changes} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <DetailNote>Nothing was changed.</DetailNote>
            )}
          </PanelCard>
          {decided ? (
            change.reviewNote ? (
              <PanelCard storageId="owner-change-decided" icon={<MessageSquareTextIcon />} title="The note that was sent">
                <p className="text-sm whitespace-pre-wrap">{change.reviewNote}</p>
              </PanelCard>
            ) : null
          ) : (
            <PanelCard storageId="owner-change-note" icon={<ReplyIcon />} title="A note back">
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Emailed to them either way.</p>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="edit-request-note">Note</FieldLabel>
                  <CharacterCount value={note} max={500} />
                </div>
                <Textarea id="edit-request-note" rows={3} maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
              </div>
            </PanelCard>
          )}
        </>
      }
      footer={
        decided ? (
          <FooterState>
            <span className="text-muted-foreground">
              {EDIT_REQUEST_STATUS_LABELS[change.status]}
              {change.reviewedAt ? ` on ${formatDate(change.reviewedAt)}` : ""}
            </span>
          </FooterState>
        ) : (
          <>
            <FooterState>
              <span className="text-muted-foreground">Applying puts it live at once.</span>
            </FooterState>
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Turn down
            </Button>
            <Button type="button" disabled={busy} onClick={() => decide("approve")}>
              Apply the changes
            </Button>
          </>
        )
      }
    />
  )
}
