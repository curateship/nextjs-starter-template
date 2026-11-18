import * as React from "react"
import { CheckIcon, InboxIcon, MessageSquareTextIcon, ReplyIcon, StoreIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote, DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { QueueStatusFilter, WaitedChip } from "@/components/directory/listings-dashboard/queue-parts"
import { DuplicateWarning } from "@/components/directory/submission-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useNavigate } from "@tanstack/react-router"
import { decideSubmission, getAdminSubmissionErrorMessage, type SubmissionsPage } from "@/lib/api/directory/submissions"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { REVIEW_STATUS_LABELS, REVIEW_STATUSES } from "@/lib/directory/review-status"
import { submissionDecisionMessage } from "@/lib/directory/submission-decision-message"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Submission = SubmissionsPage["submissions"][number]

/**
 * The Submissions row: listings the public asked for, opening on the ones
 * waiting for an answer (Tyler's polish pick, 18 Nov 2026: "each opens on
 * Waiting"). It was the Listing submissions page, whose "N need review" link
 * is now the pill on the left.
 *
 * - **Header:** "N selected" (Reject), search, Select, Filter (Status).
 * - **Rows:** how long each has waited, amber from three days; right-click
 *   holds Mass select. A submission is not the admin's to copy or delete,
 *   so neither is offered.
 * - **Right:** what was sent, the "possibly already listed" warning, a note
 *   back, and Reject or Approve and publish in the footer.
 * - **Reject many** (Tyler's polish pick: "Select on Submissions, so ticked
 *   ones are rejected together. Each one still emails its sender").
 */
export function SubmissionsSection({ data, search, frame, onChanged }: SectionProps<SubmissionsPage>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = search.status === "all" ? "all" : statusIn(search.status, REVIEW_STATUSES)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [rejecting, setRejecting] = React.useState<Submission[] | null>(null)
  const [run, busy] = useAsyncAction(getAdminSubmissionErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const listKey = `${q}|${status ?? ""}|${data.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.submissions.map((submission) => submission.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = data.submissions.find((submission) => submission.id === openId) ?? null
  // Only a waiting one can be answered, so only those tick.
  const tickable = data.submissions.filter((submission) => submission.status === "pending_review").map((submission) => submission.id)

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.submissions.filter((submission) => selection.selected.has(submission.id))

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={InboxIcon} label="Submissions" />}
        end={<PanelReopenButton side="right" label="Show the submission" />}
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
        menuLabel="More for submissions"
        search={{
          name: "submission-search",
          label: "Search submissions by name or email",
          placeholder: "Search submissions",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <QueueStatusFilter
            id="submissions-status"
            value={search.status === "all" ? "all" : status}
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
          { key: "name", label: "Business", column: "main", className: "min-w-40", sortable: false },
          { key: "waited", label: "Waited", column: "meta", sortable: false },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "categories", label: "Categories", column: "meta", className: "hidden md:hidden @3xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? {
                noun: "submissions",
                disabled: tickable.length === 0,
                checked: selection.selectAllState(tickable),
                onToggle: () => selection.toggleVisible(tickable),
              }
            : null
        }
        empty={
          data.submissions.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="submissions" onClear={() => setListSearch({ q: undefined, status: undefined, page: undefined })} />
          ) : status && status !== "pending_review" ? (
            "Nothing with that status."
          ) : (
            "Nothing is waiting. Listings the public asks for appear here."
          )
        }
      >
        {data.submissions.map((submission) => (
          <CrmTableRow
            key={submission.id}
            open={submission.id === openId}
            label={submission.businessName}
            tick={{
              shown: massSelect,
              ticked: selection.selected.has(submission.id),
              none: submission.status !== "pending_review",
              onToggle: () => selection.toggle(submission.id),
            }}
            onOpen={() => {
              setPressedId(submission.id)
              setOpen(submission.id)
            }}
            onRightClick={(x, y) => setRightClick({ id: submission.id, x, y })}
          >
            <MainCell name={submission.businessName} line={submission.contactEmail}>
              {data.duplicates[submission.id] ? <Chip muted>Possible duplicate</Chip> : null}
            </MainCell>
            <TableCell column="meta">
              {submission.status === "pending_review" ? (
                <WaitedChip since={submission.verifiedAt ?? submission.createdAt} />
              ) : (
                <span className="text-muted-foreground">{formatDate(submission.createdAt)}</span>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @xl:table-cell">
              <Chip muted>{REVIEW_STATUS_LABELS[submission.status]}</Chip>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
              <span className="block max-w-48 truncate">{submission.categoryNames.join(", ") || "None"}</span>
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
      label: "Submission",
      showLabel: "Show the submission",
      content: openRow ? (
        <SubmissionRecord
          key={openRow.id}
          submission={openRow}
          listing={openRow.listingId ? (data.listings[openRow.listingId] ?? null) : null}
          duplicates={data.duplicates[openRow.id] ?? []}
          onDecided={() => void onChanged()}
        />
      ) : (
        <EmptyRecord
          title="Submission"
          icon={<InboxIcon aria-hidden />}
          line={data.total ? "Click a submission to see it here." : "Nothing to read yet."}
          hideLabel="Hide the submission"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null)
        }}
        title={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length} submissions?` : "Reject this submission?"}
        description={
          rejecting
            ? `Each sender gets the rejection email, so ${rejecting.length} ${plural(rejecting.length, "email goes", "emails go")} out. Nothing becomes a listing.`
            : null
        }
        confirmLabel={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length}` : "Reject"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!rejecting) return
            const failed: string[] = []
            let notEmailed = 0
            for (const submission of rejecting) {
              try {
                const { emailed } = await decideSubmission({ id: submission.id, decision: "reject" })
                if (!emailed) notEmailed += 1
              } catch {
                failed.push(submission.businessName)
              }
            }
            setRejecting(null)
            selection.clear()
            await onChanged()
            if (failed.length) {
              throw new Error(
                `${rejecting.length - failed.length} of ${rejecting.length} rejected. ${failed.join(", ")} could not be, and stay waiting.`
              )
            }
            if (notEmailed) toast.warning(`${notEmailed} ${plural(notEmailed, "sender was", "senders were")} not reached by email. The rejections still hold.`)
          })
        }
      />
    ),
  })
}

/**
 * One submission on the right: what was sent, the warning when it looks like
 * a listing already on the site, and a note back. Reject and Approve and
 * publish are in the footer. A decided one reads only.
 */
function SubmissionRecord({
  submission,
  listing,
  duplicates,
  onDecided,
}: {
  submission: Submission
  listing: { title: string; slug: string } | null
  duplicates: SubmissionsPage["duplicates"][string]
  onDecided: () => void
}) {
  const navigate = useNavigate()
  const [note, setNote] = React.useState("")
  const [run, busy] = useAsyncAction(getAdminSubmissionErrorMessage)
  const decided = submission.status !== "pending_review"

  const decide = (decision: "approve" | "reject", alreadyListedId?: string) =>
    void run(async () => {
      const { emailed } = await decideSubmission({ id: submission.id, decision, note, alreadyListedId })
      // Amber, not green, when the sender was not reached: the decision held, but it is not finished.
      if (!emailed) toast.warning(submissionDecisionMessage(decision, emailed))
      onDecided()
    })

  return (
    <RecordFrame
      avatar={<InboxIcon aria-hidden />}
      title={submission.businessName}
      line={decided ? REVIEW_STATUS_LABELS[submission.status] : `Waiting ${waitedText(submission.verifiedAt ?? submission.createdAt)}`}
      hideLabel="Hide the submission"
      actions={
        <RecordMenu
          label="Submission menu"
          actions={
            listing && submission.listingId
              ? [
                  {
                    label: "Open the listing it became",
                    icon: <StoreIcon className="size-4" />,
                    onSelect: () => void navigate({ to: "/admin/listings", search: { open: submission.listingId ?? undefined } }),
                  },
                ]
              : [
                  { label: "Approve and publish", icon: <CheckIcon className="size-4" />, onSelect: () => decide("approve"), disabled: busy || decided },
                  { label: "Reject", icon: <XIcon className="size-4" />, destructive: true, onSelect: () => decide("reject"), disabled: busy || decided },
                ]
          }
        />
      }
      body={
        <>
          {!decided && duplicates.length ? (
            <PanelCard storageId="submission-duplicates" icon={<TriangleAlertIcon />} title="Possibly already listed" openWhen>
              <DuplicateWarning duplicates={duplicates} busy={busy} onReject={(listingId) => decide("reject", listingId)} />
            </PanelCard>
          ) : null}
          <PanelCard storageId="submission-sent" icon={<InboxIcon />} title="What was sent">
            <DetailRows>
              <DetailRow label="Contact email" value={submission.contactEmail || "Not given"} />
              <DetailRow label="Address" value={submission.address || "Not given"} />
              <DetailRow label="Phone" value={submission.phone || "Not given"} />
              <DetailRow label="Website" value={submission.website || "Not given"} />
              <DetailRow label="Categories" value={submission.categoryNames.join(", ") || "None"} />
              <DetailRow label="Confirmed by email" value={submission.verifiedAt ? formatDate(submission.verifiedAt) : "Not yet"} />
            </DetailRows>
            {submission.description ? <p className="mt-3 text-sm whitespace-pre-wrap">{submission.description}</p> : null}
          </PanelCard>
          {decided ? (
            submission.reviewNote || listing ? (
              <PanelCard storageId="submission-decided" icon={<MessageSquareTextIcon />} title="The answer">
                {submission.reviewNote ? <p className="text-sm whitespace-pre-wrap">{submission.reviewNote}</p> : null}
                {listing ? <DetailNote>It became {listing.title}.</DetailNote> : null}
              </PanelCard>
            ) : null
          ) : (
            <PanelCard storageId="submission-note" icon={<ReplyIcon />} title="A note back">
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Emailed to the sender either way. Optional when approving, worth writing when not.</p>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="submission-note">Note</FieldLabel>
                  <CharacterCount value={note} max={500} />
                </div>
                <Textarea id="submission-note" rows={3} maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
              </div>
            </PanelCard>
          )}
        </>
      }
      footer={
        decided ? (
          <FooterState>
            <span className="text-muted-foreground">
              {REVIEW_STATUS_LABELS[submission.status]}
              {submission.reviewedAt ? ` on ${formatDate(submission.reviewedAt)}` : ""}
            </span>
          </FooterState>
        ) : (
          <>
            <FooterState>
              <span className="text-muted-foreground">Approving publishes it straight away.</span>
            </FooterState>
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Reject
            </Button>
            <Button type="button" disabled={busy} onClick={() => decide("approve")}>
              Approve and publish
            </Button>
          </>
        )
      }
    />
  )
}
