import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ActivityIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"

import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { PickGroup, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InlineError } from "@/components/ui/inline-error"
import { Badge } from "@/components/ui/badge"
import {
  deleteContacts,
  getContactErrorMessage,
  loadContactDetail,
  saveContactTags,
  setContactsStatus,
  type ContactDelivery,
  type ContactItem,
} from "@/lib/api/people/contacts"
import {
  addContactsToWorkspaceSegment,
  getSegmentErrorMessage,
  removeContactsFromWorkspaceSegment,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import { CSV_IMPORT_SOURCE } from "@/lib/contacts/contact-csv"
import {
  CONTACT_SEGMENT_STATUSES,
  segmentStatusDotClassName,
  segmentStatusHints,
  segmentStatusLabels,
  type ContactSegmentStatus,
  type SegmentKind,
} from "@/lib/contacts/contact-segments"
import { formatDate } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLoad } from "@/lib/hooks/use-load"
import { cn } from "@/lib/utils"

/**
 * The Contacts dashboard's right panel: the open person, as Tyler's mock of
 * 20 Oct 2026 draws it. Who they are, their tags, the segments they are in
 * right now, their notes and what has happened with them, each in a card.
 *
 * The header holds their status, which saves the moment it is picked, and
 * nothing else: Tyler took the arrows and the × off on 20 Oct 2026. Another
 * row of the list opens somebody else. Deleting somebody is in their row's
 * "…" menu. Tags save when the box is left
 * or Enter is pressed, notes save as they are typed, and a refused save keeps
 * what was typed. Pressing a segment shows that segment's people in the list.
 *
 * The panel loads its own person by id, so a link can open somebody who is
 * not on the page the list is showing.
 */
export function ContactPanel({
  contactId,
  knownTags,
  segments,
  refreshes,
  onChanged,
  onSegment,
  onDeleted,
}: {
  contactId: string | undefined
  /** Every tag in use in the workspace, offered as the tags box is typed in. */
  knownTags: string[]
  /** Every segment, for the Segments row, which adds to the hand-picked ones. */
  segments: SegmentItem[]
  /** Goes up each time the list is read again; the panel reads its person again too. */
  refreshes: number
  /** Re-reads the list after a change made here. */
  onChanged: () => Promise<void>
  onSegment: (segmentId: string) => void
  /** They were deleted from the ⋮; the list lets go of them. */
  onDeleted: () => void
}) {
  if (!contactId) {
    return (
      <EmptyRecord
        title="Person"
        icon={<SquareMousePointerIcon aria-hidden />}
        line="Click a person to see them here."
        hideLabel="Hide the person"
      />
    )
  }
  return (
    <OpenContact
      contactId={contactId}
      knownTags={knownTags}
      segments={segments}
      refreshes={refreshes}
      onChanged={onChanged}
      onSegment={onSegment}
      onDeleted={onDeleted}
    />
  )
}

/**
 * One contact on the CRM's right panel, in the frame every record there uses
 * (`RecordFrame`; Tyler, 7 Nov 2026: "The Ui is all over the place"):
 *
 * - **Header:** their initials, name and address, then the ⋮.
 * - **⋮, General:** Person (address, where they came from, when they joined,
 *   whether they can sign in), then List (status, tags, segments), each a
 *   grouped row that saves itself, then Delete in red under a line.
 * - **Body:** two grey cards (Settings → Styling → Panel cards; Tyler, 9 Nov
 *   2026: "remove the note feature for subscribers. Add a card there ... that
 *   show subscriber basic informations like: Date added, status, tags,
 *   segments and came from. The activity should also be in a card").
 *   Details reads those five back; they are changed from the ⋮. Activity is
 *   what happened to each email they were sent.
 * - **Footer:** their status in words, and Take off or Put back on the list.
 */
