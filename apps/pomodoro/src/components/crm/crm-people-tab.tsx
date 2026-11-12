import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { ContactPanel } from "@/components/broadcasts/contact-panel"
import { SegmentDialog } from "@/components/broadcasts/segment-dialog"
import { useHandSegmentActions, type CrmFrame } from "@/components/crm/crm-frame"
import { CrmPeopleList } from "@/components/crm/crm-people-list"
import type { ViewChoice } from "@/components/shared/view-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  contactFilterOptions,
  getContactErrorMessage,
  type ContactsPage,
} from "@/lib/api/people/contacts"
import {
  deleteSegments,
  getSegmentErrorMessage,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import type { CrmBlockFigures } from "@/lib/api/crm/page"
import {
  cleanSegmentRules,
  rulesShowingSegment,
  sameSegmentRules,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { CONTACT_SHORTCUTS, shortcutIsOn } from "@/lib/contacts/contact-shortcuts"
import type { CrmPeopleSearch, CrmSearch } from "@/lib/crm/crm-search"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** One shared empty list, so "no filters" is the same object every render. */
const EMPTY_RULES: SegmentRules = { conditions: [] }

/**
 * Add a segment pressed on another tab: it moves to People, and People opens
 * the new segment window when it arrives. A flag for that one hand-over, not a
 * key in the address, so a reload or the Back button never reopens it.
 */
let newSegmentAsked = false
export function askForNewSegment() {
  newSegmentAsked = true
}

type SegmentWindow =
  | { mode: "new"; rules?: SegmentRules; searchExcluded?: boolean }
  | { mode: "edit"; segment: SegmentItem }

/** The two status pills, as Filter writes them, so a pill lights when its rules are on. */
const SUBSCRIBED = CONTACT_SHORTCUTS.find((entry) => entry.key === "subscribed")!
const OPTED_OUT = CONTACT_SHORTCUTS.find((entry) => entry.key === "unsubscribed")!

/**
 * The CRM's People tab (Part C of the CRM task, 7 Nov 2026): the Contacts
 * dashboard moved into the CRM, with leads beside the contacts.
 *
 * - **Pills:** All, Leads, Subscribers, Opted out, then every saved segment
 *   (Tyler: "Its pills: All, Leads, Subscribers, Opted out, then the saved
 *   segments"). All is everybody once; somebody who wrote in and is on the
 *   list too shows once, marked as both.
 * - **Segments** work like saved views: a pill or the left page's Segments
 *   block applies one, and Filter saves the list's rules as a new segment or,
 *   with one open, updates it. Segment rules read contacts only, so a segment
 *   or a filter shows contacts and no leads.
 * - **Right:** the open contact, or the open lead, in the CRM's one record
 *   frame.
 *
 * Everything lives in the address, so a reload keeps the view and a link opens
 * it for somebody else.
 */
export function CrmPeopleTab({
  data,
  search,
  figures,
  heading,
  headingEnd,
  frame,
}: {
  data: ContactsPage
  search: CrmSearch
  figures: CrmBlockFigures | null
  /** The start of the middle's header: the section's icon and name. */
  heading: React.ReactNode
  /** The end of the middle's header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  /** Draws the section into the dashboard's one frame. */
  frame: CrmFrame
}) {
  const router = useRouter()
  // The reader left only this tab's keys in the address (`readCrmSearch`).
  const listSearch = search as CrmPeopleSearch
  const setListSearch = useListSearchNavigate()
  const openId = listSearch.open
  const openSegment =
    data.segments.find((segment) => segment.id === listSearch.segment) ?? null
  // The address's own rules once any were picked. Without them an open
  // segment shows its own saved rules, so pressing a segment, or saving one,
  // never leaves an older copy of its rules in the address.
  const rules =
    listSearch.filter ??
    (openSegment ? rulesShowingSegment(openSegment) : EMPTY_RULES)
  const segmentChanged = Boolean(
    openSegment && !sameSegmentRules(rules, rulesShowingSegment(openSegment))
  )
  // Every refresh of the list also tells the open person's panel to read
  // them again, since a change made in the list may have been to them.
  const [refreshes, setRefreshes] = React.useState(0)

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setRefreshes((count) => count + 1)
      dismissErrorToast()
    } catch (error) {
      showErrorToast(getContactErrorMessage(error))
    }
  }, [router])

  // A link to a segment that has since been deleted shows everybody and says
  // why, rather than a list that looks filtered and is not.
  React.useEffect(() => {
    if (!data.segmentMissing) return
    // A tick later: on a fresh page load the toaster starts listening in this
    // same commit, after this effect, and would miss the message.
    const timer = setTimeout(() =>
      showErrorToast(
        "That segment is not there any more, so the list shows everybody."
      )
    )
    setListSearch({ segment: undefined })
    return () => clearTimeout(timer)
  }, [data.segmentMissing, setListSearch])

  /**
   * The list's rules, written back to the address on the first page. An open
   * segment stays open while its rules are edited, which is what lets Filter
   * offer "Update"; emptying the rules closes it.
   */
  const setRules = React.useCallback(
    (next: SegmentRules) => {
      const keep = next.conditions.length > 0
      setListSearch({
        filter: keep ? cleanSegmentRules(next) : undefined,
        segment: keep ? listSearch.segment : undefined,
        page: undefined,
      })
    },
    [listSearch.segment, setListSearch]
  )

  /**
   * Shows one segment's people, as saved. The search goes too, so the list
   * holds the number the segment's row shows.
   */
  const showSegment = React.useCallback(
    (segmentId: string) =>
      setListSearch({ filter: undefined, segment: segmentId, q: undefined, page: undefined }),
    [setListSearch]
  )



  /**
   * The open person goes in the address with a history entry of its own, so
   * Back closes the panel rather than leaving the list.
   */
  const setOpenContact = useOpenRecord()

  const [segmentWindow, setSegmentWindow] = React.useState<SegmentWindow | null>(() => {
    if (!newSegmentAsked) return null
    newSegmentAsked = false
    return { mode: "new" }
  })
  const closingSegmentWindow = useLastValue(segmentWindow)
  const [deleteTarget, setDeleteTarget] = React.useState<SegmentItem | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [runDelete, deleting] = useAsyncAction(getSegmentErrorMessage)
  const options = contactFilterOptions(data)

  const removeSegment = async (segment: SegmentItem) => {
    await runDelete(async () => {
      const { deleted, blocked } = await deleteSegments([segment.id])
      if (deleted.length === 0) {
        showErrorToast(describeBlocked(blocked))
        return
      }
      setDeleteTarget(null)
      // The list was showing it, so it shows everybody again.
      if (listSearch.segment === segment.id) {
        setListSearch({ filter: undefined, segment: undefined, page: undefined })
      }
      await refresh()
    })
  }

  const shownSegmentWindow = segmentWindow ?? closingSegmentWindow

  const segmentTotals = new Map((figures?.segments ?? []).map((entry) => [entry.id, entry.total]))
  const pills: ViewChoice[] = [
    { value: "all", label: "All", count: data.total },
    { value: "subscribed", label: "On the list", count: data.shortcuts.subscribed },
    { value: "unsubscribed", label: "Opted out", count: data.shortcuts.unsubscribed },
    ...data.segments.map((segment) => ({
      value: `segment:${segment.id}`,
      label: segment.name,
      count: segmentTotals.get(segment.id) ?? segment.total,
    })),
  ]
  // Which pill is lit. Rules picked in Filter that match no pill light none.
  const pill =
    openSegment && !segmentChanged
        ? `segment:${openSegment.id}`
        : rules.conditions.length === 0 && !openSegment
          ? "all"
          : shortcutIsOn(SUBSCRIBED, rules)
            ? "subscribed"
            : shortcutIsOn(OPTED_OUT, rules)
              ? "unsubscribed"
              : ""

  /** A pill pressed: its people, from the first page. The open person stays open. */
  const pressPill = (value: string) => {
    const base = { filter: undefined, segment: undefined, page: undefined }
    if (value === "subscribed") setListSearch({ ...base, filter: cleanSegmentRules(SUBSCRIBED.rules) })
    else if (value === "unsubscribed") setListSearch({ ...base, filter: cleanSegmentRules(OPTED_OUT.rules) })
    else if (value.startsWith("segment:")) setListSearch({ ...base, segment: value.slice("segment:".length) })
    else setListSearch(base)
  }

  // The Segments block's ⋯ and Add a segment, on the left page, open this
  // section's windows while it shows.
  useHandSegmentActions({
    onEdit: (segmentId) => {
      const segment = data.segments.find((entry) => entry.id === segmentId)
      if (segment) setSegmentWindow({ mode: "edit", segment })
    },
    onDelete: (segmentId) => {
      const segment = data.segments.find((entry) => entry.id === segmentId)
      if (segment) setDeleteTarget(segment)
    },
    onNew: () => setSegmentWindow({ mode: "new" }),
  })

  return frame({
    ids: data.contacts.map((contact) => contact.id),
    showMiddleFor: `${listSearch.segment ?? ""}|${JSON.stringify(listSearch.filter ?? null)}`,
    showRightFor: openId,
    middle: (
      <CrmPeopleList
        data={data}
        listSearch={listSearch}
        heading={heading}
        headingEnd={headingEnd}
        pills={pills}
        pill={pill}
        onPill={pressPill}
        rules={rules}
        openSegment={openSegment}
        segmentChanged={segmentChanged}
        openId={openId}
        onRules={setRules}
        onOpen={setOpenContact}
        onSaveAsSegment={(saved, searchExcluded) =>
          setSegmentWindow({ mode: "new", rules: saved, searchExcluded })
        }
        onRefresh={refresh}
      />
    ),
    right: {
      label: "Subscriber",
      showLabel: "Show the subscriber",
      content: (
        <ContactPanel
          key={openId ?? "none"}
          contactId={openId}
          knownTags={data.tags}
          segments={data.segments}
          refreshes={refreshes}
          onChanged={refresh}
          onSegment={showSegment}
          onDeleted={() => setOpenContact(undefined)}
        />
      ),
    },
    windows: (
      <>
        <SegmentDialog
          key={
            shownSegmentWindow?.mode === "edit"
              ? shownSegmentWindow.segment.id
              : shownSegmentWindow
                ? `new-${JSON.stringify(shownSegmentWindow.rules ?? null)}`
                : "closed"
          }
          open={segmentWindow !== null}
          segment={shownSegmentWindow?.mode === "edit" ? shownSegmentWindow.segment : null}
          options={options}
          prefill={
            shownSegmentWindow?.mode === "new" && shownSegmentWindow.rules
              ? {
                  rules: shownSegmentWindow.rules,
                  searchExcluded: Boolean(shownSegmentWindow.searchExcluded),
                }
              : undefined
          }
          onClose={() => setSegmentWindow(null)}
          onSaved={async (id) => {
            const made = segmentWindow?.mode === "new"
            setSegmentWindow(null)
            await refresh()
            // A new segment is the list now, so it opens already applied. An
            // edited one that was open shows its rules as just saved.
            if (made || id === listSearch.segment) {
              setListSearch({ filter: undefined, segment: id, page: undefined })
            }
          }}
        />
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title={
            closingDeleteTarget
              ? `Delete ${quoteOneLine(closingDeleteTarget.name)}?`
              : "Delete this segment?"
          }
          description="The segment goes for good. Nobody is deleted: the contacts stay exactly as they are. A segment another segment or an automation uses cannot be deleted until that stops pointing at it."
          confirmLabel="Delete segment"
          loading={deleting}
          onConfirm={() => {
            if (deleteTarget) void removeSegment(deleteTarget)
          }}
        />
      </>
    ),
  })
}

/** Which segment refused to go, and what is still pointing at it. */
function describeBlocked(blocked: { name: string; usedBy: string[] }[]): string {
  const entry = blocked[0]
  // Nothing went and nothing was in the way, so it was already gone: somebody
  // deleted it in another window while this list sat here.
  if (!entry) {
    return "That segment is not there any more. Refresh the list to see what is."
  }
  return `${quoteOneLine(entry.name)} is still being used by ${entry.usedBy.join(", ")}, so it cannot be deleted yet.`
}
