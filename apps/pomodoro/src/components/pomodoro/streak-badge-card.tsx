import * as React from "react"
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  loadStreakBadge,
  turnOffStreakBadge,
  turnOnStreakBadge,
} from "@/lib/api/pomodoro/streak-badge"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The streak badge's controls, on Settings → Profile.
 *
 * Off until switched on, and the address only exists while it is on. The
 * switch is the whole model: on writes a new secret address, off clears it
 * and the old address stops working. "New link" is the same pair in one
 * press, for a link that has been shared somewhere it should not have been.
 */
export default function StreakBadgeCard() {
  const [token, setToken] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    let live = true
    loadStreakBadge(browserTimezone())
      .then((result) => {
        if (!live) return
        setToken(result.token)
        setLoaded(true)
      })
      .catch(() => {
        if (live) showErrorToast("Your streak badge settings could not be loaded.")
      })
    return () => {
      live = false
    }
  }, [])

  const badgeUrl = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/badge/streak/${token}.svg`
    : ""

  const change = async (next: "on" | "off") => {
    setBusy(true)
    setCopied(false)
    try {
      const result =
        next === "on"
          ? await turnOnStreakBadge(browserTimezone())
          : await turnOffStreakBadge()
      setToken(result.token)
    } catch {
      showErrorToast(
        next === "on"
          ? "The streak badge could not be switched on."
          : "The streak badge could not be switched off."
      )
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(badgeUrl)
      setCopied(true)
    } catch {
      // A blocked clipboard is not a failure worth a toast: the address is on
      // screen and selectable, so it can still be copied by hand.
      setCopied(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Streak badge</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="streak-badge"
            checked={!!token}
            disabled={!loaded || busy}
            onCheckedChange={(next) => void change(next ? "on" : "off")}
          />
          <Label htmlFor="streak-badge">
            Publish my streak at a secret address
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Gives you a small image you can put on a blog or a Notion page. It
          shows your current streak and your public display name, and nothing
          else about your account. Anyone with the address can see it, so treat
          it like a link to an unlisted page. Switching this off, or asking for
          a new link, stops the old one working.
        </p>

        {token ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="streak-badge-url">Badge address</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="streak-badge-url"
                  className="min-w-0 flex-1"
                  readOnly
                  value={badgeUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button variant="outline" onClick={() => void copy()}>
                  {copied ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <CopyIcon aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void change("on")}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  New link
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Preview</span>
              {/* The real address, drawn the way another site would draw it,
                  so what is on screen here is literally what a reader gets. */}
              <img
                src={badgeUrl}
                width={220}
                height={56}
                alt="Your streak badge"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="streak-badge-embed">To embed it</Label>
              <Input
                id="streak-badge-embed"
                className="font-mono text-xs"
                readOnly
                value={`<img src="${badgeUrl}" width="220" height="56" alt="focus streak">`}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
