import * as React from "react"
import { CheckIcon, CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineError } from "@/components/ui/inline-error"
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
import { cn } from "@/lib/utils"

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
  // When the address was last copied, or 0. A moment rather than a yes/no
  // so a second press restarts the two seconds instead of being ignored.
  const [copiedAt, setCopiedAt] = React.useState(0)
  const copied = copiedAt > 0

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

  // "Copied" goes back to "Copy" after two seconds, so the next press can be
  // seen to have worked. The timer goes with the card if it unmounts first.
  React.useEffect(() => {
    if (!copiedAt) return
    const timer = window.setTimeout(() => setCopiedAt(0), 2000)
    return () => window.clearTimeout(timer)
  }, [copiedAt])

  const badgeUrl = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/badge/streak/${token}.svg`
    : ""

  const change = async (next: "on" | "off") => {
    setBusy(true)
    setCopiedAt(0)
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
      setCopiedAt(Date.now())
    } catch {
      // A blocked clipboard is not a failure worth a toast: the address is on
      // screen and selectable, so it can still be copied by hand.
      setCopiedAt(0)
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
              {/* Keyed by the address so a new link starts loading afresh. */}
              <BadgePreview key={badgeUrl} src={badgeUrl} />
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

/**
 * The real address, drawn the way another site would draw it, so what is on
 * screen here is literally what a reader gets. While it loads, the badge's own
 * 220×56 frame holds a spinner. If it fails, a sentence says so instead of the
 * browser's broken-image glyph.
 */
function BadgePreview({ src }: { src: string }) {
  const [state, setState] = React.useState<"loading" | "ready" | "failed">(
    "loading"
  )

  if (state === "failed") {
    return (
      <InlineError>
        Your badge could not be drawn just now. The address above has not
        changed, so press New link only if this keeps happening.
      </InlineError>
    )
  }

  return (
    <div className="relative h-14 w-[220px]">
      {state === "loading" ? (
        <span
          role="status"
          aria-label="Drawing your badge"
          className="absolute inset-0 grid place-items-center rounded-md border"
        >
          <Loader2Icon
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      ) : null}
      <img
        src={src}
        width={220}
        height={56}
        alt="Your streak badge"
        className={cn(state === "loading" && "invisible")}
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
      />
    </div>
  )
}
