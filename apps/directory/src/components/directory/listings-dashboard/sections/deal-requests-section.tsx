import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, InboxIcon, MessageSquareTextIcon, PencilRulerIcon, ReplyIcon, StoreIcon, TagIcon, UserRoundIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote } from "@/components/directory/listings-dashboard/detail-rows"
import { QueueStatusFilter, WaitedChip } from "@/components/directory/listings-dashboard/queue-parts"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { SubmissionDetail as Detail } from "@/components/directory/submission-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  decidePromotionRequestFor,
  getPromotionRequestErrorMessage,
  type PromotionRequest,
  type PromotionRequestsPage,
} from "@/lib/api/promotions/requests"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { dealRequestDecisionMessage } from "@/lib/directory/submission-decision-message"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { dealAdminDaysText } from "@/lib/promotions/deal-days"
import { dealContentLines } from "@/lib/promotions/deal-content"
import { PROMOTION_REQUEST_STATUSES } from "@/lib/promotions/request-status"

const STATUS_LABELS: Record<PromotionRequest["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
}

/**
 * The Deals from owners row: the deals and changes listing owners send from
 * My listings, opening on the ones waiting (Tyler, 18 Nov 2026: "we have to
 * move promotions in the new dashboard too"). It was Admin → Deals from
 * owners, whose rows opened a window.
 *
 * - **Header:** "N selected" (Reject), search, Select, Filter (Status).
 * - **Rows:** how long each has waited, amber from three days.
 * - **Right:** what was sent, or for a change only the lines that differ,
 *   live beside new; who sent it; a note back; Reject or Approve.
 *
 * Approving is one at a time on purpose: it publishes deals, and publishing
 * several unread is what this queue exists to stop. Rejecting several is
 * offered.
 */
