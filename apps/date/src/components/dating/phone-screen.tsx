import * as React from "react"
import { CameraIcon, KeyRoundIcon, Loader2Icon, MonitorSmartphoneIcon, PlayIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  addSampleData,
  loadPhoneScreen,
  makePairCode,
  removeSampleData,
  resume,
  switchDateInControl,
  takePicture,
  unpair,
  type PhoneScreenData,
  type PhoneView,
} from "@/lib/api/dating/phone"
import { ACTION_STATUS_WORDS, ACTION_WORDS, STOP_REASON_WORDS, WALK_WORDS, type WalkKind } from "@/lib/dating/options"
import { datingErrorMessage } from "@/lib/dating/errors"
import { formatDuration } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { DatingPicture } from "./picture"
import { PictureDialog } from "./picture-dialog"
import { ScreenWindow } from "./screen-window"
import { whenWords } from "./words"

/** The Phone screen looks again this often, so a check-in or a finished action shows by itself. */
const EVERY_MS = 4_000

/**
 * The Phone screen at /admin/dating/phone: pairing the member's Android phone,
 * the "Date is in control" switch, Resume after a Tinder screen stopped it,
 * the live screen window, the picture button, what the phone did, and the
 * sample data.
 */
export function PhoneScreen({ initial }: { initial: PhoneScreenData }) {
  const [data, setData] = React.useState(initial)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [code, setCode] = React.useState<{ code: string; expiresAt: Date } | null>(null)
  const [confirm, setConfirm] = React.useState<"unpair" | "samples" | null>(null)
  const [screenOpen, setScreenOpen] = React.useState(false)
  const [picture, setPicture] = React.useState<{ id: string; title: string; description?: string } | null>(null)
  const phone = data.phones.find((item) => item.paired) ?? data.phones[0] ?? null

  React.useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      loadPhoneScreen()
        .then((next) => live && setData(next))
        .catch(() => {})
        .finally(() => {
          if (live) timer = setTimeout(tick, EVERY_MS)
        })
    }
    timer = setTimeout(tick, EVERY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  async function act(key: string, work: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(key)
    dismissErrorToast()
    try {
      await work()
      if (success) toast.success(success)
      setData(await loadPhoneScreen())
      return true
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function newCode(forPhone: string | null) {
    await act("code", async () => setCode(await makePairCode(forPhone)))
  }

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>{phone ? phone.name : "Your phone"}</CardTitle>
          <CardDescription>
            {phone
              ? "The Android phone the AI runs Tinder on. It dials out to Date; nothing on the phone is reachable from outside."
              : "Date runs Tinder from an Android phone with the Date app on it. Pair one to start."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {phone ? <PhoneFacts phone={phone} /> : null}
          {phone?.stoppedReason ? (
            <div className="grid gap-2 rounded-lg border p-3">
              <p className="flex gap-2 font-medium">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                {STOP_REASON_WORDS[phone.stoppedReason]} ({whenWords(phone.stoppedAt)}).
              </p>
              {phone.stoppedWords ? <p className="text-muted-foreground">{phone.stoppedWords}</p> : null}
              {phone.stoppedPictureId ? (
                <button
                  type="button"
                  className="justify-self-start overflow-hidden rounded-md border"
                  aria-label="See what Tinder showed"
                  onClick={() => setPicture({ id: phone.stoppedPictureId as string, title: "What Tinder showed" })}
                >
                  <DatingPicture pictureId={phone.stoppedPictureId} alt="" className="h-32 w-20" />
                </button>
              ) : null}
              <p className="text-muted-foreground">Nothing runs on the phone until you sort it out on the phone itself and press Resume. Resume has the phone look at Tinder again at once.</p>
              <Button type="button" className="justify-self-start" disabled={busy === "resume"} onClick={() => void act("resume", () => resume(phone.id), "Resumed. The phone looks at Tinder again now.")}>
                {busy === "resume" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                Resume
              </Button>
            </div>
          ) : null}
          {phone?.paired ? (
            <SettingsSwitchRow
              id="date-phone-in-control"
              checked={phone.inControl}
              onCheckedChange={(on) =>
                void act("control", () => switchDateInControl(phone.id, on), on ? "Date is in control of the phone again." : "Date is switched off. The phone is handed nothing.")
              }
              label="Date is in control of this phone"
              hint="Off, the phone is handed nothing, everything waiting for it is cancelled and swiping stops. On again, nothing restarts by itself."
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {phone?.paired ? (
              <>
                <Button type="button" variant="outline" onClick={() => setScreenOpen(true)}>
                  <MonitorSmartphoneIcon /> Open screen window
                </Button>
                <Button type="button" variant="outline" disabled={busy === "picture"} onClick={() => void act("picture", () => takePicture(phone.id), "The phone will take a picture. It shows below once it arrives.")}>
                  {busy === "picture" ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
                  Take a picture
                </Button>
                <Button type="button" variant="outline" disabled={busy === "code"} onClick={() => void newCode(phone.id)}>
                  {busy === "code" ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                  New pairing code
                </Button>
                <Button type="button" variant="destructive" onClick={() => setConfirm("unpair")}>
                  <Trash2Icon /> Unpair
                </Button>
              </>
            ) : (
              <Button type="button" disabled={busy === "code"} onClick={() => void newCode(phone?.id ?? null)}>
                {busy === "code" ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                {phone ? "Pair it again" : "Pair a phone"}
              </Button>
            )}
          </div>
          {code ? <PairingSteps code={code} /> : null}
        </CardContent>
      </Card>

      {phone ? (
        <Card>
          <CardHeader>
            <CardTitle>What the phone did</CardTitle>
            <CardDescription>Tinder walks newest first, then each plain step the phone ran. A step that failed keeps a picture of where it stopped.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <section className="grid gap-2" aria-label="Walks">
              <h3 className="text-sm font-medium">Walks</h3>
              {data.walks.length ? (
                <ul className="grid divide-y rounded-lg border">
                  {data.walks.map((walk) => (
                    <li key={walk.id} className="grid gap-0.5 px-3 py-2">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{WALK_WORDS[walk.kind as WalkKind] ?? walk.kind}</span>
                        <span className={cn("text-xs", walk.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                          {walk.status === "running" ? "on the phone now" : walk.status} · asked by {walk.askedBy === "ai" ? "the AI" : "you"} · {whenWords(walk.createdAt)}
                        </span>
                      </span>
                      {walk.error ? <span className="text-xs text-muted-foreground">{walk.error}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No walks yet.</p>
              )}
            </section>
            <section className="grid gap-2" aria-label="Steps">
              <h3 className="text-sm font-medium">Steps</h3>
              {data.actions.length ? (
                <ul className="grid divide-y rounded-lg border">
                  {data.actions.map((action) => (
                    <li key={action.id} className="flex items-start gap-3 px-3 py-2">
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">{ACTION_WORDS[action.kind]}</span>
                          <span className={cn("text-xs", action.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                            {ACTION_STATUS_WORDS[action.status]} · {whenWords(action.createdAt)}
                            {action.startedAt && action.finishedAt ? ` · took ${formatDuration(action.finishedAt.getTime() - action.startedAt.getTime())}` : ""}
                            {action.walkId ? " · part of a walk" : ""}
                          </span>
                        </span>
                        {action.error ? <span className="text-xs text-muted-foreground">{action.error}</span> : null}
                      </span>
                      {action.pictureIds.length ? (
                        <span className="flex shrink-0 gap-1">
                          {action.pictureIds.map((id, index) => (
                            <button
                              key={id}
                              type="button"
                              className="overflow-hidden rounded border"
                              aria-label={`Open picture ${index + 1} of ${ACTION_WORDS[action.kind].toLowerCase()}`}
                              onClick={() => setPicture({ id, title: `${ACTION_WORDS[action.kind]}, ${whenWords(action.createdAt)}` })}
                            >
                              <DatingPicture pictureId={id} alt="" className="h-12 w-7" />
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No steps yet.</p>
              )}
            </section>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sample data</CardTitle>
          <CardDescription>
            Twelve sample cards and four conversations, to look around the Dating dashboard before a phone is paired. The AI never reads them and no button on
            one reaches a phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy === "samples"} onClick={() => void act("samples", addSampleData, "Sample cards and conversations added. Open Dating to see them.")}>
            {busy === "samples" ? <Loader2Icon className="animate-spin" /> : null}
            {data.hasSamples ? "Add them again" : "Add sample data"}
          </Button>
          {data.hasSamples ? (
            <Button type="button" variant="destructive" onClick={() => setConfirm("samples")}>
              <Trash2Icon /> Remove sample data
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm === "unpair"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Unpair ${phone?.name ?? "the phone"}?`}
        description="Its key stops working at once and everything waiting for it is cancelled. What it read stays. Pair it again with a new code to use it."
        confirmLabel="Unpair"
        loading={busy === "unpair"}
        onConfirm={() => {
          if (!phone) return
          void act("unpair", () => unpair(phone.id), "Unpaired.").then((ok) => ok && setConfirm(null))
        }}
      />
      <ConfirmDialog
        open={confirm === "samples"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Remove the sample data?"
        description="The sample cards and conversations are deleted. Nothing a phone read is touched."
        confirmLabel="Remove sample data"
        loading={busy === "remove-samples"}
        onConfirm={() => void act("remove-samples", removeSampleData, "Sample data removed.").then((ok) => ok && setConfirm(null))}
      />
      <PictureDialog picture={picture} onClose={() => setPicture(null)} />
      {screenOpen && phone ? <ScreenWindow phone={phone} onClose={() => setScreenOpen(false)} /> : null}
    </CardGroup>
  )
}

function PhoneFacts({ phone }: { phone: PhoneView }) {
  const rows: Array<[string, string]> = [
    ["Here", !phone.paired ? "Unpaired" : phone.here ? "Yes, checking in" : phone.lastSeenAt ? `Away since ${whenWords(phone.lastSeenAt)}` : "Not heard from yet"],
    ["Model", [phone.model, phone.androidVersion ? `Android ${phone.androidVersion}` : ""].filter(Boolean).join(", ") || "Not known yet"],
    ["Battery", phone.batteryPercent === null ? "Not known yet" : `${phone.batteryPercent}%`],
    ["Tinder", phone.tinderVersion ? `${phone.tinderVersion}${phone.tinderInFront ? ", in front now" : ""}` : phone.lastSeenAt ? "Not installed" : "Not known yet"],
    ["On the phone itself", phone.phoneSwitchOn ? "Date is switched on" : "Date is switched off in the app"],
    ["Date app", phone.appVersion || "Not known yet"],
    ["Paired", phone.pairedAt ? whenWords(phone.pairedAt) : "Not paired"],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function PairingSteps({ code }: { code: { code: string; expiresAt: Date } }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const local = /localhost|127\.0\.0\.1/.test(origin)
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <p className="text-3xl font-semibold tracking-[0.3em] tabular-nums" aria-label={`Pairing code ${code.code.split("").join(" ")}`}>
        {code.code.slice(0, 3)} {code.code.slice(3)}
      </p>
      <p className="text-muted-foreground">Works once, until {whenWords(code.expiresAt)}.</p>
      <ol className="grid list-decimal gap-1.5 pl-5">
        <li>Install the Date app on the phone. How is in the Android folder's README in the code.</li>
        <li>
          Open it and type this server's address:{" "}
          {local ? (
            <>
              this Mac's Wi-Fi address with <span className="font-medium">:3023</span> on the end, such as <span className="font-medium">http://192.168.1.20:3023</span>. A phone
              cannot reach "localhost", and it has to be on the same Wi-Fi.
            </>
          ) : (
            <span className="font-medium">{origin}</span>
          )}
        </li>
        <li>Type the code above and press Pair.</li>
        <li>Switch Date on in the phone's Accessibility settings when it asks, and allow its notification.</li>
      </ol>
    </div>
  )
}
