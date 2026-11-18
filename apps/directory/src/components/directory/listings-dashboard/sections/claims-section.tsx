import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BadgeCheckIcon, CheckIcon, MailCheckIcon, MessageSquareTextIcon, ReplyIcon, StoreIcon, UserRoundIcon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { QueueStatusFilter, WaitedChip } from "@/components/directory/listings-dashboard/queue-parts"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { decideClaim, getClaimErrorMessage, type ClaimsScreen } from "@/lib/api/directory/claims"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { REVIEW_STATUS_LABELS, REVIEW_STATUSES } from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Claim = ClaimsScreen["claims"][number]

/**
 * The Claims row: people asking to look after a listing, opening on the
 * ones waiting. It was the top table of the Claims page, which no menu
 * linked to; the owners' changes under it are the Owner changes row, and
 * the claim settings beside it are the Claims tab of the left page's ⋮.
 *
 * - **Header:** "N selected" (Reject), search, Select, Filter (Status).
 * - **Rows:** how long each has waited, amber from three days.
 * - **Right:** the address they proved and the account that gets the
 *   listing, a note back, and Reject or Hand them the listing.
 *
 * Approving is one at a time on purpose: handing out several listings
 * unread is what this queue exists to stop. Rejecting several at once is
 * offered, so a run of spam clears in one go (Tyler, 18 Nov 2026, when the
 * mock showed it: "go").
 */