export function DealRequestsSection({ data, search, frame, onChanged }: SectionProps<PromotionRequestsPage>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = search.status === "all" ? "all" : statusIn(search.status, PROMOTION_REQUEST_STATUSES)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [refusing, setRefusing] = React.useState<PromotionRequest[] | null>(null)
  const [run, busy] = useAsyncAction(getPromotionRequestErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const listKey = `${q}|${status ?? ""}|${data.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.requests.map((request) => request.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = data.requests.find((request) => request.id === openId) ?? null
  const tickable = data.requests.filter((request) => request.status === "pending").map((request) => request.id)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.requests.filter((request) => selection.selected.has(request.id))

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={InboxIcon} label="Deals from owners" />}
        end={<PanelReopenButton side="right" label="Show the request" />}
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
                  Reject
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for deals from owners"
        search={{
          name: "deal-request-search",
          label: "Search by deal, listing or owner's email",
          placeholder: "Search requests",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <QueueStatusFilter
            id="deal-requests-status"
            value={status}
            waiting="pending"
            options={PROMOTION_REQUEST_STATUSES.map((each) => ({ value: each, label: STATUS_LABELS[each] }))}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Deal", column: "main", className: "min-w-40", sortable: false },
          { key: "waited", label: "Waited", column: "meta", sortable: false },
          { key: "kind", label: "Kind", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
          { key: "days", label: "Days", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "requests", disabled: tickable.length === 0, checked: selection.selectAllState(tickable), onToggle: () => selection.toggleVisible(tickable) }
            : null
        }
        empty={
          data.requests.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="requests" onClear={() => setListSearch({ q: undefined, status: undefined, page: undefined })} />
          ) : status && status !== "pending" ? (
            "Nothing with that status."
          ) : (
            "Nothing is waiting. Deals and changes that owners send from My listings land here."
          )
        }
      >
        {data.requests.map((request) => (
          <CrmTableRow
            key={request.id}
            open={request.id === openId}
            label={request.content.title}
            tick={{
              shown: massSelect,
              ticked: selection.selected.has(request.id),
              none: request.status !== "pending",
              onToggle: () => selection.toggle(request.id),
            }}
            onOpen={() => {
              setPressedId(request.id)
              setOpen(request.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: request.id, x, y })}
          >
            <MainCell name={request.content.title} line={`At ${request.listingTitle}${request.ownerEmail ? ` · ${request.ownerEmail}` : ""}`} />
            <TableCell column="meta">
              {request.status === "pending" ? <WaitedChip since={request.createdAt} /> : <Chip muted>{STATUS_LABELS[request.status]}</Chip>}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @lg:table-cell">
              {request.kind === "new" ? "New deal" : "Change"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {dealAdminDaysText(request.content)}
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
      label: "Deal from an owner",
      showLabel: "Show the request",
      content: openRow ? (
        <DealRequestRecord key={openRow.id} request={openRow} onDecided={() => void onChanged()} />
      ) : (
        <EmptyRecord
          title="Deal from an owner"
          icon={<InboxIcon aria-hidden />}
          line={data.requests.length ? "Click a request to see it here." : "Nothing to read yet."}
          hideLabel="Hide the request"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={refusing !== null}
        onOpenChange={(open) => {
          if (!open) setRefusing(null)
        }}
        title={refusing && refusing.length > 1 ? `Reject ${refusing.length} requests?` : "Reject this request?"}
        description={
          refusing
            ? `Nothing goes live. Each owner is emailed, so ${refusing.length} ${plural(refusing.length, "email goes", "emails go")} out.`
            : null
        }
        confirmLabel={refusing && refusing.length > 1 ? `Reject ${refusing.length}` : "Reject"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!refusing) return
            // One that fails does not stop the rest, and stays ticked
            // (`workspace/docs/changing-many-records.md`).
            const kept: PromotionRequest[] = []
            let notEmailed = 0
            for (const request of refusing) {
              try {
                const { emailed } = await decidePromotionRequestFor({ id: request.id, decision: "reject" })
                if (!emailed) notEmailed += 1
              } catch {
                kept.push(request)
              }
            }
            setRefusing(null)
            selection.setSelected(new Set(kept.map((request) => request.id)))
            await onChanged()
            if (notEmailed) toast.warning(`${notEmailed} ${plural(notEmailed, "owner was", "owners were")} not reached by email. The rejections still hold.`)
            if (kept.length) {
              throw new Error(
                `${refusing.length - kept.length} of ${refusing.length} rejected. ${kept.map((request) => request.content.title).join(", ")} could not be, and ${kept.length === 1 ? "stays" : "stay"} ticked.`
              )
            }
          })
        }
      />
    ),
  })
}

/** One owner's request on the right: what they sent, who they are, a note back, and the two answers. */
function DealRequestRecord({ request, onDecided }: { request: PromotionRequest; onDecided: () => void }) {
  const navigate = useNavigate()
  const [note, setNote] = React.useState("")
  const [run, busy] = useAsyncAction(getPromotionRequestErrorMessage)
  const decided = request.status !== "pending"
  const isChange = request.kind === "change"

  const decide = (decision: "approve" | "reject") =>
    void run(async () => {
      const { emailed } = await decidePromotionRequestFor({ id: request.id, decision, note })
      // Amber, not red: the decision held, but the owner was not reached.
      if (!emailed) toast.warning(dealRequestDecisionMessage(decision, emailed, request.kind))
      onDecided()
    })
  const openDeal = () =>
    request.promotionId
      ? void navigate({ to: "/admin/listings", search: { section: "promotions", open: request.promotionId } })
      : undefined
  const approveLabel = isChange ? "Approve the change" : "Approve and publish"

  return (
    <RecordFrame
      avatar={request.content.coverImage ? <img src={request.content.coverImage} alt="" className="size-6 rounded-md object-cover" /> : <InboxIcon aria-hidden />}
      title={request.content.title || "Deal"}
      line={`${isChange ? "Change" : "New deal"} · ${decided ? STATUS_LABELS[request.status] : `Waiting ${waitedText(request.createdAt)}`}`}
      hideLabel="Hide the request"
      actions={
        <RecordMenu
          label="Request menu"
          actions={[
            {
              label: "Open the listing",
              icon: <StoreIcon className="size-4" />,
              onSelect: () => void navigate({ to: "/admin/listings", search: { open: request.listingId } }),
            },
            ...(request.promotionId && (isChange || request.status === "approved")
              ? [{ label: "Open the deal", icon: <TagIcon className="size-4" />, onSelect: openDeal }]
              : []),
            ...(decided
              ? []
              : [
                  { label: approveLabel, icon: <CheckIcon className="size-4" />, onSelect: () => decide("approve"), disabled: busy },
                  { label: "Reject", icon: <XIcon className="size-4" />, destructive: true, onSelect: () => decide("reject"), disabled: busy },
                ]),
          ]}
        />
      }
      body={
        <>
          {isChange ? (
            <ChangeCard request={request} />
          ) : (
            <PanelCard storageId="deal-request-sent" icon={<InboxIcon />} title="What was sent">
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  A new deal for their own listing, sent on {formatDate(request.createdAt)}. Approving publishes it on the Deals page
                  straight away.
                </p>
                {dealContentLines(request.content).map((line) =>
                  line.label === "Photo" ? (
                    line.value ? (
                      <div key={line.label} className="grid gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Photo</span>
                        <img src={line.value} alt="" className="aspect-video w-full rounded-md border bg-muted/50 object-cover" />
                      </div>
                    ) : (
                      <Detail key={line.label} label="Photo" value={undefined} />
                    )
                  ) : (
                    <Detail key={line.label} label={line.label} value={line.value} multiline />
                  )
                )}
              </div>
            </PanelCard>
          )}
          <PanelCard storageId="deal-request-owner" icon={<UserRoundIcon />} title="Who sent it">
            <div className="grid gap-4">
              <Detail label="Name" value={request.ownerName} />
              <Detail label="Email" value={request.ownerEmail} />
              <Detail label="Listing" value={request.listingTitle} />
            </div>
          </PanelCard>
          {decided ? (
            request.reviewNote ? (
              <PanelCard storageId="deal-request-decided" icon={<MessageSquareTextIcon />} title="The note that was sent">
                <p className="text-sm whitespace-pre-wrap">{request.reviewNote}</p>
              </PanelCard>
            ) : null
          ) : (
            <PanelCard storageId="deal-request-note" icon={<ReplyIcon />} title="A note back">
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Emailed to the owner either way. Optional when approving, worth writing when not.</p>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="deal-request-note">Note</FieldLabel>
                  <CharacterCount value={note} max={500} />
                </div>
                <Textarea id="deal-request-note" rows={3} maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
              </div>
            </PanelCard>
          )}
        </>
      }
      footer={
        decided ? (
          <FooterState>
            <span className="text-muted-foreground">
              {STATUS_LABELS[request.status]}
              {request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ""}
            </span>
          </FooterState>
        ) : (
          <>
            <FooterState>
              <span className="text-muted-foreground">{isChange ? "Approving puts the change live." : "Approving publishes it."}</span>
            </FooterState>
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Reject
            </Button>
            <Button type="button" disabled={busy} onClick={() => decide("approve")}>
              {approveLabel}
            </Button>
          </>
        )
      }
    />
  )
}

/**
 * A change: only the lines that differ, what is live now above what the owner
 * asked for, as the Owner changes row shows a listing's.
 */
function ChangeCard({ request }: { request: PromotionRequest }) {
  const after = dealContentLines(request.content)
  const before = request.live ? dealContentLines(request.live.content) : null
  const changed = after.filter((line, index) => !before || before[index]?.value !== line.value)
  const unchanged = after.filter((line) => !changed.includes(line)).map((line) => line.label.toLowerCase())

  return (
    <PanelCard storageId="deal-request-change" icon={<PencilRulerIcon />} title="Before and after" meta={changed.length || undefined}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {before
            ? `Sent on ${formatDate(request.createdAt)}. The live deal stays as it is until this is approved.${unchanged.length ? ` The ${unchanged.join(", ")} stay as they are.` : ""}`
            : "The deal this changes has been deleted, so there is nothing to compare it with."}
        </p>
        {changed.length === 0 ? (
          <DetailNote>Nothing differs from the live deal.</DetailNote>
        ) : (
          changed.map((line) => {
            const was = before?.find((each) => each.label === line.label)
            return (
              <div key={line.label} className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{line.label}</span>
                <Value caption="Now" value={was?.value ?? ""} photo={line.label === "Photo"} faded />
                <Value caption="Asked for" value={line.value} photo={line.label === "Photo"} />
              </div>
            )
          })
        )}
      </div>
    </PanelCard>
  )
}

function Value({ caption, value, photo, faded = false }: { caption: string; value: string; photo: boolean; faded?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background p-2">
      <span className="text-xs text-muted-foreground">{caption}</span>
      <div className={faded ? "opacity-70" : undefined}>
        {photo && value ? (
          <img src={value} alt="" className="aspect-video w-full rounded-sm object-cover" />
        ) : (
          <p className={`text-sm whitespace-pre-wrap wrap-anywhere ${value ? "" : "text-muted-foreground"}`}>{value || "Nothing"}</p>
        )}
      </div>
    </div>
  )
}
