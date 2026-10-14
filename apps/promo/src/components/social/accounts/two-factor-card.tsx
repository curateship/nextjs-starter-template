import * as React from "react"
import { CopyIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getRedditAccountsErrorMessage,
  loadRedditAccountCode,
  setRedditAccountTwoFactor,
  type CurrentCode,
} from "@/lib/api/social/reddit-accounts"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the code is read again while it is on screen; it changes every 30 seconds. */
const REFRESH_MS = 1_000

/**
 * An account's authenticator code. With a secret saved it shows the current
 * six digits, the seconds left and Copy, read again every second; the secret
 * itself never comes back. Without one, a box to paste it into. It saves on
 * its own button, apart from the window's Save changes, and removing it asks
 * once on the same button.
 */
export function TwoFactorCard({
  accountId,
  saved,
  onChanged,
}: {
  accountId: string
  /** True when a secret is already saved. */
  saved: boolean
  onChanged: () => Promise<void>
}) {
  const [code, setCode] = React.useState<CurrentCode | null>(null)
  const [secret, setSecret] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  React.useEffect(() => {
    if (!saved) return
    let live = true
    const read = () =>
      loadRedditAccountCode(accountId).then(
        (next) => {
          if (live) setCode(next)
        },
        () => {}
      )
    void read()
    const timer = setInterval(() => void read(), REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [accountId, saved])

  async function save() {
    if (!secret.trim()) {
      setInvalid(true)
      showErrorToast("Paste the authenticator secret first.")
      return
    }
    setBusy(true)
    try {
      await setRedditAccountTwoFactor(accountId, secret)
      toast.success("Secret saved. Only the codes are shown from now on.")
      setSecret("")
      await onChanged()
    } catch (error) {
      setInvalid(true)
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      await setRedditAccountTwoFactor(accountId, null)
      toast.success("Secret removed.")
      setCode(null)
      setConfirming(false)
      await onChanged()
    } catch (error) {
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      toast.success("Code copied.")
    } catch {
      showErrorToast("This browser would not copy. Select the code and copy it by hand.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Two-factor code</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {saved ? (
          <>
            <div className="flex items-center gap-2">
              <div className="grid flex-1">
                <span className="text-xs text-muted-foreground">
                  {code ? `Changes in ${code.secondsLeft}s` : "Reading the code"}
                </span>
                <span className="font-mono text-2xl tracking-widest tabular-nums">{code?.code ?? "······"}</span>
              </div>
              <Hint label="Copy the code">
                <Button type="button" variant="outline" size="icon" aria-label="Copy the code" onClick={() => void copy()}>
                  <CopyIcon />
                </Button>
              </Hint>
            </div>
            <p className="text-sm text-muted-foreground">
              The same code an authenticator app shows. It is also beside the phone&apos;s screen
              when the account runs on a phone.
            </p>
            <div>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                {confirming ? "Remove it for good?" : "Remove the secret"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`two-factor-${accountId}`}>Authenticator secret</Label>
              <div className="flex gap-2">
                <Input
                  id={`two-factor-${accountId}`}
                  type="password"
                  autoComplete="off"
                  value={secret}
                  aria-invalid={invalid || undefined}
                  placeholder="The letters, or the otpauth:// link"
                  onChange={(event) => {
                    setSecret(event.target.value)
                    setInvalid(false)
                  }}
                  onKeyDown={(event) => {
                    // The window's own form would take Enter as Save changes.
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void save()
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Save secret
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The secret Reddit shows when two-factor is switched on, under &quot;can&apos;t scan
              the code&quot;. It is kept encrypted and never shown again.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
