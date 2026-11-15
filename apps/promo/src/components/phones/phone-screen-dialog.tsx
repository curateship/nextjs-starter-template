import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeftIcon,
  CopyIcon,
  CornerDownLeftIcon,
  CircleIcon,
  DeleteIcon,
  Loader2Icon,
  SendIcon,
  SquareStackIcon,
} from "lucide-react"

import { PhoneGraphic, PhoneLogo } from "@/components/phones/phone-graphic"
import { PanelCard } from "@/components/shared/panel-card"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  closeScreenWindow,
  getScreenErrorMessage,
  loadScreen,
  sendToScreen,
  setScreenControl,
  type ScreenInput,
  type ScreenView,
} from "@/lib/api/phones/screen"
import type { PhoneRecord } from "@/lib/api/phones/phones"
import { formatTimeAgo } from "@/lib/format/format-time"
import type { PhoneKind } from "@/lib/phones/options"
import { useOnScreen } from "@/lib/phones/use-on-screen"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { PickGroup } from "@/components/shared/notes/pick-rows"

/**
 * How often the window asks for a newer picture. The rack sends about three a
 * second while a window is open, and stops ten seconds after the last ask.
 */
const POLL_MS = 350

/** How often it asks again while asking fails. */
const FAILING_POLL_MS = 3_000

/** A press that moves less than this share of the picture is a tap, not a swipe. */
const TAP_SLOP = 0.02

/**
 * The keys, named by kind. The key names on the wire are the same for both:
 * on an iPhone the rack turns Back into a swipe in from the left edge and
 * Recent apps into a swipe up from the bottom and hold, which is how an
 * iPhone does them (part 50).
 */
function keysFor(kind: PhoneKind): Array<{ key: Extract<ScreenInput, { kind: "key" }>["key"]; label: string; icon: React.ReactNode }> {
  const iphone = kind === "iphone"
  return [
    { key: "back", label: iphone ? "Back (swipe)" : "Back", icon: <ArrowLeftIcon /> },
    { key: "home", label: "Home", icon: <CircleIcon /> },
    { key: "recents", label: iphone ? "App switcher (swipe)" : "Recent apps", icon: <SquareStackIcon /> },
    { key: "enter", label: "Enter", icon: <CornerDownLeftIcon /> },
    { key: "delete", label: "Delete a letter", icon: <DeleteIcon /> },
  ]
}

/**
 * A phone's live screen, inside Promo, as the bigger window opened from the
 * phone's ⋮ (Racks dashboard, part 108). The window and the right panel draw
 * the same `PhoneScreen`; this one is for tapping through a sign-in with room.
 */
