import * as React from "react"
import { format } from "date-fns"
import {
  ArchiveIcon,
  CalendarClockIcon,
  Loader2Icon,
  MapPinIcon,
  MegaphoneIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  announcementStatus,
  announcementStatusLabels,
  windowText,
} from "@/lib/admin-dashboard/announcement-status"
import {
  ANNOUNCEMENT_LEVELS,
  announcementLevelLabels,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  type AnnouncementLevel,
} from "@/lib/announcement"
import {
  createAdminAnnouncement,
  deleteAdminAnnouncements,
  getAnnouncementErrorMessage,
  retireAdminAnnouncements,
  updateAdminAnnouncement,
  type Announcement,
} from "@/lib/api/content/announcements"
import { quoteOneLine } from "@/lib/format/quote-text"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const HIDE_LABEL = "Hide the announcement"

/** The ISO timestamp back as the whole day it belongs to, for the date picker. */
function toDateField(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

/**
 * The Announcements section's right panel: the announcement open, written
 * and changed in place (Tyler, 9 Nov 2026: "Move the announcement from the
 * top left settings into its own dashboard"; every editor in a merged
 * dashboard opens in the right panel). It replaced the announcement window,
 * in the CRM's one record frame:
 *
 * - **Header:** the title and when it runs, then the ⋮: its status and
 *   dates, Retire now and Delete, each asking first.
 * - **Body:** what you want to say, where it shows, and when.
 * - **Footer:** its status, then Save changes, or Create announcement for a
 *   new one. Nothing goes live until it is pressed, so a half-written
 *   banner never shows.
 *
 * What people see is the banner across the top of the shell
 * (`components/shell/announcement-banner`) and the notice in their tray.
 * Mounted fresh per announcement by its key, so the draft starts from the
 * right one. `onDirtyChange` tells the list there are unsaved changes, so
 * opening another row asks first.
 */
export function AnnouncementPanel({
  announcement,
  isNew,
  openId,
  onDirtyChange,
  onSaved,
  onRetired,
  onRemoved,
}: {
  /** The one open; null for a new one, or when the open id has gone. */
  announcement: Announcement | null
  /** A blank one being written, from New announcement. */
  isNew: boolean
  openId: string | undefined
  onDirtyChange: (dirty: boolean) => void
  /** After a create or a save, with what the server now holds. */
  onSaved: (announcement: Announcement) => void
  /** After a retire: the list reads the announcements again for its new end. */
  onRetired: () => void
  /** After a delete. */
  onRemoved: (announcementId: string) => void
}) {
  if (!announcement && !isNew) {
    return (
      <EmptyRecord
        title="Announcement"
        icon={<MegaphoneIcon aria-hidden />}
        line={openId ? "That announcement is not there any more." : "Click an announcement to change it here."}
        hideLabel={HIDE_LABEL}
      />
    )
  }
  return (
    <AnnouncementForm
      announcement={announcement}
      onDirtyChange={onDirtyChange}
      onSaved={onSaved}
      onRetired={onRetired}
      onRemoved={onRemoved}
    />
  )
}

const FORM_ID = "admin-announcement-form"

function AnnouncementForm({
  announcement,
  onDirtyChange,
  onSaved,
  onRetired,
  onRemoved,
}: {
  announcement: Announcement | null
  onDirtyChange: (dirty: boolean) => void
  onSaved: (announcement: Announcement) => void
  onRetired: () => void
  onRemoved: (announcementId: string) => void
}) {
  // When the panel opened, so whether it is still showing is read once.
  const [openedAt] = React.useState(() => Date.now())
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<"retire" | "delete" | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [title, setTitle] = React.useState(announcement?.title ?? "")
  const [body, setBody] = React.useState(announcement?.body ?? "")
  const [level, setLevel] = React.useState<AnnouncementLevel>(announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL)
  const [showBanner, setShowBanner] = React.useState(announcement?.showBanner ?? true)
  const [notify, setNotify] = React.useState(announcement?.notify ?? false)
  const [showToVisitors, setShowToVisitors] = React.useState(
    announcement?.showBanner === true && announcement.audience === "everyone"
  )
  const [startsOn, setStartsOn] = React.useState(toDateField(announcement?.startsAt ?? null))
  const [endsOn, setEndsOn] = React.useState(toDateField(announcement?.endsAt ?? null))
  const [saving, setSaving] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  // Flagged per field and only when Save is pressed, so a new one is not
  // marked wrong before anything has been typed in it.
  const [titleInvalid, setTitleInvalid] = React.useState(false)
  const [bodyInvalid, setBodyInvalid] = React.useState(false)

  // A new one opens with the cursor in Title so you can just type.
  React.useEffect(() => {
    if (!announcement) titleInputRef.current?.focus()
  }, [announcement])

  // What the panel opened holding. Anything different is work that opening
  // another row would throw away, so the list asks first.
  const dirty =
    title !== (announcement?.title ?? "") ||
    body !== (announcement?.body ?? "") ||
    level !== (announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL) ||
    showBanner !== (announcement?.showBanner ?? true) ||
    notify !== (announcement?.notify ?? false) ||
    showToVisitors !== (announcement?.audience === "everyone") ||
    startsOn !== toDateField(announcement?.startsAt ?? null) ||
    endsOn !== toDateField(announcement?.endsAt ?? null)
  React.useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  React.useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const save = async () => {
    dismissErrorToast()
    // The server rejects all of these too; caught here, the message is
    // instant and the text typed stays put.
    const titleMissing = !title.trim()
    const bodyMissing = !body.trim()
    setTitleInvalid(titleMissing)
    setBodyInvalid(bodyMissing)
    const failedCode = titleMissing
      ? "ANNOUNCEMENT_TITLE_REQUIRED"
      : bodyMissing
        ? "ANNOUNCEMENT_BODY_REQUIRED"
        : !showBanner && !notify
          ? "ANNOUNCEMENT_CHANNEL_REQUIRED"
          : startsOn && endsOn && endsOn < startsOn
            ? "ANNOUNCEMENT_WINDOW_INVALID"
            : null
    if (failedCode) {
      showErrorToast(getAnnouncementErrorMessage(new Error(failedCode)))
      return
    }
    const input = {
      title,
      body,
      level,
      audience: showBanner && showToVisitors ? ("everyone" as const) : ("app" as const),
      showBanner,
      notify,
      startsOn,
      endsOn,
    }
    setSaving(true)
    try {
      const saved = announcement
        ? await updateAdminAnnouncement(announcement.id, input)
        : await createAdminAnnouncement(input)
      toast.success(announcement ? "Announcement saved." : "Announcement created.")
      onDirtyChange(false)
      onSaved(saved)
    } catch (saveError) {
      showErrorToast(getAnnouncementErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const status = announcement ? announcementStatus(announcement, openedAt) : null
  const fromMenu = (next: "retire" | "delete") => () => {
    setMenuOpen(false)
    setConfirm(next)
  }

  return (
    <>
        <RecordFrame
          avatar={<MegaphoneIcon aria-hidden />}
          title={announcement ? announcement.title : "New announcement"}
          line={announcement ? windowText(announcement) : "Not saved yet"}
          hideLabel={HIDE_LABEL}
          actions={
            announcement && status ? (
              <TabbedMenu
                label="Announcement menu"
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
                        <PickGroup title="Announcement">
                          <PickRow label="Status" value={announcementStatusLabels[status]} disabled>
                            {null}
                          </PickRow>
                          <PickRow label="Runs" value={windowText(announcement)} disabled>
                            {null}
                          </PickRow>
                        </PickGroup>
                        <div className="grid">
                          {status === "ended" ? null : (
                            <MenuActionRow icon={<ArchiveIcon />} onClick={fromMenu("retire")}>
                              Retire now
                            </MenuActionRow>
                          )}
                          <MenuActionRow icon={<Trash2Icon />} destructive onClick={fromMenu("delete")}>
                            Delete announcement
                          </MenuActionRow>
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            ) : null
          }
          body={
            // The fields only: the header's buttons sit outside the form, so
            // none of them can send it. Save reaches it by its id.
            <form
              id={FORM_ID}
              className="contents"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <PanelCard icon={<MegaphoneIcon />} storageId="admin-announcement-say" title="What you want to say">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="announcement-title"
                      hint="One line, the way you would say it out loud, for example: Uploads are slow this morning."
                    >
                      Title
                    </FieldLabel>
                    <Input
                      id="announcement-title"
                      ref={titleInputRef}
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value)
                        if (event.target.value.trim()) setTitleInvalid(false)
                      }}
                      aria-invalid={titleInvalid || undefined}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="announcement-body"
                      hint="Line breaks are kept, so a couple of short sentences read fine here."
                    >
                      Message
                    </FieldLabel>
                    <Textarea
                      id="announcement-body"
                      rows={3}
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value)
                        if (event.target.value.trim()) setBodyInvalid(false)
                      }}
                      aria-invalid={bodyInvalid || undefined}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="announcement-level"
                      hint="Only changes how loud the banner looks. News is blue, a heads-up is amber, a problem is red."
                    >
                      Kind
                    </FieldLabel>
                    <Select value={level} onValueChange={(value) => setLevel(value as AnnouncementLevel)}>
                      <SelectTrigger id="announcement-level" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANNOUNCEMENT_LEVELS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {announcementLevelLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PanelCard>

              <PanelCard icon={<MapPinIcon />} storageId="admin-announcement-where" title="Where it shows">
                <div className="grid gap-4">
                  <p className="text-xs text-muted-foreground">
                    Pick at least one. Each person can close the banner; the tray notice keeps the message readable
                    afterwards.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="announcement-banner"
                      checked={showBanner}
                      onCheckedChange={(value) => {
                        const next = value === true
                        setShowBanner(next)
                        if (!next) setShowToVisitors(false)
                      }}
                    />
                    <Label htmlFor="announcement-banner" className="font-normal">
                      Banner across the top of the app
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="announcement-notify"
                      checked={notify}
                      onCheckedChange={(value) => setNotify(value === true)}
                    />
                    <Label htmlFor="announcement-notify" className="font-normal">
                      Notice in the notification tray
                    </Label>
                  </div>
                  <div className={cn("flex items-center gap-2", !showBanner && "text-muted-foreground")}>
                    <DisabledReason disabled={!showBanner} reason="Turn on the banner before showing it to visitors.">
                      <Checkbox
                        id="announcement-visitors"
                        checked={showToVisitors}
                        disabled={!showBanner}
                        onCheckedChange={(value) => setShowToVisitors(value === true)}
                      />
                    </DisabledReason>
                    <FieldLabel
                      htmlFor="announcement-visitors"
                      className="font-normal"
                      hint="Visitors do not have a notification tray, so they only ever see the banner."
                    >
                      Also show to visitors
                    </FieldLabel>
                  </div>
                </div>
              </PanelCard>

              <PanelCard icon={<CalendarClockIcon />} storageId="admin-announcement-when" title="When it shows">
                <div className="grid gap-4">
                  <p className="text-xs text-muted-foreground">Whole days, read the same way everywhere in the world.</p>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="announcement-starts-on" hint="Leave empty to start the moment you save it.">
                      Starts on
                    </FieldLabel>
                    <DatePicker
                      id="announcement-starts-on"
                      placeholder="Right away"
                      value={startsOn ? new Date(`${startsOn}T00:00:00`) : undefined}
                      onChange={(date) => setStartsOn(date ? format(date, "yyyy-MM-dd") : "")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="announcement-ends-on"
                      hint="Runs to the end of this day. Leave empty to keep it up until you retire it."
                    >
                      Ends on
                    </FieldLabel>
                    <DatePicker
                      id="announcement-ends-on"
                      placeholder="Until retired"
                      value={endsOn ? new Date(`${endsOn}T00:00:00`) : undefined}
                      onChange={(date) => setEndsOn(date ? format(date, "yyyy-MM-dd") : "")}
                    />
                  </div>
                </div>
              </PanelCard>
            </form>
          }
          footer={
            <>
              <FooterState>
                <span className="truncate text-muted-foreground">
                  {dirty ? "Unsaved changes" : status ? announcementStatusLabels[status] : "Not saved yet"}
                </span>
              </FooterState>
              <Button type="submit" form={FORM_ID} size="sm" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {announcement ? "Save changes" : "Create announcement"}
              </Button>
            </>
          }
        />
      {announcement ? (
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(next) => {
            if (!next) setConfirm(null)
          }}
          title={confirm === "delete" ? "Delete this announcement?" : "Take this announcement down?"}
          description={
            confirm === "delete"
              ? `${quoteOneLine(announcement.title)} disappears from everyone's banner and from their notification tray. This cannot be undone.`
              : `${quoteOneLine(announcement.title)} disappears from everyone's banner straight away. Notices already in people's trays stay there, and you can put it back up by giving it a new end date.`
          }
          confirmLabel={confirm === "delete" ? "Delete announcement" : "Retire"}
          // Retiring loses nothing, so only Delete is a red button.
          destructive={confirm === "delete"}
          loading={confirming}
          onConfirm={async () => {
            setConfirming(true)
            try {
              if (confirm === "delete") {
                await deleteAdminAnnouncements([announcement.id])
                toast.success("Announcement deleted.")
                setConfirm(null)
                onDirtyChange(false)
                onRemoved(announcement.id)
              } else {
                await retireAdminAnnouncements([announcement.id])
                toast.success("Announcement retired.")
                setConfirm(null)
                onRetired()
              }
            } catch (confirmError) {
              showErrorToast(getAnnouncementErrorMessage(confirmError))
            } finally {
              setConfirming(false)
            }
          }}
        />
      ) : null}
    </>
  )
}
