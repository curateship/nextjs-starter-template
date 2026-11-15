import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ANNOUNCEMENT_LEVELS,
  announcementLevelLabels,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  type AnnouncementLevel,
} from "@/lib/announcement"
import { createAdminAnnouncement, getAnnouncementErrorMessage } from "@/lib/api/content/announcements"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * New announcement, in the Admin page's + dropdown rather than sending the
 * admin to the Announcements section's right panel (Tyler, 9 Nov 2026: "Add
 * new announcemtn here should be a dropdown instead of forwarding me to the
 * right panel").
 *
 * The title, the message, how loud it looks, and where it shows: the banner
 * across the app, the notification tray, or both. It starts at once and has no
 * end; dates and showing it to visitors are set on the announcement itself in
 * Announcements. Closing keeps what was typed for the next opening.
 */
export function useAnnouncementForm(onCreated: () => Promise<void>) {
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [level, setLevel] = React.useState<AnnouncementLevel>(DEFAULT_ANNOUNCEMENT_LEVEL)
  const [showBanner, setShowBanner] = React.useState(true)
  const [notify, setNotify] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [run, saving] = useAsyncAction(getAnnouncementErrorMessage)

  /** Publishes it; true once it exists. */
  const submit = async (): Promise<boolean> => {
    setAttempted(true)
    if (!title.trim()) {
      showErrorToast("An announcement needs a title.")
      return false
    }
    if (!body.trim()) {
      showErrorToast("An announcement needs a message.")
      return false
    }
    if (!showBanner && !notify) {
      showErrorToast("Pick where it shows: the banner, the tray, or both.")
      return false
    }
    let created = false
    await run(async () => {
      await createAdminAnnouncement({
        title: title.trim(),
        body: body.trim(),
        level,
        audience: "app",
        showBanner,
        notify,
      })
      setTitle("")
      setBody("")
      setLevel(DEFAULT_ANNOUNCEMENT_LEVEL)
      setShowBanner(true)
      setNotify(false)
      setAttempted(false)
      created = true
      await onCreated()
    })
    return created
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="new-announcement-title">Title</Label>
        <Input
          id="new-announcement-title"
          autoFocus
          value={title}
          maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={(attempted && !title.trim()) || undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-announcement-body">Message</Label>
        <Textarea
          id="new-announcement-body"
          rows={3}
          value={body}
          maxLength={MAX_ANNOUNCEMENT_BODY_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={(attempted && !body.trim()) || undefined}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="new-announcement-level"
          hint="Only changes how loud the banner looks. News is blue, a heads-up is amber, a problem is red."
        >
          Kind
        </FieldLabel>
        <Select value={level} onValueChange={(value) => setLevel(value as AnnouncementLevel)}>
          <SelectTrigger id="new-announcement-level" className="w-full">
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
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="new-announcement-banner"
            checked={showBanner}
            onCheckedChange={(value) => setShowBanner(value === true)}
          />
          <Label htmlFor="new-announcement-banner" className="font-normal">
            Banner across the top of the app
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="new-announcement-notify"
            checked={notify}
            onCheckedChange={(value) => setNotify(value === true)}
          />
          <Label htmlFor="new-announcement-notify" className="font-normal">
            Notice in the notification tray
          </Label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        It starts now. Dates and visitors are set on it in Announcements.
      </p>
    </>
  )

  return { fields, submit, saving }
}
