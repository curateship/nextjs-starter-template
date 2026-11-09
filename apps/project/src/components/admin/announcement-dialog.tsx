import * as React from "react"
import {
  format,
} from "date-fns"
import {
  Loader2Icon,
} from "lucide-react"
import {
  toast,
} from "sonner"
import {
  Button,
} from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Checkbox,
} from "@/components/ui/checkbox"
import {
  ConfirmDialog,
} from "@/components/ui/confirm-dialog"
import {
  DatePicker,
} from "@/components/ui/date-picker"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FieldLabel,
} from "@/components/ui/field-label"
import {
  FormDialog,
} from "@/components/ui/form-dialog"
import {
  Input,
} from "@/components/ui/input"
import {
  Label,
} from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Textarea,
} from "@/components/ui/textarea"
import {
  cn,
} from "@/lib/utils"
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
import {
  DisabledReason,
} from "@/components/ui/disabled-reason"
import {
  dismissErrorToast,
  showErrorToast,
} from "@/lib/toast/error-toast"
import { quoteOneLine } from "@/lib/format/quote-text"
import { announcementStatus } from "@/lib/admin-dashboard/announcement-status"

/**
 * The window an announcement is written and changed in, with Retire and
 * Delete at its foot. Opened from the Admin dashboard's Announcements tab in
 * the left panel's ⋮ (Tyler, 8 Nov 2026: "The announcement also doesnt need a
 * table. It can live in the top left 3 dots dropdown in a tab"). What people
 * see is the banner across the top of the shell
 * (`components/shell/announcement-banner`) and the notice in their tray.
 */


