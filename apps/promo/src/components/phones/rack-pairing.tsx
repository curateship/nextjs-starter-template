import * as React from "react"
import { CheckCircle2Icon, CopyIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { getPhoneErrorMessage, loadRack, makePairingCode, type PairingCode } from "@/lib/api/phones/phones"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the card asks whether the rack program has paired yet. */
const PAIRED_POLL_MS = 3_000

/** How often the minutes left on the code are counted again. */
const CLOCK_MS = 15_000

/**
 * Installing the rack program on the computer the phones plug into, for one
 * rack (Racks dashboard, parts 76, 77 and 78): the steps, a one-time code
 * with the one command that uses it, how many minutes the code has left, and
 * New code. While a code is showing, the card asks every 3 seconds
 * whether the program has paired, and says "Paired" the moment it has.
 *
 * Only a rack that is not connected gets a code; the server refuses one for
 * a connected rack, so a second computer can never take a working rack's key.
 */
export function RackPairing({
  rackId,
  makeAtOnce = false,
  onPaired,
}: {
  rackId: string
  /** Makes the first code as the card opens, as the New rack window does. */
  makeAtOnce?: boolean
  onPaired: () => void
}) {
  const [pairing, setPairing] = React.useState<PairingCode | null>(null)
  const [making, setMaking] = React.useState(false)
  const [paired, setPaired] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())

  const makeCode = React.useCallback(async () => {
    setMaking(true)
    try {
      setPairing(await makePairingCode(rackId))
      setNow(Date.now())
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setMaking(false)
    }
  }, [rackId])

  const madeAtOnce = React.useRef(false)
  React.useEffect(() => {
    if (!makeAtOnce || madeAtOnce.current) return
    madeAtOnce.current = true
    void makeCode()
  }, [makeAtOnce, makeCode])

  const expired = pairing ? new Date(pairing.expiresAt).getTime() <= now : false
  const waiting = Boolean(pairing) && !expired && !paired

  // The minutes left, counted again while a code shows.
  React.useEffect(() => {
    if (!pairing || paired) return
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [pairing, paired])

  // Asks whether the program has spent the code. A code is only ever made for
  // a rack that is not connected, so the rack showing as paired means it did.
  const onPairedRef = React.useRef(onPaired)
  React.useEffect(() => {
    onPairedRef.current = onPaired
  })
  React.useEffect(() => {
    if (!waiting) return
    let live = true
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return
      loadRack(rackId).then(
        (rack) => {
          if (!live || rack.state === "unpaired" || rack.state === "disconnected") return
          setPaired(true)
          toast.success(`${rack.name} is paired.`)
          onPairedRef.current()
        },
        () => {}
      )
    }, PAIRED_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [rackId, waiting])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Command copied.")
    } catch {
      showErrorToast("This browser would not copy. Select the command and copy it by hand.")
    }
  }

  if (paired) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Paired. The rack program is installed and its phones show within a minute.
      </p>
    )
  }

  const minutesLeft = pairing ? Math.max(1, Math.ceil((new Date(pairing.expiresAt).getTime() - now) / 60_000)) : 0

  return (
    // One column as wide as its box, so the steps wrap inside a narrow side panel.
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-sm">
      <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
        <li>On each Android: Settings, About phone, tap Build number seven times.</li>
        <li>Then Settings, System, Developer options, and switch on USB debugging.</li>
        <li>An iPhone needs nothing switched on, only iOS 17 or newer.</li>
        <li>Paste the command below into Terminal on the computer the phones plug into.</li>
        <li>Plug the phones in and tap Allow on each Android, or Trust on each iPhone.</li>
      </ol>
      {pairing && !expired ? (
        <div className="grid gap-2">
          <p>
            Code <span className="font-mono font-medium">{pairing.code}</span>, works once, for{" "}
            {minutesLeft} more {minutesLeft === 1 ? "minute" : "minutes"}.
          </p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all">
              {pairing.command}
            </code>
            <Hint label="Copy the command">
              <Button type="button" variant="outline" size="icon" aria-label="Copy the command" onClick={() => void copy(pairing.command)}>
                <CopyIcon />
              </Button>
            </Hint>
          </div>
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            Waiting for the rack program to pair.
          </p>
        </div>
      ) : pairing ? (
        <p role="status" className="text-amber-600 dark:text-amber-400">
          That code ran out. Make a new one and paste the new command.
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" disabled={making} onClick={() => void makeCode()}>
          {making ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
          {/* Short, so the button fits the left panel at its narrowest. */}
          {pairing ? "New code" : "Make a code"}
        </Button>
      </div>
    </div>
  )
}
