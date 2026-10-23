import * as React from "react"
import { MailIcon } from "lucide-react"
import { toast } from "sonner"

import { CharacterCount } from "@/components/shared/character-count"
import { LISTING_ROW_CLASS } from "@/components/directory/public/listing-contact-links"
import {
  HumanCheck,
  type HumanCheckHandle,
} from "@/components/shell/human-check"
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
import { Textarea } from "@/components/ui/textarea"
import { messageOwner } from "@/lib/api/directory/owner-messages"
import { getOwnerMessageErrorMessage } from "@/lib/directory/owner-message-sentences"
import {
  OWNER_MESSAGE_MAX,
  OWNER_MESSAGE_NAME_MAX,
} from "@/lib/directory/field-lengths"
import { focusRing } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * "Message the owner", a line of the listing's card, and the window behind it.
 *
 * Only drawn when the site has it switched on and somebody holds the approved
 * claim; the page is told yes or no and never who. The visitor writes, the
 * site emails the owner with the visitor's address to reply to, and the
 * visitor gets a short note that it went.
 */
export function MessageOwnerButton({
  listingId,
  title,
  humanCheckSiteKey,
}: {
  listingId: string
  title: string
  humanCheckSiteKey: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  if (sent) {
    return (
      <p className={`${LISTING_ROW_CLASS} text-muted-foreground`}>
        Message sent. The owner replies to you by email.
      </p>
    )
  }

  return (
    <>
      {/* A plain button for the same reason "Report a problem" is one: this
          is a line of the card, and the UI standard forbids overriding a
          control's height at the call site to make one look like one. */}
      <button
        type="button"
        className={cn(
          `${LISTING_ROW_CLASS} w-full text-left hover:bg-accent/40`,
          focusRing
        )}
        onClick={() => setOpen(true)}
      >
        <MailIcon className="size-4 shrink-0" aria-hidden="true" />
        Message the owner
      </button>
      <MessageOwnerDialog
        open={open}
        listingId={listingId}
        title={title}
        humanCheckSiteKey={humanCheckSiteKey}
        onClose={() => setOpen(false)}
        onSent={() => {
          setOpen(false)
          setSent(true)
        }}
      />
    </>
  )
}

function MessageOwnerDialog({
  open,
  listingId,
  title,
  humanCheckSiteKey,
  onClose,
  onSent,
}: {
  open: boolean
  listingId: string
  title: string
  humanCheckSiteKey: string | null
  onClose: () => void
  onSent: () => void
}) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const humanCheckRef = React.useRef<HumanCheckHandle>(null)

  const dirty = Boolean(name.trim() || email.trim() || message.trim())

  async function send() {
    dismissErrorToast()
    setSending(true)
    try {
      const humanCheckToken = humanCheckSiteKey
        ? await humanCheckRef.current?.getToken()
        : undefined
      if (humanCheckSiteKey && !humanCheckToken) {
        showErrorToast(
          "We could not confirm you are a person. Please try again."
        )
        humanCheckRef.current?.reset()
        return
      }
      await messageOwner({
        listingId,
        name,
        email,
        message,
        humanCheckToken: humanCheckToken ?? undefined,
      })
      toast.success("Your message was sent")
      setName("")
      setEmail("")
      setMessage("")
      onSent()
    } catch (error) {
      showErrorToast(getOwnerMessageErrorMessage(error))
      // Each answer is good once, so a second try needs a fresh one.
      humanCheckRef.current?.reset()
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            {/* The listing's name sits in the line below, not in the title,
                for the reason the report window gives: a long name ran under
                the close button on a phone. */}
            <DialogTitle>Message the owner</DialogTitle>
            <DialogDescription>
              To the people who look after {title}. They answer you by email,
              and their address stays private.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>You</CardTitle>
                <CardDescription>
                  The owner sees your name and replies to this address. It is
                  never shown on the site.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="owner-message-name">
                      Your name
                    </FieldLabel>
                    <Input
                      id="owner-message-name"
                      autoComplete="name"
                      maxLength={OWNER_MESSAGE_NAME_MAX}
                      value={name}
                      disabled={sending}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="owner-message-email">
                      Your email
                    </FieldLabel>
                    <Input
                      id="owner-message-email"
                      type="email"
                      autoComplete="email"
                      maxLength={255}
                      value={email}
                      disabled={sending}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Your message</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="owner-message-text">Message</FieldLabel>
                    <CharacterCount value={message} max={OWNER_MESSAGE_MAX} />
                  </div>
                  <Textarea
                    id="owner-message-text"
                    rows={1}
                    maxLength={OWNER_MESSAGE_MAX}
                    placeholder="Do you take bookings for a group of twelve on a Saturday?"
                    value={message}
                    disabled={sending}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </div>
                <HumanCheck ref={humanCheckRef} siteKey={humanCheckSiteKey} />
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={requestClose}
            >
              Cancel
            </Button>
            {/* Kept enabled: the server says what is missing in a sentence. */}
            <Button
              type="button"
              disabled={sending}
              onClick={() => void send()}
            >
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
