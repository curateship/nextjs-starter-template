import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { ContactPanel } from "@/components/broadcasts/contact-panel"
import { ContactsLeftPanel } from "@/components/broadcasts/contacts-left-panel"
import { ContactsListPanel } from "@/components/broadcasts/contacts-list-panel"
import { SegmentDialog } from "@/components/broadcasts/segment-dialog"
import { ThreePanels } from "@/components/shared/three-panels"
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
import {
  cleanSegmentRules,
  rulesShowingSegment,
  sameSegmentRules,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const contactsRoute = getRouteApi("/_authenticated/admin/contacts")

/** One shared empty list, so "no filters" is the same object every render. */
const EMPTY_RULES: SegmentRules = { conditions: [] }

type SegmentWindow =
  | { mode: "new"; rules?: SegmentRules; searchExcluded?: boolean }
  | { mode: "edit"; segment: SegmentItem }

/**
 * Contacts and Segments as one three-column dashboard (Tyler, 19 Oct 2026:
 * "We have to combine both the contacts and segment into one 3 col
 * dashboard"). The left panel counts people by status and lists every
 * segment, the middle lists the contacts, and the right shows the one that is
 * open.
 *
 * Segments work like saved views: pressing one applies its rules to the list,
 * and Filter saves the list's rules as a new segment or, with one open,
 * updates it. A hand-picked segment is applied as "in this segment", and its
 * people change through mass select.
 *
 * The search, the filters, the open segment, the sort, the page and the open
 * person all live in the address, so a reload keeps the view and a link opens
 * it for somebody else.
 */
export function ContactsDashboard({ data }: { data: ContactsPage }) {
  const router = useRouter()
  const navigate = useNavigate()
  const listSearch = contactsRoute.useSearch()
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

  /** A Segments card row: pressing the open, unchanged one shows everybody again. */
  const pressSegment = React.useCallback(
    (segment: SegmentItem) => {
      if (openSegment?.id === segment.id && !segmentChanged) {
        setListSearch({ filter: undefined, segment: undefined, page: undefined })
        return
      }
      showSegment(segment.id)
    },
    [openSegment, segmentChanged, setListSearch, showSegment]
  )

  /**
   * A People card row: its rules alone, or nothing when it was already on.
   * The search goes too, so the list holds the number the row shows.
   */
  const applyShortcut = React.useCallback(
    (shortcutRules: SegmentRules, on: boolean) =>
      setListSearch({
        filter: on ? undefined : cleanSegmentRules(shortcutRules),
        segment: undefined,
        q: undefined,
        page: undefined,
      }),
    [setListSearch]
  )

  /**
   * The open person goes in the address with a history entry of its own, so
   * Back closes the panel rather than leaving the list.
   */
  const setOpenContact = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )

  const [segmentWindow, setSegmentWindow] = React.useState<SegmentWindow | null>(null)
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
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: blocked.length,
          one: "segment",
          many: "segments",
          verb: "deleted",
        })
      )
      // The list was showing it, so it shows everybody again.
      if (listSearch.segment === segment.id) {
        setListSearch({ filter: undefined, segment: undefined, page: undefined })
      }
      await refresh()
    })
  }

  const shownSegmentWindow = segmentWindow ?? closingSegmentWindow

  return (
    <ThreePanels
      layoutKey={panelLayoutKey.contactsWorkspace}
      showMiddleFor={`${listSearch.segment ?? ""}|${JSON.stringify(listSearch.filter ?? null)}`}
      showRightFor={openId}
      left={{
        label: "Segments",
        showLabel: "Show the counts and segments",
        content: (
          <ContactsLeftPanel
            data={data}
            rules={rules}
            openSegmentId={openSegment?.id}
            onShortcut={applyShortcut}
            onSegment={pressSegment}
            onNewSegment={() => setSegmentWindow({ mode: "new" })}
            onEditSegment={(segment) => setSegmentWindow({ mode: "edit", segment })}
            onDeleteSegment={setDeleteTarget}
          />
        ),
      }}
      middle={{
        label: "Contacts",
        content: (
          <ContactsListPanel
            data={data}
            rules={rules}
            openSegment={openSegment}
            segmentChanged={segmentChanged}
            openContactId={openId}
            onRules={setRules}
            onOpenContact={setOpenContact}
            onSaveAsSegment={(saved, searchExcluded) =>
              setSegmentWindow({ mode: "new", rules: saved, searchExcluded })
            }
            onRefresh={refresh}
          />
        ),
      }}
      right={{
        label: "Contact",
        showLabel: "Show the contact",
        content: (
          <ContactPanel
            key={openId ?? "none"}
            contactId={openId}
            knownTags={data.tags}
            refreshes={refreshes}
            onClose={() => setOpenContact(undefined)}
            onChanged={refresh}
            onSegment={showSegment}
          />
        ),
      }}
    >
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
    </ThreePanels>
  )
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
