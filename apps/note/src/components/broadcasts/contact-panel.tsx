import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  SettingsIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { PanelCard, PanelHeading } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  deleteContacts,
  getContactErrorMessage,
  loadContactDetail,
  saveContactTags,
  setContactsStatus,
  type ContactDelivery,
  type ContactDetail,
} from "@/lib/api/people/contacts"
import {
  CONTACT_SEGMENT_STATUSES,
  segmentStatusHints,
  segmentStatusLabels,
  segmentStatusSaidDone,
  type ContactSegmentStatus,
} from "@/lib/contacts/contact-segments"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

type Loaded =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; detail: ContactDetail }

/**
 * The Contacts dashboard's right panel: the open person. Who they are, their
 * tags, the segments they are in right now and every email sent to them, each
 * in a folding card. It replaced the contact window on 19 Oct 2026.
 *
 * The header holds their status, which saves the moment it is picked, a cog
 * whose menu deletes them, and an × that closes the panel. Tags save when the
 * box is left or Enter is pressed, and a refused save keeps what was typed.
 * Pressing a segment shows that segment's people in the list.
 *
 * The panel loads its own person by id, so a link can open somebody who is
 * not on the page the list is showing.
 */
export function ContactPanel({
  contactId,
  knownTags,
  refreshes,
  onClose,
  onChanged,
  onSegment,
}: {
  contactId: string | undefined
  /** Every tag in use in the workspace, offered as the tags box is typed in. */
  knownTags: string[]
  /** Goes up each time the list is read again; the panel reads its person again too. */
  refreshes: number
  onClose: () => void
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
            Click a contact to see their tags, segments and emails here.
          </p>
        </div>
      </>
    )
  }
  return (
    <OpenContact
      contactId={contactId}
      knownTags={knownTags}
      refreshes={refreshes}
      onClose={onClose}
      onChanged={onChanged}
      onSegment={onSegment}
    />
  )
}

function OpenContact({
  contactId,
  knownTags,
  refreshes,
  onClose,
  onChanged,
  onSegment,
}: {
  contactId: string
  knownTags: string[]
  refreshes: number
  onClose: () => void
  onChanged: () => Promise<void>
  onSegment: (segmentId: string) => void
}) {
  const [loaded, setLoaded] = React.useState<Loaded>({ status: "loading" })
  const [historyPage, setHistoryPage] = React.useState(1)
  const [attempt, setAttempt] = React.useState(0)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [runStatus, changingStatus] = useAsyncAction(getContactErrorMessage)
  const [runDelete, deleting] = useAsyncAction(getContactErrorMessage)

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

  const remove = () => {
    if (!contact) return
    void runDelete(async () => {
      await deleteContacts([contact.id])
      setConfirmDelete(false)
      toast.success(`Deleted ${contact.email}.`)
      onClose()
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
                <SelectTrigger className="w-fit" aria-label="Their status" disabled={changingStatus}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_SEGMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
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
        {contact ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Contact settings">
                    <SettingsIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Contact settings</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2Icon />
                Delete contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close the contact" onClick={onClose}>
              <XIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close the contact</TooltipContent>
        </Tooltip>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {loaded.status === "loading" && !detail ? (
            <LoadingRow label="Loading this contact…" />
          ) : loaded.status === "failed" ? (
            <ErrorRow message={loaded.message} onRetry={reload} />
          ) : contact && detail ? (
            <>
              <PanelCard storageId="contact-who" title="Who they are" quiet>
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-lg leading-tight font-semibold break-words">
                    {fullName(contact) || contact.email}
                  </p>
                  {fullName(contact) ? (
                    <p className="text-sm break-words text-muted-foreground">{contact.email}</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{segmentStatusHints[contact.status]}</p>
                <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  <Fact label="Where they came from" value={contact.source || "Not recorded"} />
                  <Fact label="Joined" value={formatDate(contact.created_at)} />
                  <Fact
                    label="Last emailed"
                    value={contact.lastEmailedAt ? formatDate(contact.lastEmailedAt) : "Never"}
                  />
                  <Fact
                    label="Account"
                    value={
                      contact.userId ? (
                        <Link
                          to="/admin/users"
                          search={{ open: contact.userId }}
                          className="underline underline-offset-2"
                        >
                          Open their account
                        </Link>
                      ) : (
                        "No account, just an address on the list"
                      )
                    }
                  />
                </dl>
              </PanelCard>
              <TagsCard
                key={contact.tags.join("\n")}
                contactId={contact.id}
                tags={contact.tags}
                knownTags={knownTags}
                onSaved={onChanged}
              />
              <PanelCard
                storageId="contact-segments"
                title="Segments"
                meta={detail.segments.length || undefined}
                quiet
              >
                {detail.segments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.segments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        aria-label={`Show the people in ${segment.name}`}
                        onClick={() => onSegment(segment.id)}
                      >
                        <Badge variant="outline">{segment.name}</Badge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">They are not in any segment right now.</p>
                )}
              </PanelCard>
              <PanelCard storageId="contact-emails" title="Emails sent" quiet>
                {detail.history.length ? (
                  <ul className="grid gap-3">
                    {detail.history.map((delivery) => (
                      <HistoryRow key={delivery.id} delivery={delivery} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {historyPage > 1 ? "Nothing more to show." : "We have not sent this person anything yet."}
                  </p>
                )}
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
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={contact ? `Delete ${quoteOneLine(contact.email)}?` : "Delete this contact?"}
        description="They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, set their status to Opted out instead."
        confirmLabel="Delete contact"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
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

function fullName(contact: { firstName: string | null; lastName: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}

/** One labelled fact. A description list, because that is what these are. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt>
        <PanelHeading>{label}</PanelHeading>
      </dt>
      <dd className="min-w-0 text-sm break-words">{value}</dd>
    </div>
  )
}

/**
 * One send, and what became of it. Bouncing is checked before failing:
 * `status` says what happened when the message was handed to the mail
 * provider, and a bounce arrives afterwards, so a message can be both sent
 * and bounced, and the bounce is the part worth reading.
 */
function HistoryRow({ delivery }: { delivery: ContactDelivery }) {
  const subject = delivery.subject.trim() || "No subject"

  return (
    <li className="grid gap-1 border-b pb-3 last:border-0 last:pb-0">
      <span className="flex flex-wrap items-center gap-2">
        {delivery.broadcastId ? (
          <Link
            to="/admin/newsletter/$broadcastId"
            params={{ broadcastId: delivery.broadcastId }}
            className="min-w-0 truncate text-sm font-medium underline underline-offset-2"
          >
            {subject}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium">{subject}</span>
        )}
        {delivery.bouncedAt ? (
          <Badge variant="destructive">Bounced</Badge>
        ) : delivery.status === "failed" ? (
          <Badge variant="destructive">Failed</Badge>
        ) : (
          <Badge variant="secondary">Sent</Badge>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(delivery.created_at)}
        {delivery.bouncedAt ? ` · bounced back ${formatDateTime(delivery.bouncedAt)}` : ""}
        {delivery.broadcastId ? "" : " · that newsletter has since been deleted"}
      </span>
      {delivery.status === "failed" && delivery.error ? (
        <InlineError>{delivery.error}</InlineError>
      ) : null}
    </li>
  )
}