function OpenContact({
  contactId,
  knownTags,
  segments,
  refreshes,
  onChanged,
  onSegment,
  onDeleted,
}: {
  contactId: string
  knownTags: string[]
  segments: SegmentItem[]
  refreshes: number
  onChanged: () => Promise<void>
  onSegment: (segmentId: string) => void
  onDeleted: () => void
}) {
  const [historyPage, setHistoryPage] = React.useState(1)
  const [runStatus, changingStatus] = useAsyncAction(getContactErrorMessage)
  const [runDelete, deleting] = useAsyncAction(getContactErrorMessage)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [deleteAsk, setDeleteAsk] = React.useState(false)

  const load = useLoad(
    () => loadContactDetail(contactId, historyPage),
    getContactErrorMessage,
    { keys: [contactId, historyPage, refreshes] }
  )
  // A failed load shows only the failure, never the contact from before it.
  const detail = load.error ? null : load.data
  const contact = detail?.contact ?? null

  /** Picked, saved: a status is a thing done to somebody, not an edit to cancel. */
  const pickStatus = (next: ContactSegmentStatus) => {
    if (!contact || next === contact.status) return
    void runStatus(async () => {
      await setContactsStatus([contact.id], next)
      await onChanged()
    })
  }

  if (!contact || !detail) {
    return load.error ? (
      <EmptyRecord title="Person" icon={<UserIcon aria-hidden />} line={load.error} hideLabel="Hide the person" />
    ) : (
      <EmptyRecord title="Person" icon={null} line="" loading hideLabel="Hide the person" />
    )
  }

  const name = fullName(contact)
  const mailable = contact.status === "subscribed" || contact.status === "cold"

  return (
    <>
      <RecordFrame
        avatar={initialsOf(name, contact.email)}
        title={name || contact.email}
        line={name ? contact.email : segmentStatusLabels[contact.status]}
        hideLabel="Hide the person"
        actions={
          <TabbedMenu
            label="Person menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            tabs={[
              {
                value: "general",
                label: "General",
                content: (
                  <div className="grid gap-4 p-3">
                    <PickGroup title="Person">
                      <PickRow label="Email" value={contact.email} disabled>
                        {null}
                      </PickRow>
                      <PickRow label="Came from" value={contact.source || "Not recorded"} empty={!contact.source} disabled>
                        {null}
                      </PickRow>
                      <PickRow label="Joined" value={formatDate(contact.created_at)} disabled>
                        {null}
                      </PickRow>
                    </PickGroup>
                    <PickGroup
                      title="List"
                      after={<p className="px-0.5 text-xs text-muted-foreground">{segmentStatusHints[contact.status]}</p>}
                    >
                      <PickMenuRow
                        label="Status"
                        value={segmentStatusLabels[contact.status]}
                        disabled={changingStatus}
                        options={CONTACT_SEGMENT_STATUSES.map((status) => ({
                          value: status,
                          label: segmentStatusLabels[status],
                        }))}
                        selected={contact.status}
                        onPick={(value) => pickStatus(value as ContactSegmentStatus)}
                      />
                      <PickRow
                        label="Tags"
                        value={contact.tags.length ? contact.tags.join(", ") : "None"}
                        empty={!contact.tags.length}
                      >
                        <TagsBox
                          key={contact.tags.join("\n")}
                          contactId={contact.id}
                          tags={contact.tags}
                          knownTags={knownTags}
                          onSaved={onChanged}
                        />
                      </PickRow>
                      <PickRow
                        label="Segments"
                        value={detail.segments.length ? detail.segments.map((one) => one.name).join(", ") : "None"}
                        empty={!detail.segments.length}
                      >
                        <SegmentsBox
                          contactId={contact.id}
                          theirs={detail.segments}
                          segments={segments}
                          onSegment={(segmentId) => {
                            setMenuOpen(false)
                            onSegment(segmentId)
                          }}
                          onChanged={onChanged}
                        />
                      </PickRow>
                    </PickGroup>
                    <div className="grid">
                      <div aria-hidden className="-mx-3 mb-1.5 border-t" />
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start gap-2 px-2 font-normal text-destructive hover:text-destructive"
                        onClick={() => {
                          setMenuOpen(false)
                          setDeleteAsk(true)
                        }}
                      >
                        <Trash2Icon className="size-4" />
                        Delete contact
                      </Button>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        }
        body={
          <>
            <PanelCard icon={<InfoIcon />} storageId="crm-subscriber-details" title="Details">
              <div className="grid gap-2">
                <DetailRow label="Added" value={formatDate(contact.created_at)} />
                <DetailRow
                  label="Status"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", segmentStatusDotClassName[contact.status])} />
                      {segmentStatusLabels[contact.status]}
                    </span>
                  }
                />
                <DetailRow label="Tags" value={<BadgeList items={contact.tags} />} />
                <DetailRow label="Segments" value={<BadgeList items={detail.segments.map((one) => one.name)} />} />
                <DetailRow label="Came from" value={contact.source || "Not recorded"} />
              </div>
            </PanelCard>
            <PanelCard icon={<ActivityIcon />} storageId="crm-subscriber-activity" title="Activity">
              <ActivityList
                contact={contact}
                history={detail.history}
                showJoined={!detail.hasMore}
                emptyPage={historyPage > 1}
              />
              {detail.hasMore || historyPage > 1 ? (
                <div className="flex items-center gap-2 border-t pt-3">
                  <span className="flex-1 text-xs text-muted-foreground">Page {historyPage}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                  >
                    Newer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!detail.hasMore}
                    onClick={() => setHistoryPage((current) => current + 1)}
                  >
                    Older
                  </Button>
                </div>
              ) : null}
            </PanelCard>
          </>
        }
        footer={
          <>
            <FooterState>
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", segmentStatusDotClassName[contact.status])} />
              <span className="truncate">{segmentStatusLabels[contact.status]}</span>
            </FooterState>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={changingStatus}
              onClick={() => pickStatus(mailable ? "unsubscribed" : "subscribed")}
            >
              {mailable ? <UserMinusIcon className="size-4" /> : <UserPlusIcon className="size-4" />}
              {mailable ? "Take off the list" : "Put back on the list"}
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={deleteAsk}
        onOpenChange={setDeleteAsk}
        title={`Delete ${quoteOneLine(contact.email)}?`}
        description="They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, use Take off the list instead."
        confirmLabel="Delete contact"
        loading={deleting}
        onConfirm={() =>
          void runDelete(async () => {
            await deleteContacts([contact.id])
            setDeleteAsk(false)
            onDeleted()
            await onChanged()
          })
        }
      />
    </>
  )
}

/** Two letters for the round badge: the name's first and last, or the address's first. */
function initialsOf(name: string, email: string) {
  if (!name) return email.slice(0, 1).toUpperCase()
  const words = name.split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase()
}

/**
 * Their tags, each placed or removed saved at once. The pills change straight
 * away and go back if the save is refused, with the reason in the error
 * toast. Tags decide who is in a rules segment, so a save reads the list and
 * the segments again. Keyed by the saved tags, so a save from elsewhere starts
 * the box afresh.
 */
function TagsBox({
  contactId,
  tags: savedTags,
  knownTags,
  onSaved,
}: {
  contactId: string
  tags: string[]
  knownTags: string[]
  onSaved: () => Promise<void>
}) {
  const [tags, setTags] = React.useState(savedTags)
  const [run, saving] = useAsyncAction(getContactErrorMessage)

  const save = async (next: string[]) => {
    const before = tags
    setTags(next)
    const ok = await run(async () => {
      await saveContactTags(contactId, next)
      await onSaved()
    })
    if (!ok) setTags(before)
    return ok
  }

  return (
    <ContactTagsBox
      id={`contact-tags-${contactId}`}
      tags={tags}
      knownTags={knownTags}
      disabled={saving}
      onAdd={(tag) => save([...tags, tag])}
      onRemove={(tag) => void save(tags.filter((entry) => entry !== tag))}
    />
  )
}

/**
 * The segments they are in right now, as pills: pressing one shows its
 * people in the list. A hand-picked segment's pill has an × that takes them
 * out, and the card's + puts them in another hand-picked one. A rules
 * segment has no ×, because its rules decide who is in it; its dot is solid
 * where a hand-picked one's is grey, as in the left panel.
 */
function SegmentsBox({
  contactId,
  theirs,
  segments,
  onSegment,
  onChanged,
}: {
  contactId: string
  theirs: { id: string; name: string; kind: SegmentKind }[]
  segments: SegmentItem[]
  onSegment: (segmentId: string) => void
  onChanged: () => Promise<void>
}) {
  const [run, changing] = useAsyncAction(getSegmentErrorMessage)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const inIds = new Set(theirs.map((segment) => segment.id))
  const addable = segments.filter((segment) => segment.kind === "static" && !inIds.has(segment.id))

  const add = (segment: SegmentItem) =>
    void run(async () => {
      await addContactsToWorkspaceSegment(segment.id, [contactId])
      await onChanged()
    })
  const remove = (segment: { id: string; name: string }) =>
    void run(async () => {
      await removeContactsFromWorkspaceSegment(segment.id, [contactId])
      await onChanged()
    })

  return (
    <div className="grid gap-3">
      {theirs.length ? (
        <div className="flex flex-wrap gap-2">
          {theirs.map((segment) => (
            <span key={segment.id} className="inline-flex h-7 items-center rounded-md border bg-background text-sm">
              <button
                type="button"
                className="flex h-full items-center gap-1.5 rounded-md pr-1 pl-2 hover:underline"
                aria-label={`Show the people in ${segment.name}`}
                onClick={() => onSegment(segment.id)}
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", segment.kind === "static" ? "bg-muted-foreground/50" : "bg-foreground")}
                />
                {segment.name}
              </button>
              {segment.kind === "static" ? (
                <button
                  type="button"
                  className="flex h-full items-center rounded-md pr-2 pl-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Take them out of ${segment.name}`}
                  disabled={changing}
                  onClick={() => remove(segment)}
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <span className="pr-1" />
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">They are not in any segment right now.</p>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={changing}>
            {changing ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            Add to a segment
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Add to a hand-picked segment</DropdownMenuLabel>
          {addable.length ? (
            addable.map((segment) => (
              <DropdownMenuItem key={segment.id} onSelect={() => add(segment)}>
                <span className="min-w-0 truncate">{segment.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {segments.some((segment) => segment.kind === "static")
                ? "They are in every hand-picked segment already."
                : "No hand-picked segments yet. Save one from Filter."}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * A label and its value on one line, as the Admin user panel's Profile card
 * reads; a value with no room beside its label goes under it.
 */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 max-w-full truncate text-right text-sm font-medium">{value}</span>
    </div>
  )
}

/** Tags or segments as small chips, or "None". */
function BadgeList({ items }: { items: string[] }) {
  if (!items.length) return <>None</>
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="bg-background font-normal">
          {item}
        </Badge>
      ))}
    </span>
  )
}

/** One line of Activity: what happened, which email, and when. */
type ActivityEntry = {
  key: string
  words: string
  subject?: { text: string; broadcastId: string | null }
  at: string
  error?: string | null
}

/**
 * What has happened with them, newest first, on a line down the left: one
 * line per email at the furthest it got (bounced, clicked, opened, sent, or
 * could not be sent), then the day they joined at the very end.
 *
 * Bouncing is checked first: `status` says what happened when the message was
 * handed to the mail provider, and a bounce arrives afterwards, so a message
 * can be both sent and bounced, and the bounce is the part worth reading.
 */
function ActivityList({
  contact,
  history,
  showJoined,
  emptyPage,
}: {
  contact: ContactItem
  history: ContactDelivery[]
  /** This page reaches the end, so the join is on it. */
  showJoined: boolean
  emptyPage: boolean
}) {
  const entries: ActivityEntry[] = history.map((delivery) => {
    const subject = { text: delivery.subject.trim() || "No subject", broadcastId: delivery.broadcastId }
    if (delivery.bouncedAt) return { key: delivery.id, words: "Bounced", subject, at: delivery.bouncedAt }
    if (delivery.status === "failed") {
      return { key: delivery.id, words: "Could not send", subject, at: delivery.created_at, error: delivery.error }
    }
    if (delivery.clickedAt) {
      return { key: delivery.id, words: "Clicked a link in", subject, at: delivery.clickedAt }
    }
    if (delivery.openedAt) return { key: delivery.id, words: "Opened", subject, at: delivery.openedAt }
    return { key: delivery.id, words: "Sent", subject, at: delivery.created_at }
  })
  if (showJoined) {
    entries.push({ key: "joined", words: joinedWords(contact.source), at: contact.created_at })
  }
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyPage ? "Nothing more to show." : "Nothing yet."}</p>
  }

  return (
    <ol className="grid">
      {entries.map((entry, index) => (
        <li key={entry.key} className="relative grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-2 pb-3 last:pb-0">
          {/* The line down to the next entry. */}
          {index < entries.length - 1 ? (
            <span aria-hidden className="absolute top-5 bottom-0 left-[7px] border-l" />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "mt-1 flex size-3.5 items-center justify-center rounded-full border",
              index === 0 ? "border-foreground" : "border-muted-foreground/40"
            )}
          >
            {index === 0 ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
          </span>
          <span className="min-w-0 text-sm">
            {entry.words}
            {entry.subject ? (
              <>
                {" "}
                {entry.subject.broadcastId ? (
                  <Link
                    to="/admin/crm"
                    search={{ tab: "broadcasts", view: "sent", open: entry.subject.broadcastId }}
                    className="underline-offset-2 hover:underline"
                  >
                    {quoteOneLine(entry.subject.text)}
                  </Link>
                ) : (
                  quoteOneLine(entry.subject.text)
                )}
              </>
            ) : null}
            {entry.error ? <InlineError className="mt-1">{entry.error}</InlineError> : null}
          </span>
          <span className="pt-0.5 text-xs whitespace-nowrap text-muted-foreground">{formatShortDate(entry.at)}</span>
        </li>
      ))}
    </ol>
  )
}

/** How the join reads, by where they came from. */
function joinedWords(source: string | null): string {
  if (!source) return "Joined"
  if (source === "Added by hand") return "Added by hand"
  if (source === CSV_IMPORT_SOURCE) return "Added from a CSV file"
  return `Joined from ${source}`
}

/** "Oct 14", with the year only when it is not this one. */
function formatShortDate(iso: string): string {
  const date = new Date(iso)
  const thisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  })
}

function fullName(contact: { firstName: string | null; lastName: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}
