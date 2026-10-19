import * as React from "react"
import { ArrowLeftIcon, CircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { closePhoneScreen, pressPhoneKey, tapPhoneScreen, watchPhoneScreen, type ScreenFrame } from "@/lib/api/dating/phone"
import { datingErrorMessage } from "@/lib/dating/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the window asks for the newest picture. The phone sends about three a second. */
const ASK_EVERY_MS = 350

/** With no picture after this long, the window says why there may be none. */
const PATIENCE_MS = 10_000

/**
 * The phone's live screen, a few pictures a second, from anywhere. A click on
 * the picture is a tap at that spot on the phone, and Back and Home press the
 * phone's own buttons. Taps are refused while a walk is working the phone, so
 * a hand never pulls the screen out from under it.
 *
 * Asking for pictures is what keeps the phone sending them; closing the window
 * tells the server to stop at once, and ten seconds without an ask stops it
 * anyway.
 */
export function ScreenWindow({ phone, onClose }: { phone: { id: string; name: string } | null; onClose: () => void }) {
  const [frame, setFrame] = React.useState<ScreenFrame | null>(null)
  const [slow, setSlow] = React.useState(false)
  const phoneId = phone?.id ?? null

  React.useEffect(() => {
    if (!phoneId) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = () => {
      watchPhoneScreen(phoneId).then(
        (answer) => {
          if (!live) return
          if (answer.frame) setFrame(answer.frame)
          timer = setTimeout(ask, ASK_EVERY_MS)
        },
        (error: unknown) => {
          if (!live) return
          showErrorToast(datingErrorMessage(error))
          timer = setTimeout(ask, ASK_EVERY_MS * 6)
        }
      )
    }
    ask()
    const patience = setTimeout(() => live && setSlow(true), PATIENCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
      clearTimeout(patience)
      void closePhoneScreen(phoneId).catch(() => {})
    }
  }, [phoneId])

  const shown = frame && phoneId ? frame : null

  const picture = React.useRef<HTMLImageElement | null>(null)

  async function tap(event: React.MouseEvent<HTMLButtonElement>) {
    if (!phoneId || !shown || !picture.current) return
    const box = picture.current.getBoundingClientRect()
    const x = Math.round(((event.clientX - box.left) / box.width) * shown.screenWidth)
    const y = Math.round(((event.clientY - box.top) / box.height) * shown.screenHeight)
    try {
      await tapPhoneScreen(phoneId, x, y)
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
    }
  }

  async function press(key: "back" | "home") {
    if (!phoneId) return
    try {
      await pressPhoneKey(phoneId, key)
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
    }
  }

  return (
    <Dialog open={phone !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{phone?.name ?? "Phone"}'s screen</DialogTitle>
          <DialogDescription>A few pictures a second. Click the picture to tap the phone there.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid place-items-center gap-3">
            {shown ? (
              <button type="button" className="cursor-pointer rounded-lg" aria-label="Tap the phone where you click" onClick={(event) => void tap(event)}>
                <img
                  ref={picture}
                  src={`data:image/jpeg;base64,${shown.jpeg}`}
                  alt={`${phone?.name ?? "The phone"}'s screen`}
                  className="max-h-[62vh] w-auto rounded-lg border"
                />
              </button>
            ) : (
              <p className="flex max-w-sm items-center gap-2 py-16 text-sm text-muted-foreground">
                {slow ? null : <Loader2Icon className="size-4 shrink-0 animate-spin" />}
                {slow
                  ? "No picture yet. The phone may be away or asleep, or the Date app is not running on it. Open the app on the phone and check it says the server answered."
                  : "Waiting for the phone's first picture."}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void press("back")}>
                <ArrowLeftIcon /> Back
              </Button>
              <Button type="button" variant="outline" onClick={() => void press("home")}>
                <CircleIcon /> Home
              </Button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