export function ClaimsSection({ data, search, frame, onChanged }: SectionProps<ClaimsScreen>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = search.status === "all" ? "all" : statusIn(search.status, REVIEW_STATUSES)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [rejecting, setRejecting] = React.useState<Claim[] | null>(null)
  const [run, busy] = useAsyncAction(getClaimErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const listKey = `${q}|${status ?? ""}|${data.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.claims.map((claim) => claim.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = data.claims.find((claim) => claim.id === openId) ?? null
  const tickable = data.claims.filter((claim) => claim.status === "pending_review").map((claim) => claim.id)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.claims.filter((claim) => selection.selected.has(claim.id))

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={BadgeCheckIcon} label="Claims" />}
        end={<PanelReopenButton side="right" label="Show the claim" />}
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
                    setRejecting(ticked)
                  }}
                >
                  <XIcon className="size-4" />
                  Reject
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for claims"
        search={{
          name: "claim-search",
          label: "Search claims by listing, name or email",
          placeholder: "Search claims",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <QueueStatusFilter
            id="claims-status"
            value={status}
            waiting="pending_review"
            options={REVIEW_STATUSES.filter((each) => each !== "pending_verification").map((each) => ({
              value: each,
              label: REVIEW_STATUS_LABELS[each],
            }))}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Listing", column: "main", className: "min-w-40", sortable: false },
          { key: "waited", label: "Waited", column: "meta", sortable: false },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "domain", label: "Email", column: "meta", className: "hidden md:hidden @3xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "claims", disabled: tickable.length === 0, checked: selection.selectAllState(tickable), onToggle: () => selection.toggleVisible(tickable) }
            : null
        }
        empty={
          data.claims.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="claims" onClear={() => setListSearch({ q: undefined, status: undefined, page: undefined })} />
          ) : status && status !== "pending_review" ? (
            "Nothing with that status."
          ) : (
            "Nothing is waiting. Owners asking to look after a listing appear here."
          )
        }
      >
        {data.claims.map((claim) => (
          <CrmTableRow
            key={claim.id}
            open={claim.id === openId}
            label={claim.listingTitle}
            tick={{
              shown: massSelect,
              ticked: selection.selected.has(claim.id),
              none: claim.status !== "pending_review",
              onToggle: () => selection.toggle(claim.id),
            }}
            onOpen={() => {
              setPressedId(claim.id)
              setOpen(claim.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: claim.id, x, y })}
          >
            <MainCell name={claim.listingTitle} line={`${claim.claimantName} · ${claim.contactEmail}`} />
            <TableCell column="meta">
              {claim.status === "pending_review" ? (
                <WaitedChip since={claim.createdAt} />
              ) : (
                <span className="text-muted-foreground">{formatDate(claim.createdAt)}</span>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @xl:table-cell">
              <Chip muted>{REVIEW_STATUS_LABELS[claim.status]}</Chip>
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @3xl:table-cell">
              <Chip muted>{claim.emailDomainMatches ? "Listing's domain" : "Other domain"}</Chip>
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
      label: "Claim",
      showLabel: "Show the claim",
      content: openRow ? (
        <ClaimRecord key={openRow.id} claim={openRow} onDecided={() => void onChanged()} />
      ) : (
        <EmptyRecord
          title="Claim"
          icon={<BadgeCheckIcon aria-hidden />}
          line={data.total ? "Click a claim to see it here." : "Nothing to read yet."}
          hideLabel="Hide the claim"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null)
        }}
        title={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length} claims?` : "Reject this claim?"}
        description={
          rejecting
            ? `Each person asking is emailed that the listing is not theirs, so ${rejecting.length} ${plural(rejecting.length, "email goes", "emails go")} out.`
            : null
        }
        confirmLabel={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length}` : "Reject"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!rejecting) return
            const failed: string[] = []
            for (const claim of rejecting) {
              try {
                await decideClaim({ id: claim.id, decision: "reject" })
              } catch {
                failed.push(claim.listingTitle)
              }
            }
            setRejecting(null)
            selection.clear()
            await onChanged()
            if (failed.length) {
              throw new Error(`${rejecting.length - failed.length} of ${rejecting.length} rejected. ${failed.join(", ")} could not be, and stay waiting.`)
            }
          })
        }
      />
    ),
  })
}

/**
 * One claim on the right. The email-domain check comes first because it is
 * the fastest way to a yes; a mismatch is stated as a fact, not a warning,
 * since plenty of real owners use a Gmail address.
 */
function ClaimRecord({ claim, onDecided }: { claim: Claim; onDecided: () => void }) {
  const navigate = useNavigate()
  const [note, setNote] = React.useState("")
  const [run, busy] = useAsyncAction(getClaimErrorMessage)
  const decided = claim.status !== "pending_review"
  const decide = (decision: "approve" | "reject") =>
    void run(async () => {
      await decideClaim({ id: claim.id, decision, note })
      onDecided()
    })
  const openListing = () => void navigate({ to: "/admin/listings", search: { open: claim.listingId } })

  return (
    <RecordFrame
      avatar={<BadgeCheckIcon aria-hidden />}
      title={claim.listingTitle}
      line={decided ? REVIEW_STATUS_LABELS[claim.status] : `Waiting ${waitedText(claim.createdAt)}`}
      hideLabel="Hide the claim"
      actions={
        <RecordMenu
          label="Claim menu"
          actions={[
            { label: "Open the listing", icon: <StoreIcon className="size-4" />, onSelect: openListing },
            ...(decided
              ? []
              : [
                  { label: "Hand them the listing", icon: <CheckIcon className="size-4" />, onSelect: () => decide("approve"), disabled: busy },
                  { label: "Reject", icon: <XIcon className="size-4" />, destructive: true, onSelect: () => decide("reject"), disabled: busy },
                ]),
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="claim-proved" icon={<MailCheckIcon />} title="The address they proved">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate text-sm">{claim.contactEmail}</span>
                <Chip muted={!claim.emailDomainMatches} className="gap-1">
                  {claim.emailDomainMatches ? (
                    <>
                      <CheckIcon className="size-3.5" aria-hidden />
                      Same domain as the listing's website
                    </>
                  ) : (
                    <>
                      <XIcon className="size-3.5" aria-hidden />
                      Not the listing's domain
                    </>
                  )}
                </Chip>
              </div>
              <DetailRows>
                <DetailRow label="Name" value={claim.claimantName || "Not given"} />
                <DetailRow label="Role" value={claim.roleTitle || "Not given"} />
                <DetailRow label="Phone" value={claim.phone || "Not given"} />
                <DetailRow label="Link they gave" value={claim.proofUrl || "Not given"} />
              </DetailRows>
              {claim.message ? <p className="text-sm whitespace-pre-wrap">{claim.message}</p> : null}
            </div>
          </PanelCard>
          <PanelCard storageId="claim-account" icon={<UserRoundIcon />} title="The account">
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">This is who gets the listing. It is not always the same address as the one above.</p>
              <DetailRows>
                <DetailRow label="Signed in as" value={claim.accountName || "Not given"} />
                <DetailRow label="Account email" value={claim.accountEmail} />
              </DetailRows>
            </div>
          </PanelCard>
          {decided ? (
            claim.reviewNote ? (
              <PanelCard storageId="claim-decided" icon={<MessageSquareTextIcon />} title="The note that was sent">
                <p className="text-sm whitespace-pre-wrap">{claim.reviewNote}</p>
              </PanelCard>
            ) : null
          ) : (
            <PanelCard storageId="claim-note" icon={<ReplyIcon />} title="A note back">
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Emailed to them either way.</p>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="claim-review-note">Note</FieldLabel>
                  <CharacterCount value={note} max={500} />
                </div>
                <Textarea id="claim-review-note" rows={3} maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
              </div>
            </PanelCard>
          )}
        </>
      }
      footer={
        decided ? (
          <FooterState>
            <span className="text-muted-foreground">
              {REVIEW_STATUS_LABELS[claim.status]}
              {claim.reviewedAt ? ` on ${formatDate(claim.reviewedAt)}` : ""}
            </span>
          </FooterState>
        ) : (
          <>
            <FooterState>
              <span className="text-muted-foreground">Approving hands this account the listing.</span>
            </FooterState>
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Reject
            </Button>
            <Button type="button" disabled={busy} onClick={() => decide("approve")}>
              Hand them the listing
            </Button>
          </>
        )
      }
    />
  )
}
