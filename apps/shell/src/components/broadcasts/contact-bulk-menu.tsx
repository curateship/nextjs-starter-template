import * as React from "react"
import { CircleDotIcon, Trash2Icon, UserRoundMinusIcon, UsersRoundIcon } from "lucide-react"

import {
  SelectedMenu,
  SelectedMenuRow,
  SelectedMenuSeparator,
} from "@/components/shared/mass-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  deleteContacts,
  deleteMatchingContacts,
  getContactErrorMessage,
  setContactsStatus,
  setMatchingContactsStatus,
} from "@/lib/api/people/contacts"
import {
  addContactsToWorkspaceSegment,
  addMatchingContactsToWorkspaceSegment,
  getSegmentErrorMessage,
  removeContactsFromWorkspaceSegment,
  removeMatchingContactsFromWorkspaceSegment,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import type { ContactFilterInput } from "@/lib/contacts/contact-filter"
import {
  CONTACT_SEGMENT_STATUSES,
  segmentStatusLabels,
  type ContactSegmentStatus,
} from "@/lib/contacts/contact-segments"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

const DELETE_DETAIL =
  "They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, set their status to Opted out instead."

/**
 * The ticked contacts as one "N selected" button in the middle header. Its
 * menu holds Add to segment first, then Remove from segment and Status, each
 * stepping into its own list, then Delete. Once the whole page is ticked it
 * also offers everybody the filters match, and then every change is sent as
 * the filters rather than as ids, so it means the people the list means.
 *
 * Each change is one request, and the list redraws with the result.
 */
export function ContactBulkMenu({
  selectedIds,
  allMatching,
  total,
  offerAll,
  filter,
  segments,
  onSelectAllMatching,
  onDeleted,
  onDone,
  onRefresh,
}: {
  selectedIds: string[]
  /** Everybody the filters match is picked, not only the ticked rows. */
  allMatching: boolean
  /** How many people the filters match. */
  total: number
  /** The page is fully ticked and more people match than are on it. */
  offerAll: boolean
  filter: ContactFilterInput
  segments: SegmentItem[]
  onSelectAllMatching: () => void
  /** The picked people were deleted, so a panel showing one of them can close. */
  onDeleted: () => void
  /** Clears the ticks: after a change, and from Clear selection. */
  onDone: () => void
  onRefresh: () => Promise<void>
}) {
  const count = allMatching ? total : selectedIds.length
  const people = `${count.toLocaleString()} ${plural(count, "person", "people")}`
  const handPicked = segments.filter((segment) => segment.kind === "static")
  const [runSegment, segmentBusy] = useAsyncAction(getSegmentErrorMessage)
  const [runContacts, contactsBusy] = useAsyncAction(getContactErrorMessage)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // The segment everybody the filters match is about to join. One click on a
  // segment can add thousands of people, so that case asks first.
  const [confirmAddTo, setConfirmAddTo] = React.useState<SegmentItem | null>(null)
  const busy = segmentBusy || contactsBusy

  const finish = async () => {
    onDone()
    await onRefresh()
  }

  /** Ticked rows join straight away. Everybody who matches goes through the confirm below. */
  const addTo = (segment: SegmentItem) =>
    void runSegment(async () => {
      await addContactsToWorkspaceSegment(segment.id, selectedIds)
      await finish()
    })

  const removeFrom = (segment: SegmentItem) =>
    void runSegment(async () => {
      await (allMatching
        ? removeMatchingContactsFromWorkspaceSegment(segment.id, filter)
        : removeContactsFromWorkspaceSegment(segment.id, selectedIds))
      await finish()
    })

  const setStatus = (status: ContactSegmentStatus) =>
    void runContacts(async () => {
      await (allMatching
        ? setMatchingContactsStatus(filter, status)
        : setContactsStatus(selectedIds, status))
      await finish()
    })

  const remove = () =>
    void runContacts(async () => {
      await (allMatching
        ? deleteMatchingContacts(filter)
        : deleteContacts(selectedIds))
      setConfirmDelete(false)
      onDeleted()
      await finish()
    })

  const segmentList = (pick: (segment: SegmentItem) => void, close: () => void) =>
    handPicked.length ? (
      <ScrollArea viewportClassName="max-h-72">
        {handPicked.map((segment) => (
          <SelectedMenuRow
            key={segment.id}
            onClick={() => {
              close()
              pick(segment)
            }}
          >
            <span className="truncate">{segment.name}</span>
          </SelectedMenuRow>
        ))}
      </ScrollArea>
    ) : (
      <p className="px-1.5 py-1 text-sm text-muted-foreground">
        No hand-picked segments yet. Make one with the + on the Segments card.
      </p>
    )

  return (
    <>
      <SelectedMenu
        count={count}
        busy={busy}
        onClear={onDone}
        main={(menu) => (
          <>
            <SelectedMenuRow page="add" onClick={() => menu.step("add")}>
              <UsersRoundIcon className="size-4 text-muted-foreground" />
              Add to segment
            </SelectedMenuRow>
            <SelectedMenuRow page="remove" onClick={() => menu.step("remove")}>
              <UserRoundMinusIcon className="size-4 text-muted-foreground" />
              Remove from segment
            </SelectedMenuRow>
            <SelectedMenuRow page="status" onClick={() => menu.step("status")}>
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
              Delete {people}
            </SelectedMenuRow>
            {offerAll && !allMatching ? (
              <>
                <SelectedMenuSeparator />
                <SelectedMenuRow onClick={onSelectAllMatching}>
                  Pick all {total.toLocaleString()} who match
                </SelectedMenuRow>
              </>
            ) : null}
          </>
        )}
        pages={{
          add: {
            title: "Add to segment",
            content: (menu) =>
              segmentList(allMatching ? setConfirmAddTo : addTo, menu.close),
          },
          remove: {
            title: "Remove from segment",
            content: (menu) => segmentList(removeFrom, menu.close),
          },
          status: {
            title: "Status",
            content: (menu) =>
              CONTACT_SEGMENT_STATUSES.map((status) => (
                <SelectedMenuRow
                  key={status}
                  onClick={() => {
                    menu.close()
                    setStatus(status)
                  }}
                >
                  {segmentStatusLabels[status]}
                </SelectedMenuRow>
              )),
          },
        }}
      />
      <ConfirmDialog
        open={confirmAddTo !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAddTo(null)
        }}
        title={`Add ${people} to ${confirmAddTo?.name ?? "this segment"}?`}
        description="That is everybody the filters match, not only the people on this page."
        confirmLabel={`Add ${people}`}
        destructive={false}
        loading={segmentBusy}
        onConfirm={() => {
          if (!confirmAddTo) return
          void runSegment(async () => {
            await addMatchingContactsToWorkspaceSegment(confirmAddTo.id, filter)
            setConfirmAddTo(null)
            await finish()
          })
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${people}?`}
        description={
          allMatching
            ? `That is everybody the filters match, not only the people on this page. ${DELETE_DETAIL}`
            : DELETE_DETAIL
        }
        confirmLabel={`Delete ${people}`}
        loading={contactsBusy}
        onConfirm={remove}
      />
    </>
  )
}
