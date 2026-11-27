import * as React from "react"
import {
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getProfileErrorMessage,
  loadProfileBrowser,
  profileJob,
  type ProfileBrowser,
  type ProfileRow,
} from "@/lib/api/browser/profiles"
import { signedInWords } from "@/lib/browser/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the window reads the saved state while something is changing. */
const POLL_MS = 2_000

/**
 * A profile's browser, inside the app.
 *
 * The window frames Neko's own page with the name and the password already in
 * its address, so a person is let straight in and types neither. The address
 * and password come from the session row, encrypted there, and reach only the
 * signed-in admin who owns the profile.
 *
 * Opening, stopping and checking are jobs for the browser program; this window
 * only reads the rows it writes. Closing the window leaves the browser running,
 * so a sign-in is there the next time it is opened.
 *
 * The stream is published on this computer only today. Reaching it from the
 * server is file 05's part 20, and only the address handed back has to change.
 */
export function BrowserWindowDialog({
  profile,
  onClose,
  onChanged,
}: {
  /** Null when closed. */
  profile: ProfileRow | null
  onClose: () => void
  /** The list behind the window has something new to show. */
  onChanged: () => Promise<void>
}) {
  const [browser, setBrowser] = React.useState<ProfileBrowser | null>(null)
  const [asking, setAsking] = React.useState(false)
  // Set when Stop is pressed, so the picture goes at once instead of the
  // stream dying inside the frame while the close waits its turn.
  const [stopping, setStopping] = React.useState(false)
  const profileId = profile?.id ?? null

  const read = React.useCallback(async () => {
    if (!profileId) return
    try {
      setBrowser(await loadProfileBrowser(profileId))
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    }
  }, [profileId])

  // The list behind the window shows the signed-in name, so it is read again
  // the moment a check finishes. Kept in a ref so the timer is not restarted
  // every time the list hands down a new function.
  const onChangedRef = React.useRef(onChanged)
  React.useEffect(() => {
    onChangedRef.current = onChanged
  })

  React.useEffect(() => {
    if (!profileId) return
    let live = true
    let wasChecking = false
    const tick = async () => {
      try {
        const next = await loadProfileBrowser(profileId)
        if (!live) return
        setBrowser(next)
        if (wasChecking && !next.checking) void onChangedRef.current()
        wasChecking = next.checking
      } catch {
        // The next read is two seconds away and the last one is still true.
      }
    }
    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [profileId])

  async function ask(kind: "close" | "check") {
    if (!profileId) return
    setAsking(true)
    try {
      await profileJob(profileId, kind)
      if (kind === "close") setStopping(true)
      await read()
      await onChanged()
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  const state = browser?.state ?? "opening"
  const closing = stopping && state !== "stopped"

  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(next) => {
        if (!next) {
          setBrowser(null)
          setStopping(false)
          onClose()
        }
      }}
    >
      <DialogContent variant="admin" className="data-[variant=admin]:sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{profile?.name ?? "Browser"}</DialogTitle>
          <DialogDescription>
            {profile?.accounts.length
              ? `Signed in inside it: ${profile.accounts.map(signedInWords).join(", ")}.`
              : "Nothing is signed in inside this profile yet."}{" "}
            To type in it, turn on the switch under the picture to take control.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {closing ? (
            <div
              role="status"
              className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/50 p-6 text-center text-sm"
            >
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              <p className="max-w-md text-muted-foreground">
                Stopping the browser. It gets ten seconds to save its cookies first.
              </p>
            </div>
          ) : state === "open" && browser?.windowUrl ? (
            <iframe
              title={`${profile?.name ?? "Profile"} browser`}
              src={browser.windowUrl}
              allow="autoplay; clipboard-read; clipboard-write; fullscreen"
              className="aspect-video w-full rounded-lg border"
            />
          ) : (
            <div
              role="status"
              className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/50 p-6 text-center text-sm"
            >
              {state === "stopped" ? (
                <p className="max-w-md text-muted-foreground">
                  {browser?.lastError
                    ? `The browser did not open. ${browser.lastError}`
                    : "The browser is not running. Close this window and press Open on the profile to start it."}
                </p>
              ) : (
                <>
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                  <p className="max-w-md text-muted-foreground">
                    {browser?.waitingFor === "container"
                      ? "Starting the browser. The container comes up, then its screen, then Firefox. That takes 30 to 90 seconds."
                      : "Waiting for the browser program to pick this up. If this stays for more than a few seconds, the browser program is not running."}
                  </p>
                </>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {state !== "stopped" && !closing ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={asking || profile?.closing}
              onClick={() => void ask("close")}
            >
              <SquareIcon />
              Stop the browser
            </Button>
          ) : null}
          {browser?.windowUrl && !closing ? (
            <Button type="button" variant="outline" asChild>
              <a href={browser.windowUrl} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                Open in a new tab
              </a>
            </Button>
          ) : null}
          {state === "open" && !closing ? (
            <Button
              type="button"
              variant="outline"
              disabled={asking || browser?.checking}
              onClick={() => void ask("check")}
            >
              {browser?.checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check who is signed in
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setBrowser(null)
              setStopping(false)
              onClose()
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
