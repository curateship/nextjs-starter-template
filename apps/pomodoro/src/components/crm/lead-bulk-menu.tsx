import * as React from "react"
import { CircleDotIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Dot, DOT } from "@/components/crm/crm-table"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { deleteLeads, getLeadErrorMessage, setLeadsStage } from "@/lib/api/crm/leads"
import { CRM_STAGE_LABELS, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/** What deleting a lead takes with it, said before it happens. */
export const LEAD_DELETE_DETAIL =
  "Their conversations and every message in them go too, for good. A subscriber with the same address stays on the subscriber list."

/**
 * The ticked leads as one "N selected" button in the Leads header, as the
 * Subscribers list's is (Tyler, 9 Nov 2026: "Its also missing mass select"):
 * Stage moves them all to one stage, and Delete takes them and their
 * conversations away after asking.
 */
export function LeadBulkMenu({
  selectedIds,
  onDeleted,
  onDone,
  onRefresh,
}: {
  selectedIds: string[]
  /** The picked leads were deleted, so a panel showing one of them can close. */
  onDeleted: () => void
  /** Clears the ticks: after a change, and from Clear selection. */
  onDone: () => void
  onRefresh: () => Promise<void>
}) {
  const count = selectedIds.length
  const leads = `${count.toLocaleString()} ${plural(count, "lead")}`
  const [run, busy] = useAsyncAction(getLeadErrorMessage)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const finish = async (message: string) => {
    onDone()
    toast.success(message)
    await onRefresh()
  }

  const moveTo = (stage: CrmStage) =>
    void run(async () => {
      const { changed } = await setLeadsStage(selectedIds, stage)
      await finish(
        describeBulkResult({
          done: changed,
          kept: Math.max(0, count - changed),
          one: "lead",
          many: "leads",
          verb: `moved to ${CRM_STAGE_LABELS[stage]}`,
        })
      )
    })

  const remove = () =>
    void run(async () => {
      const { deleted } = await deleteLeads(selectedIds)
      setConfirmDelete(false)
      onDeleted()
      await finish(
        describeBulkResult({ done: deleted, kept: Math.max(0, count - deleted), one: "lead", many: "leads", verb: "deleted" })
      )
    })

  return (
    <>
      <SelectedMenu
        count={count}
        busy={busy}
        onClear={onDone}
        main={(menu) => (
          <>
            <SelectedMenuRow page="stage" onClick={() => menu.step("stage")}>
              <CircleDotIcon className="size-4 text-muted-foreground" />
              Status
            </SelectedMenuRow>
            <SelectedMenuRow
              className="text-destructive hover:text-destructive focus-visible:text-destructive"
              onClick={() => {
                menu.close()
                setConfirmDelete(true)
              }}
            >
              <Trash2Icon className="size-4" />
              Delete {leads}
            </SelectedMenuRow>
          </>
        )}
        pages={{
          stage: {
            title: "Status",
            content: (menu) =>
              CRM_STAGES.map((stage) => (
                <SelectedMenuRow
                  key={stage}
                  onClick={() => {
                    menu.close()
                    moveTo(stage)
                  }}
                >
                  <Dot className={DOT.stage[stage]} />
                  {CRM_STAGE_LABELS[stage]}
                </SelectedMenuRow>
              )),
          },
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${leads}?`}
        description={LEAD_DELETE_DETAIL}
        confirmLabel={`Delete ${leads}`}
        loading={busy}
        onConfirm={remove}
      />
    </>
  )
}
