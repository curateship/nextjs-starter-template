import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getContactErrorMessage,
  loadContactDetail,
  saveContact,
  setContactsStatus,
  type ContactDelivery,
  type ContactDetail,
  type ContactItem,
} from "@/lib/api/people/contacts"
import { segmentStatusLabels } from "@/lib/contacts/contact-segments"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/** Tags as one line of text, the same way every other tag field in the app reads. */
function tagsToText(tags: string[]) {
  return tags.join(", ")
}

function textToTags(text: string) {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * One contact, everything about them, over the list you were reading.
 *
 * The list already holds their name, address, tags and status, so those are
 * drawn the moment it opens. The two things that need their own queries — the
 * segments they are in right now and every email they have been sent — arrive
 * a beat later and say so while they are coming.
 *
 * The window holds one piece of typed work, their tags, so it is a `FormDialog`
 * with a Save. Taking somebody off the list is a button rather than part of
 * that save: it is the same action the row's own button performs, and it would
 * be a strange kind of Cancel that quietly put somebody back on a mailing list.
 */
export function ContactDetailDialog({
  contact,
  open,
  onClose,
  onChanged,
}: {
  /** The row that was clicked, or null once the window has finished closing. */
  contact: ContactItem | null
  open: boolean
  onClose: () => void
  /** Re-reads the list behind this window after a change lands. */
  onChanged: () => Promise<void>
}) {
  /** Their tags as this window found them, so "dirty" has something to mean. */
  const openedTags = tagsToText(contact?.tags ?? [])

  // Seeded from the contact, not from empty. The list draws this window with a
  // `key` per person, so it mounts already open and the reopen check below
  // never runs on the first one — leaving an empty box whose Save would have
  // taken every tag off them.
  const [tagsText, setTagsText] = React.useState(openedTags)
  const [detail, setDetail] = React.useState<ContactDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [historyPage, setHistoryPage] = React.useState(1)
  const [reloads, setReloads] = React.useState(0)
  const [runSave, saving] = useAsyncAction(getContactErrorMessage)
  const [runStatus, changingStatus] = useAsyncAction(getContactErrorMessage)

  // Reopening the same person is a fresh start too: same `key`, so nothing
  // remounts, and a half-typed tag edit abandoned last time would still be sat
  // in the box.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTagsText(openedTags)
      setDetail(null)
      setHistoryPage(1)
    }
  }

  // A failure from somewhere else never expires on its own, so clear it as the
  // window opens rather than leaving a stale red toast over a fresh one.
  React.useEffect(() => {
    if (open) dismissErrorToast()
  }, [open])

  const contactId = contact?.id
  React.useEffect(() => {
    if (!open || !contactId) return
    let active = true
    setLoadingDetail(true)
    loadContactDetail(contactId, historyPage)
      .then((loaded) => {
        if (active) setDetail(loaded)
      })
      .catch((error) => {
        if (active) showErrorToast(getContactErrorMessage(error))
      })
      .finally(() => {
        if (active) setLoadingDetail(false)
      })
    return () => {
      active = false
    }
  }, [open, contactId, historyPage, reloads])

  if (!contact) return null

  const dirty = tagsText !== openedTags
  const subscribed = contact.status === "subscribed"

  const save = async () => {
    await runSave(async () => {
      await saveContact({
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        tags: textToTags(tagsText),
      })
      await onChanged()
      // Tags decide who is in a rules segment, so the segments below this are
      // now out of date by definition. Asked again rather than left stale.
      setReloads((count) => count + 1)
      toast.success(`Saved ${quoteOneLine(contact.email)}.`)
    })
  }

  const toggleStatus = async () => {
    const next = subscribed ? "unsubscribed" : "subscribed"
    await runStatus(async () => {
      await setContactsStatus([contact.id], next)
      await onChanged()
      toast.success(
        next === "unsubscribed"
          ? `${contact.email} will not get any more.`
          : `${contact.email} is back on the list.`
      )
    })
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle className="truncate">{contact.email}</DialogTitle>
            <DialogDescription>
              Everything recorded about this person, including every email sent
              to them.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Who they are</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Fact label="Name" value={fullName(contact) || "—"} />
                    <Fact label="Email" value={contact.email} />
                    <Fact
                      label="Where they came from"
                      value={contact.source || "Not recorded"}
                    />
                    <Fact label="Joined" value={formatDate(contact.created_at)} />
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
                          "No account — just an address on the list"
                        )
                      }
                    />
                    <Fact
                      label="Getting the newsletter"
                      value={
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={subscribed ? "secondary" : "destructive"}
                          >
                            {segmentStatusLabels[contact.status]}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={changingStatus}
                            onClick={() => void toggleStatus()}
                          >
                            {changingStatus ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : null}
                            {subscribed ? "Take off" : "Put back"}
                          </Button>
                        </span>
                      }
                    />
                  </dl>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Tags</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="contact-detail-tags"
                      hint="Separate them with commas. Tags are how a newsletter goes to some people rather than everyone, so changing these can move somebody in or out of a segment."
                    >
                      Their tags
                    </FieldLabel>
                    <Input
                      id="contact-detail-tags"
                      value={tagsText}
                      placeholder="customers, beta"
                      disabled={saving}
                      onChange={(event) => setTagsText(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Segments they are in</CardTitle>
                  <CardDescription>
                    Worked out right now from the segments&rsquo; own rules, not
                    from a stored list.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingDetail && !detail ? (
                    <LoadingRow label="Working out their segments…" />
                  ) : detail?.segments.length ? (
                    <div className="flex flex-wrap gap-2">
                      {detail.segments.map((segment) => (
                        <Link
                          key={segment.id}
                          to="/admin/segments"
                          search={{ open: segment.id }}
                        >
                          <Badge variant="outline">{segment.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      They are not in any segment right now.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Emails sent to them</CardTitle>
                  <CardDescription>
                    Newest first. This is a record of what happened and cannot be
                    edited.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {loadingDetail && !detail ? (
                    <LoadingRow label="Fetching what was sent…" />
                  ) : detail?.history.length ? (
                    <ul className="grid gap-3">
                      {detail.history.map((delivery) => (
                        <HistoryRow key={delivery.id} delivery={delivery} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {historyPage > 1
                        ? "Nothing more to show."
                        : "We have not sent this person anything yet."}
                    </p>
                  )}

                  {/* Outside the list on purpose. A page that comes back empty
                      — somebody deleted these sends between the two requests —
                      would otherwise leave no way back to the ones above it. */}
                  {detail && (detail.hasMore || historyPage > 1) ? (
                    <div className="flex items-center gap-2 border-t pt-3">
                      <span className="flex-1 text-xs text-muted-foreground">
                        Page {historyPage}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={historyPage === 1 || loadingDetail}
                        onClick={() =>
                          setHistoryPage((current) => Math.max(1, current - 1))
                        }
                      >
                        Newer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!detail.hasMore || loadingDetail}
                        onClick={() => setHistoryPage((current) => current + 1)}
                      >
                        Older
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function fullName(contact: ContactItem) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}

/** One labelled fact. A description list, because that is what these are. */
function Fact({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{value}</dd>
    </div>
  )
}

/**
 * One send, and what became of it.
 *
 * Bouncing is checked before failing, because they are two different moments:
 * `status` says what happened when the message was handed to the mail provider,
 * and a bounce arrives afterwards. A message can therefore be both sent and
 * bounced, and the bounce is the part worth reading.
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
          <span className="min-w-0 truncate text-sm font-medium" title={subject}>
            {subject}
          </span>
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
        {delivery.bouncedAt
          ? ` · bounced back ${formatDateTime(delivery.bouncedAt)}`
          : ""}
        {delivery.broadcastId ? "" : " · that newsletter has since been deleted"}
      </span>
      {delivery.status === "failed" && delivery.error ? (
        <span className="text-xs text-destructive">{delivery.error}</span>
      ) : null}
    </li>
  )
}