/** The ISO timestamp back as the whole day it belongs to, for the date picker. */
function toDateField(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

export function AnnouncementDialog({
  open,
  announcement,
  onClose,
  onSaved,
}: {
  open: boolean
  announcement: Announcement | null
  onClose: () => void
  /** After a save, a retire or a delete, with the window already closing. */
  onSaved: () => Promise<void>
}) {
  const [confirm, setConfirm] = React.useState<"retire" | "delete" | null>(null)
  // When the window opened, so whether it is still showing is read once.
  const [openedAt] = React.useState(() => Date.now())
  const [confirming, setConfirming] = React.useState(false)
  // Mounted fresh per announcement by its key in the parent, so the draft starts
  // from the right one without an effect resetting it after the first render.
  const [title, setTitle] = React.useState(announcement?.title ?? "")
  const [body, setBody] = React.useState(announcement?.body ?? "")
  const [level, setLevel] = React.useState<AnnouncementLevel>(
    announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL
  )
  const [showBanner, setShowBanner] = React.useState(
    announcement?.showBanner ?? true
  )
  const [notify, setNotify] = React.useState(announcement?.notify ?? false)
  const [showToVisitors, setShowToVisitors] = React.useState(
    announcement?.showBanner === true && announcement.audience === "everyone"
  )
  const [startsOn, setStartsOn] = React.useState(
    toDateField(announcement?.startsAt ?? null)
  )
  const [endsOn, setEndsOn] = React.useState(
    toDateField(announcement?.endsAt ?? null)
  )
  const [saving, setSaving] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  // Flagged per field and only when Create/Save is pressed. A new announcement
  // opens empty, so complaining as focus passes through a field would tell the
  // writer off before they have had a chance to type in it.
  const [titleInvalid, setTitleInvalid] = React.useState(false)
  const [bodyInvalid, setBodyInvalid] = React.useState(false)

  const handleSave = React.useCallback(async () => {
    dismissErrorToast()

    // The server rejects all three too; catching them here keeps the message
    // instant and the entered text untouched.
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
      if (announcement) {
        await updateAdminAnnouncement(announcement.id, input)
        toast.success("Announcement saved.")
      } else {
        await createAdminAnnouncement(input)
        toast.success("Announcement created.")
      }
      await onSaved()
    } catch (saveError) {
      showErrorToast(getAnnouncementErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [
    announcement,
    body,
    endsOn,
    level,
    notify,
    onSaved,
    showBanner,
    showToVisitors,
    startsOn,
    title,
  ])

  // What the window opened holding. Anything different from this is work a
  // stray click outside would throw away, so the window asks first.
  const dirty =
    title !== (announcement?.title ?? "") ||
    body !== (announcement?.body ?? "") ||
    level !== (announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL) ||
    showBanner !== (announcement?.showBanner ?? true) ||
    notify !== (announcement?.notify ?? false) ||
    showToVisitors !== (announcement?.audience === "everyone") ||
    startsOn !== toDateField(announcement?.startsAt ?? null) ||
    endsOn !== toDateField(announcement?.endsAt ?? null)

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
      <DialogContent
        variant="admin"
        className="sm:max-w-lg"
        // A new announcement opens with the cursor in Title so you can just
        // type. Editing an existing one keeps the window's normal focus, since
        // landing in a filled field invites a stray edit.
        onOpenAutoFocus={(event) => {
          if (announcement) return
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {announcement ? "Edit announcement" : "New announcement"}
          </DialogTitle>
          <DialogDescription>
            Everyone signed in sees this, whichever plan they are on.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What you want to say</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="announcement-level"
                    hint="Only changes how loud the banner looks. News is blue, a heads-up is amber, a problem is red."
                  >
                    Kind
                  </FieldLabel>
                  <Select
                    value={level}
                    onValueChange={(value) =>
                      setLevel(value as AnnouncementLevel)
                    }
                  >
                    <SelectTrigger
                      id="announcement-level"
                      className="w-full sm:w-fit"
                    >
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
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="announcement-title"
                    hint="One line, the way you would say it out loud — for example, Uploads are slow this morning."
                  >
                    Title
                  </FieldLabel>
                  <Input
                    id="announcement-title"
                    ref={titleInputRef}
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                      // Clear the mark as soon as it is answered, rather than
                      // leaving a red ring on a field that now has a title.
                      if (event.target.value.trim()) setTitleInvalid(false)
                    }}
                    aria-invalid={titleInvalid || undefined}
                  />
                </div>
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
                  rows={1}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value)
                    if (event.target.value.trim()) setBodyInvalid(false)
                  }}
                  aria-invalid={bodyInvalid || undefined}
                />
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Where it shows</CardTitle>
              <CardDescription>
                Pick at least one. The banner is hard to miss and each person can
                close it; the tray notice keeps the message readable afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
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
                  <Checkbox id="announcement-visitors" checked={showToVisitors} disabled={!showBanner} onCheckedChange={(value) => setShowToVisitors(value === true)} />
                </DisabledReason>
                <FieldLabel htmlFor="announcement-visitors" className="font-normal" hint="Visitors do not have a notification tray, so they only ever see the banner.">
                  Also show to visitors
                </FieldLabel>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>When it shows</CardTitle>
              <CardDescription>
                Whole days, read the same way everywhere in the world.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="announcement-starts-on"
                    hint="Leave empty to start the moment you save it."
                  >
                    Starts on
                  </FieldLabel>
                  <DatePicker
                    id="announcement-starts-on"
                    placeholder="Right away"
                    value={startsOn ? new Date(`${startsOn}T00:00:00`) : undefined}
                    onChange={(date) =>
                      setStartsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
                <div className="grid gap-2 sm:flex-1">
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
                    onChange={(date) =>
                      setEndsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          {announcement ? (
            <div className="mr-auto flex gap-1">
              {announcementStatus(announcement, openedAt) === "ended" ? null : (
                <Button type="button" variant="ghost" disabled={saving} onClick={() => setConfirm("retire")}>
                  Retire now
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => setConfirm("delete")}
              >
                Delete
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {announcement ? "Save changes" : "Create announcement"}
          </Button>
        </DialogFooter>
        </form>
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
                } else {
                  await retireAdminAnnouncements([announcement.id])
                  toast.success("Announcement retired.")
                }
                setConfirm(null)
                await onSaved()
              } catch (confirmError) {
                showErrorToast(getAnnouncementErrorMessage(confirmError))
              } finally {
                setConfirming(false)
              }
            }}
          />
        ) : null}
      </DialogContent>
      )}
    </FormDialog>
  )
}