export function PhoneScreenDialog({
  phone,
  onClose,
  onChanged,
}: {
  /** Null when closed. */
  phone: PhoneRecord | null
  onClose: () => void
  /** The rack's page reads again when control changes: Held. */
  onChanged: () => Promise<void>
}) {
  return (
    <Dialog open={phone !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="data-[variant=admin]:sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{phone?.name ?? "Phone"} screen</DialogTitle>
          <DialogDescription>
            The phone&apos;s screen, a few pictures a second. Switch control on to tap and type;
            its jobs wait until you switch it off, close this window, or leave it for 15 minutes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{phone ? <PhoneScreen key={phone.id} phone={phone} onChanged={onChanged} wide /> : null}</DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The live screen: the picture, the control switch, the keys, typing and the
 * sign-in codes. The rack sends a picture a few times a second (Tyler's
 * choice, 14 Oct 2026, over video), so this is for watching and tapping
 * through a sign-in, not for watching a film.
 *
 * It asks for pictures only while it is drawn and the browser tab is in front
 * (`useOnScreen`): a hidden panel or a shut one asks for nothing. Leaving it, by any of those or by picking another phone,
 * closes the window on the server, which switches control off, so the phone
 * is never left held for 15 minutes behind a panel nobody can see. Another
 * browser tab only pauses the pictures, so fetching a code from Gmail mid
 * sign-in keeps control; so does scrolling down to the codes.
 *
 * Control is off when it opens, so looking never touches the phone.
 * Switched on, taps, swipes, typing and keys reach the phone, the phone shows
 * Held and its jobs wait. Switching control off, leaving, or fifteen minutes
 * without a tap lets them run again. Texts are read only while it is open
 * and are never stored.
 */
export function PhoneScreen({
  phone,
  onChanged,
  wide = false,
  footer = null,
  controlSlot = null,
  onControl,
  frame: frameScreen,
}: {
  phone: PhoneRecord
  onChanged: () => Promise<void>
  /** The window's two columns, picture beside the controls; a panel stacks them. */
  wide?: boolean
  /**
   * The right panel's footer: the typing goes there, with the keys under it,
   * rather than in the Control card (Tyler, 12 Nov 2026: "The icon controls
   * goes into the footer bottom and the phone chat goes a row above it").
   */
  footer?: HTMLElement | null
  /**
   * On the right panel, where the control switch goes: the Control row of the
   * phone's ⋮, drawn flat (Tyler, 12 Nov 2026: "control, setup, actions and
   * history can go back into the 3 dot dropdown but flatten the data"). Null
   * while the ⋮ is shut; control stays as it was.
   */
  controlSlot?: HTMLElement | null
  /** Told whether control is on, for the ⋮'s Control row. */
  onControl?: (on: boolean) => void
  /** On the right panel, the phone box the picture is drawn in, under the panel's tabs. */
  frame?: (screen: React.ReactNode) => React.ReactNode
}) {
  const phoneId = phone.id
  const [box, { drawn, front }] = useOnScreen<HTMLDivElement>()
  const [view, setView] = React.useState<ScreenView | null>(null)
  const [frame, setFrame] = React.useState<NonNullable<ScreenView["frame"]> | null>(null)
  const [typing, setTyping] = React.useState("")
  const [switching, setSwitching] = React.useState(false)
  const seq = React.useRef(0)
  const press = React.useRef<{ x: number; y: number } | null>(null)
  const control = Boolean(view?.controlUntil)
  const keys = keysFor(phone.kind)
  React.useEffect(() => {
    onControl?.(control)
  }, [control, onControl])
  const onChangedRef = React.useRef(onChanged)
  React.useEffect(() => {
    onChangedRef.current = onChanged
  })

  // Left: the window closes on the server and control goes with it. Not when
  // the browser tab goes to the background, which only pauses the pictures.
  React.useEffect(() => {
    if (!drawn) return
    return () => {
      void closeScreenWindow(phoneId)
        .then(() => onChangedRef.current())
        .catch(() => {})
    }
  }, [drawn, phoneId])

  React.useEffect(() => {
    if (!drawn || !front) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // A failure is said once, not three times a second, and the screen asks
    // less often until it answers again.
    let failing = false
    const ask = async () => {
      try {
        const next = await loadScreen(phoneId, seq.current)
        if (!live) return
        failing = false
        if (next.frame) {
          seq.current = next.frame.seq
          setFrame(next.frame)
        }
        setView(next)
      } catch (error) {
        if (live && !failing) showErrorToast(getScreenErrorMessage(error))
        failing = true
      }
      if (live) timer = setTimeout(() => void ask(), failing ? FAILING_POLL_MS : POLL_MS)
    }
    void ask()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [drawn, front, phoneId])

  async function switchControl(on: boolean) {
    setSwitching(true)
    try {
      const { controlUntil } = await setScreenControl(phoneId, on)
      setView((current) => (current ? { ...current, controlUntil } : current))
      await onChanged()
    } catch (error) {
      showErrorToast(getScreenErrorMessage(error))
    } finally {
      setSwitching(false)
    }
  }

  async function send(input: ScreenInput) {
    if (!control) {
      showErrorToast("Control is off. Switch it on under the screen first.")
      return
    }
    try {
      await sendToScreen(phoneId, input)
    } catch (error) {
      showErrorToast(getScreenErrorMessage(error))
    }
  }

  // Where on the picture, as a share of its width and height, so the rack can
  // turn it into the phone's own pixels whatever size the picture is drawn.
  function at(event: React.PointerEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      showErrorToast("This browser would not copy. Select the code and copy it by hand.")
    }
  }

  const waitingWords =
    phone.status === "offline"
      ? `${phone.name} is offline: ${phone.offlineReason || "not seen by the rack"}. The picture comes back once it is plugged in.`
      : "Waiting for the first picture. The rack starts sending within a few seconds when the phone is plugged in and the rack is connected."

  // The keys and the typing: in the Control card in the window; on the right panel, the typing in the
  // footer with the keys under it.
  // The switch and what it means: in the window's Control card, or the ⋮'s Control row on the right panel.
  const controlRow = (
    <>
      <div className="flex items-center gap-2">
        <Switch
          id={`phone-screen-control-${phoneId}`}
          checked={control}
          disabled={switching}
          onCheckedChange={(on) => void switchControl(on)}
        />
        <Label htmlFor={`phone-screen-control-${phoneId}`} className="font-normal">
          {control ? "Control is on" : "Control is off"}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {control
          ? "Taps and typing reach the phone, and its jobs wait."
          : "Looking only. Nothing reaches the phone."}
        {frame ? ` Picture from ${formatTimeAgo(frame.at)}.` : ""}
      </p>
    </>
  )
  const keysRow = (
      <div className="flex flex-wrap gap-1">
        {keys.map((key) => (
          <Hint key={key.key} label={key.label}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={key.label}
              onClick={() => void send({ kind: "key", key: key.key })}
            >
              {key.icon}
            </Button>
          </Hint>
        ))}
      </div>
  )
  const typingForm = (
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!typing) {
            showErrorToast("Type something first.")
            return
          }
          void send({ kind: "text", text: typing }).then(() => setTyping(""))
        }}
      >
        <Label htmlFor={`phone-screen-typing-${phoneId}`} className="sr-only">
          Type on the phone
        </Label>
        <Input
          id={`phone-screen-typing-${phoneId}`}
          value={typing}
          placeholder="Type on the phone"
          onChange={(event) => setTyping(event.target.value)}
        />
        <Hint label="Send the typing">
          <Button type="submit" variant="outline" size="icon" aria-label="Send the typing">
            <SendIcon />
          </Button>
        </Hint>
      </form>
  )

  // The picture, or what it is waiting for. On the right panel it sits in the panel's phone box under its
  // tabs, with no frame of its own (Tyler, 12 Nov 2026: the tabs drawn on top of the phone's box).
  const picture = (
    // On the right panel the grey screen has a phone's own shape (Tyler, 12 Nov 2026: "this gray area here
    // should be the same dimesion as the phone"), the panel's box being the phone. The window keeps its frame.
    <div
      className={cn(
        "flex items-center justify-center bg-muted/50",
        frameScreen ? "aspect-[96/176] overflow-hidden" : "min-h-80 rounded-lg border p-2"
      )}
    >
      {frame ? (
        <img
          src={frame.src}
          alt={`${phone.name}'s screen`}
          draggable={false}
          // Within the phone's screen on the panel, never past it; the picture's own box, so a tap lands where it shows.
          className={cn(
            "w-auto max-w-full touch-none select-none",
            frameScreen ? "max-h-full" : "max-h-[65vh] rounded-md",
            control ? "cursor-pointer" : "cursor-default"
          )}
          onPointerDown={(event) => {
            if (!control) return
            event.currentTarget.setPointerCapture(event.pointerId)
            press.current = at(event)
          }}
          onPointerUp={(event) => {
            const start = press.current
            press.current = null
            if (!control || !start) return
            const end = at(event)
            const moved = Math.hypot(end.x - start.x, end.y - start.y)
            void send(
              moved < TAP_SLOP
                ? { kind: "tap", x: start.x, y: start.y }
                : { kind: "swipe", x1: start.x, y1: start.y, x2: end.x, y2: end.y }
            )
          }}
        />
      ) : (
        frameScreen ? (
          // The box is the phone, so its screen says why there is no picture, under the logo.
          <div role="status" className="flex flex-col items-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <svg viewBox="0 0 24 24" aria-label={phone.kind === "iphone" ? "An iPhone" : "An Android phone"} role="img" className="size-12 fill-muted-foreground/70">
              <PhoneLogo kind={phone.kind} />
            </svg>
            {phone.status === "offline" ? null : <Loader2Icon className="size-5 animate-spin" />}
            <p>{waitingWords}</p>
          </div>
        ) : (
          // The window draws the phone, saying on its own screen why there is no picture.
          <div role="status" className="flex items-center justify-center text-xs text-muted-foreground">
            <PhoneGraphic kind={phone.kind} className="h-[19rem]">
              {phone.status === "offline" ? null : <Loader2Icon className="size-4 shrink-0 animate-spin" />}
              <p>{waitingWords}</p>
            </PhoneGraphic>
          </div>
        )
      )}
    </div>
  )

  return (
    // On the right panel the cards stack edge to edge under the picture, as every record's cards do.
    <div ref={box} className={wide ? "grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]" : "grid"}>
      {footer
        ? createPortal(
            <div className="grid w-full min-w-0 gap-2">
              {typingForm}
              {keysRow}
            </div>,
            footer
          )
        : null}
      {frameScreen ? frameScreen(picture) : picture}

      <div className={wide ? "grid content-start gap-6" : "grid content-start"}>
        {footer ? (
          controlSlot
            ? createPortal(
                // The ⋮'s settings look: one row, the switch on its right (Tyler, 12 Nov 2026: "all toggles").
                <PickGroup
                  title="Screen"
                  after={
                    <p className="px-0.5 text-xs text-muted-foreground">
                      {control
                        ? "Taps and typing reach the phone, and its jobs wait."
                        : "Looking only. Nothing reaches the phone."}
                      {frame ? ` Picture from ${formatTimeAgo(frame.at)}.` : ""}
                    </p>
                  }
                >
                  <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                    <Label htmlFor={`phone-screen-control-${phoneId}`} className="flex-1 font-normal text-muted-foreground">
                      Control
                    </Label>
                    <span>{control ? "On" : "Off"}</span>
                    <Switch
                      id={`phone-screen-control-${phoneId}`}
                      checked={control}
                      disabled={switching}
                      onCheckedChange={(on) => void switchControl(on)}
                    />
                  </div>
                </PickGroup>,
                controlSlot
              )
            : null
        ) : (
          <ScreenCard wide={wide} storageId="promo-phone-screen-control" title="Control">
            {controlRow}
            {keysRow}
            {typingForm}
          </ScreenCard>
        )}

        {/* Only while there is a code to show (Tyler, 12 Nov 2026, of the empty card: "this doesnt need to be
            here. it should appear when it needs to be"). */}
        {view && (view.codes.length || view.texted) ? (
          <ScreenCard wide={wide} storageId="promo-phone-screen-codes" title="Sign-in codes">
            <div className="grid gap-3 text-sm">
              {view.codes.map((code) => (
                <CodeRow
                  key={code.accountId}
                  label={code.handle ? `u/${code.handle}` : "Authenticator"}
                  detail={`${code.secondsLeft}s left`}
                  code={code.code}
                  onCopy={() => void copy(code.code)}
                />
              ))}
              {view.texted ? (
                <CodeRow
                  label={`Texted${view.texted.from ? ` by ${view.texted.from}` : ""}`}
                  detail={formatTimeAgo(view.texted.at)}
                  code={view.texted.code}
                  onCopy={() => void copy(view.texted!.code)}
                />
              ) : null}
            </div>
          </ScreenCard>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One group beside the picture. On the rack's right panel it is the side
 * panel's grey `PanelCard`, as the rest of the panel is (Tyler, 6 Nov 2026:
 * "control and signin codes card does not use standard gray card"); in the
 * bigger screen window it stays the window's own `Card`, as every window
 * section is.
 */
function ScreenCard({
  wide,
  storageId,
  title,
  children,
}: {
  wide: boolean
  storageId: string
  title: string
  children: React.ReactNode
}) {
  if (!wide) {
    return (
      <PanelCard storageId={storageId} title={title}>
        {children}
      </PanelCard>
    )
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

function CodeRow({
  label,
  detail,
  code,
  onCopy,
}: {
  label: string
  detail: string
  code: string
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid min-w-0 flex-1">
        <span className="truncate text-xs text-muted-foreground">
          {label} · {detail}
        </span>
        <span className="font-mono text-lg tracking-widest tabular-nums">{code}</span>
      </div>
      <Hint label="Copy the code">
        <Button type="button" variant="outline" size="icon" aria-label={`Copy the code for ${label}`} onClick={onCopy}>
          <CopyIcon />
        </Button>
      </Hint>
    </div>
  )
}
