import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  PlusIcon,
  SquareMousePointerIcon,
  UserIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { PanelBox, PanelCard, PanelHeading } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { InlineError } from "@/components/ui/inline-error"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getContactErrorMessage,
  loadContactDetail,
  saveContactNotes,
  saveContactTags,
  setContactsStatus,
  type ContactDelivery,
  type ContactDetail,
  type ContactItem,
} from "@/lib/api/people/contacts"
import {
  addContactsToWorkspaceSegment,
  getSegmentErrorMessage,
  removeContactsFromWorkspaceSegment,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import { CONTACT_NOTES_MAX, CSV_IMPORT_SOURCE } from "@/lib/contacts/contact-csv"
import {
  CONTACT_SEGMENT_STATUSES,
  segmentStatusDotClassName,
  segmentStatusHints,
  segmentStatusLabels,
  segmentStatusSaidDone,
  type ContactSegmentStatus,
  type SegmentKind,
} from "@/lib/contacts/contact-segments"
import { formatDate } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Loaded =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; detail: ContactDetail }

/** How long the Notes box waits after the last key before it saves. */
const NOTES_SAVE_DELAY_MS = 700

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
}: {
  contactId: string | undefined
  /** Every tag in use in the workspace, offered as the tags box is typed in. */
  knownTags: string[]
  /** Every segment, for the Segments card's +, which lists the hand-picked ones. */
  segments: SegmentItem[]
  /** Goes up each time the list is read again; the panel reads its person again too. */
  refreshes: number
  /** Re-reads the list after a change made here. */
  onChanged: () => Promise<void>
  onSegment: (segmentId: string) => void
}) {
  if (!contactId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<UserIcon className="size-4" />} title="Contact" />
        <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
          <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-56 text-sm text-muted-foreground">
            Click a contact to see their tags, segments, notes and activity here.
          </p>
        </div>
      </>
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
    />
  )
}

