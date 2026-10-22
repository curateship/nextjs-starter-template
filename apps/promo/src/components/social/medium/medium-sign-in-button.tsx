import * as React from "react"
import { KeyRoundIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getMediumErrorMessage, pasteMediumSignInLink } from "@/lib/api/social/medium"
import { isMediumSignInLink } from "@/lib/social/medium/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Paste sign-in link (part 2). Medium signs people in with a link it emails,
 * not a password, and pressing that link in an everyday browser signs that
 * browser in, which is the wrong one. Pasted here, the link is opened inside
 * the account's own browser profile, and who is signed in is read straight
 * after. Only an https link on medium.com is taken.
 *
 * On a Medium account's row on the Accounts dashboard, and beside Respond as
 * in the Medium module.
 */
export function MediumSignInButton({
  accountId,
  name,
  onQueued,
}: {
  accountId: string
  /** "@sam", or "Not signed in". */
  name: string
  onQueued?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const wrong = tried && !isMediumSignInLink(link)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (!isMediumSignInLink(link)) {
      showErrorToast("Paste the link from Medium's email. It starts with https://medium.com/.")
      return
    }
    setBusy(true)
    try {
      await pasteMediumSignInLink(accountId, link.trim())
      toast.success("Opening the link in the account's own browser. Who is signed in shows once it has.")
      setOpen(false)
      setLink("")
      setTried(false)
      onQueued?.()
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={`Paste a Medium sign-in link for ${name}`}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Paste a Medium sign-in link for ${name}`}>
            <KeyRoundIcon className="size-4" />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80 p-3">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`medium-sign-in-link-${accountId}`}
              hint="Ask Medium to email you a sign-in link for this account, copy the link out of the email, and paste it here straight away. It opens inside this account's own browser, so your everyday browser stays signed out of it."
            >
              Medium&apos;s sign-in link
            </FieldLabel>
            <Input
              id={`medium-sign-in-link-${accountId}`}
              value={link}
              autoFocus
              aria-invalid={wrong || undefined}
              placeholder="https://medium.com/m/callback/email?token=..."
              onChange={(event) => setLink(event.target.value)}
              onBlur={() => setTried(link.trim() !== "")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Open in its browser
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