function OpenContact({
  contactId,
  knownTags,
  segments,
  refreshes,
  onChanged,
  onSegment,
}: {
  contactId: string
  knownTags: string[]
  segments: SegmentItem[]
  refreshes: number
  onChanged: () => Promise<void>
  onSegment: (segmentId: string) => void
}) {
  const [loaded, setLoaded] = React.useState<Loaded>({ status: "loading" })
  const [historyPage, setHistoryPage] = React.useState(1)
  const [attempt, setAttempt] = React.useState(0)
  const [runStatus, changingStatus] = useAsyncAction(getContactErrorMessage)

  React.useEffect(() => {
    let active = true
    loadContactDetail(contactId, historyPage)
      .then((detail) => {
        if (active) setLoaded({ status: "ready", detail })
      })
      .catch((error) => {
        if (active) setLoaded({ status: "failed", message: getContactErrorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [contactId, historyPage, attempt, refreshes])

  const detail = loaded.status === "ready" ? loaded.detail : null
  const contact = detail?.contact ?? null
  const reload = () => setAttempt((count) => count + 1)

  /** Picked, saved: a status is a thing done to somebody, not an edit to cancel. */
  const pickStatus = (next: ContactSegmentStatus) => {
    if (!contact || next === contact.status) return
    void runStatus(async () => {
      await setContactsStatus([contact.id], next)
      toast.success(segmentStatusSaidDone[next].replace("%s", () => contact.email))
      await onChanged()
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={contact?.email ?? "Contact"}>
      <DashboardCardHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {contact ? (
            <>
              <Select
                value={contact.status}
                onValueChange={(value) => pickStatus(value as ContactSegmentStatus)}
              >
                {/* No outline (Tyler, 20 Oct 2026); it shades on hover instead. */}
                <SelectTrigger
                  className="w-fit min-w-0 border-transparent hover:bg-muted dark:bg-transparent"
                  aria-label="Their status"
                  disabled={changingStatus}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_SEGMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span
                        aria-hidden
                        className={cn("size-1.5 shrink-0 rounded-full", segmentStatusDotClassName[status])}
                      />
                      {segmentStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {changingStatus ? (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </>
          ) : (
            <h2 className="text-sm font-medium">Contact</h2>
          )}
        </div>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {loaded.status === "loading" && !detail ? (
            <LoadingRow label="Loading this contact…" />
          ) : loaded.status === "failed" ? (
            <ErrorRow message={loaded.message} onRetry={reload} />
          ) : contact && detail ? (
            <>
              <WhoCard contact={contact} />
              <TagsCard
                key={contact.tags.join("\n")}
                contactId={contact.id}
                tags={contact.tags}
                knownTags={knownTags}
                onSaved={onChanged}
              />
              <SegmentsCard
                contactId={contact.id}
                theirs={detail.segments}
                segments={segments}
                onSegment={onSegment}
                onChanged={onChanged}
              />
              <NotesCard key={contact.id} contactId={contact.id} saved={detail.notes} />
              <PanelCard storageId="contact-activity" title="Activity" quiet>
                <ActivityList
                  contact={contact}
                  history={detail.history}
                  showJoined={!detail.hasMore}
                  emptyPage={historyPage > 1}
                />
                {/* Outside the list on purpose: a page that comes back empty
                    would otherwise leave no way back to the ones above it. */}
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
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The opening card: their name, address and what their status means, over
 * four facts in a grid ruled edge to edge. Type is Account for somebody who
 * can sign in, which opens their account, and Subscriber for an address alone.
 */
function WhoCard({ contact }: { contact: ContactItem }) {
  const name = fullName(contact)
  return (
    <PanelBox className="grid gap-3">
      <div className="grid min-w-0 gap-0.5">
        <p className="text-lg leading-tight font-semibold break-words">{name || contact.email}</p>
        {name ? <p className="text-sm break-words text-muted-foreground">{contact.email}</p> : null}
      </div>
      <p className="text-sm text-muted-foreground">{segmentStatusHints[contact.status]}</p>
      <dl className="-mx-4 -mb-4 grid grid-cols-2 border-t [&>div]:px-4 [&>div]:py-3 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
        <Fact label="Source" value={contact.source || "Not recorded"} />
        <Fact label="Joined" value={formatDate(contact.created_at)} />
        <Fact
          label="Last emailed"
          value={contact.lastEmailedAt ? formatDate(contact.lastEmailedAt) : "Never"}
        />
        <Fact
          label="Type"
          value={
            contact.userId ? (
              <Link to="/admin/users" search={{ open: contact.userId }} aria-label="Account, open their account">
                <Badge variant="outline" className="hover:bg-muted">
                  Account
                </Badge>
              </Link>
            ) : (
              <Badge variant="outline">Subscriber</Badge>
            )
          }
        />
      </dl>
    </PanelBox>
  )
}

/**
 * Their tags, each placed or removed saved at once. The pills change straight
 * away and go back if the save is refused, with the reason in the error
 * toast. Tags decide who is in a rules segment, so a save reads the list and
 * the segments again. Keyed by the saved tags, so a save from elsewhere starts
 * the box afresh.
 */
function TagsCard({
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
    <PanelCard storageId="contact-tags" title="Tags" meta={tags.length || undefined} quiet>
      <ContactTagsBox
        id={`contact-tags-${contactId}`}
        tags={tags}
        knownTags={knownTags}
        disabled={saving}
        onAdd={(tag) => save([...tags, tag])}
        onRemove={(tag) => void save(tags.filter((entry) => entry !== tag))}
      />
    </PanelCard>
  )
}

/**
 * The segments they are in right now, as pills: pressing one shows its
 * people in the list. A hand-picked segment's pill has an × that takes them
 * out, and the card's + puts them in another hand-picked one. A rules
 * segment has no ×, because its rules decide who is in it; its dot is solid
 * where a hand-picked one's is grey, as in the left panel.
 */
function SegmentsCard({
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
      toast.success(`Added to ${quoteOneLine(segment.name)}.`)
      await onChanged()
    })
  const remove = (segment: { id: string; name: string }) =>
    void run(async () => {
      await removeContactsFromWorkspaceSegment(segment.id, [contactId])
      toast.success(`Taken out of ${quoteOneLine(segment.name)}.`)
      await onChanged()
    })

  return (
    <PanelCard
      storageId="contact-segments"
      title="Segments"
      meta={theirs.length || undefined}
      quiet
      actionOpen={menuOpen}
      action={
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Add to a segment"
                  disabled={changing}
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                >
                  {changing ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Add to a segment</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-60">
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
                  : "No hand-picked segments yet. Make one with the + beside Segments on the left."}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {theirs.length ? (
        <div className="flex flex-wrap gap-2">
          {theirs.map((segment) => (
            <span
              key={segment.id}
              className="inline-flex h-7 items-center rounded-md border bg-background text-sm"
            >
              <button
                type="button"
                className="flex h-full items-center gap-1.5 rounded-md pr-1 pl-2 hover:underline"
                aria-label={`Show the people in ${segment.name}`}
                onClick={() => onSegment(segment.id)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    segment.kind === "static" ? "bg-muted-foreground/50" : "bg-foreground"
                  )}
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
    </PanelCard>
  )
}

/**
 * The Notes box (Tyler, 20 Oct 2026: "Add Notes, saves as you type"). It
 * saves 700ms after the last key, at once when the box is left, and before
 * the panel moves to somebody else. The card's heading says Saving… and then
 * Saved. A refused save keeps what was typed and says why.
 */
function NotesCard({ contactId, saved }: { contactId: string; saved: string }) {
  const [text, setText] = React.useState(saved)
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "failed">("idle")
  const lastSaved = React.useRef(saved)
  const pending = React.useRef<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = React.useCallback(
    async (quiet = false) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const next = pending.current
      pending.current = null
      if (next === null || next === lastSaved.current) return
      if (!quiet) setState("saving")
      try {
        await saveContactNotes(contactId, next)
        lastSaved.current = next
        if (!quiet) setState("saved")
      } catch (error) {
        if (!quiet) setState("failed")
        showErrorToast(getContactErrorMessage(error))
      }
    },
    [contactId]
  )

  // Leaving for another person saves what is still waiting.
  React.useEffect(() => () => void flush(true), [flush])

  return (
    <PanelCard
      storageId="contact-notes"
      title="Notes"
      meta={
        state === "saving"
          ? "Saving…"
          : state === "saved"
            ? "Saved"
            : state === "failed"
              ? "Not saved"
              : undefined
      }
      quiet
    >
      <Textarea
        aria-label="Notes"
        rows={1}
        maxLength={CONTACT_NOTES_MAX}
        value={text}
        placeholder="Anything worth remembering about them."
        onChange={(event) => {
          setText(event.target.value)
          pending.current = event.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), NOTES_SAVE_DELAY_MS)
        }}
        onBlur={() => void flush()}
      />
    </PanelCard>
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
                    to="/admin/newsletter/$broadcastId"
                    params={{ broadcastId: entry.subject.broadcastId }}
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
  if (source === "Account") return "Joined by making an account"
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

/** One labelled fact. A description list, because that is what these are. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <dt>
        <PanelHeading>{label}</PanelHeading>
      </dt>
      <dd className="min-w-0 text-sm break-words">{value}</dd>
    </div>
  )
}
