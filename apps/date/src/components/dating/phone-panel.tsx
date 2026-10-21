import * as React from "react"
import { CameraIcon, KeyRoundIcon, Loader2Icon, MonitorSmartphoneIcon, PlayIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
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
import { datingErrorMessage } from "@/lib/dating/errors"
import { ACTION_STATUS_WORDS, ACTION_WORDS, STOP_REASON_WORDS, WALK_WORDS, type WalkKind } from "@/lib/dating/options"
import { formatDuration } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { FlatSection } from "./flat-section"
import { DatingPicture } from "./picture"
import { PictureDialog } from "./picture-dialog"
import { ScreenWindow } from "./screen-window"
import { dollars, whenWords } from "./words"

/** The panel looks again this often while it is open, so a check-in or a finished step shows by itself. */
const EVERY_MS = 4_000

/**
 * The phone, in the Dating dashboard's right panel (`?open=phone`), opened
 * from the phone's line in the left panel. It was the Phone screen until
 * Tyler's "We dont need 4 seperate pages. Condense them all into the 3 col
 * dashboard" (20 Oct 2026). In flat sections: the phone itself (here or
 * away, Resume after a Tinder screen stopped it, the "Date is in control"
 * switch, the screen window, a picture, pairing and unpairing), Swiping,
 * what the phone did, and the sample data.
 */
export function PhonePanel({ data, onChanged }: { data: DatingDashboard; onChanged: () => void }) {
  const [screen, setScreen] = React.useState<PhoneScreenData | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [code, setCode] = React.useState<{ code: string; expiresAt: Date } | null>(null)
  const [confirm, setConfirm] = React.useState<"unpair" | "samples" | null>(null)
  const [screenOpen, setScreenOpen] = React.useState(false)
  const [picture, setPicture] = React.useState<{ id: string; title: string } | null>(null)
  const phone = screen ? (screen.phones.find((item) => item.paired) ?? screen.phones[0] ?? null) : null

  React.useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      loadPhoneScreen()
        .then((next) => live && setScreen(next))
        .catch((error: unknown) => live && showErrorToast(datingErrorMessage(error)))
        .finally(() => {
          if (live) timer = setTimeout(tick, EVERY_MS)
        })
    }
    tick()
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
      setScreen(await loadPhoneScreen())
      onChanged()
      return true
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<MonitorSmartphoneIcon className="size-4" />}
        title={phone ? phone.name : "Phone"}
      />
      {!screen ? (
        <LoadingRow label="Opening the phone" />
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          <div className="grid grid-cols-[minmax(0,1fr)] text-sm">
            <FlatSection storageId="date-phone-phone" title="Phone" meta={phone?.paired ? (phone.here ? "here" : "away") : "not paired"}>
              <p className="text-muted-foreground">
                {phone
                  ? "The Android phone the AI runs Tinder on. It dials out to Date; nothing on the phone is reachable from outside."
                  : "Date runs Tinder from an Android phone with the Date app on it. Pair one to start."}
              </p>
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
                  <p className="text-muted-foreground">Nothing runs on the phone until you sort it out on the phone itself and press Resume.</p>
                  <Button type="button" size="sm" className="justify-self-start" disabled={busy === "resume"} onClick={() => void act("resume", () => resume(phone.id), "Resumed. The phone looks at Tinder again now.")}>
                    {busy === "resume" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                    Resume
                  </Button>
                </div>
              ) : null}
              {phone?.paired ? (
                <div className="flex items-start gap-3">
                  <Switch
                    id="date-phone-in-control"
                    checked={phone.inControl}
                    onCheckedChange={(on) =>
                      void act("control", () => switchDateInControl(phone.id, on), on ? "Date is in control of the phone again." : "Date is switched off. The phone is handed nothing.")
                    }
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor="date-phone-in-control">Date is in control of this phone</Label>
                    <p className="text-xs text-muted-foreground">Off, the phone is handed nothing, everything waiting for it is cancelled and swiping stops. On again, nothing restarts by itself.</p>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {phone?.paired ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => setScreenOpen(true)}>
                      <MonitorSmartphoneIcon /> Screen window
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === "picture"} onClick={() => void act("picture", () => takePicture(phone.id), "The phone will take a picture. It shows below once it arrives.")}>
                      {busy === "picture" ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
                      Picture
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === "code"} onClick={() => void act("code", async () => setCode(await makePairCode(phone.id)))}>
                      {busy === "code" ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                      New code
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("unpair")}>
                      <Trash2Icon /> Unpair
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" disabled={busy === "code"} onClick={() => void act("code", async () => setCode(await makePairCode(phone?.id ?? null)))}>
                    {busy === "code" ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                    {phone ? "Pair it again" : "Pair a phone"}
                  </Button>
                )}
              </div>
              {code ? <PairingSteps code={code} /> : null}
            </FlatSection>

            {phone ? (
              <FlatSection storageId="date-phone-swiping" title="Swiping" meta={phone.running ? "running" : "stopped"}>
                <SwipingDetails data={data} />
              </FlatSection>
            ) : null}

            {phone ? (
              <FlatSection storageId="date-phone-log" title="What the phone did" meta={screen.walks.length}>
                <p className="text-xs text-muted-foreground">Tinder walks newest first, then each plain step. A step that failed keeps a picture of where it stopped.</p>
                {screen.walks.length ? (
                  <ul className="grid divide-y rounded-lg border">
                    {screen.walks.map((walk) => (
                      <li key={walk.id} className="grid gap-0.5 px-3 py-2">
                        <span className="font-medium">{WALK_WORDS[walk.kind as WalkKind] ?? walk.kind}</span>
                        <span className={cn("text-xs", walk.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                          {walk.status === "running" ? "on the phone now" : walk.status} · asked by {walk.askedBy === "ai" ? "the AI" : "you"} · {whenWords(walk.createdAt)}
                        </span>
                        {walk.error ? <span className="text-xs text-muted-foreground">{walk.error}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No walks yet.</p>
                )}
                {screen.actions.length ? (
                  <ul className="grid divide-y rounded-lg border">
                    {screen.actions.map((action) => (
                      <li key={action.id} className="flex items-start gap-3 px-3 py-2">
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="font-medium">{ACTION_WORDS[action.kind]}</span>
                          <span className={cn("text-xs", action.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                            {ACTION_STATUS_WORDS[action.status]} · {whenWords(action.createdAt)}
                            {action.startedAt && action.finishedAt ? ` · took ${formatDuration(action.finishedAt.getTime() - action.startedAt.getTime())}` : ""}
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
                ) : null}
              </FlatSection>
            ) : null}

            <FlatSection storageId="date-phone-samples" title="Sample data">
              <p className="text-muted-foreground">
                Twelve sample cards and seven chats, to look around before a phone is paired. The AI never reads them and no button on one reaches a phone.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy === "samples"} onClick={() => void act("samples", addSampleData, "Sample cards and chats added.")}>
                  {busy === "samples" ? <Loader2Icon className="animate-spin" /> : null}
                  {screen.hasSamples ? "Add them again" : "Add sample data"}
                </Button>
                {screen.hasSamples ? (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("samples")}>
                    <Trash2Icon /> Remove sample data
                  </Button>
                ) : null}
              </div>
            </FlatSection>
          </div>
        </ScrollArea>
      )}

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
        description="The sample cards and chats are deleted. Nothing a phone read is touched."
        confirmLabel="Remove sample data"
        loading={busy === "remove-samples"}
        onConfirm={() => void act("remove-samples", removeSampleData, "Sample data removed.").then((ok) => ok && setConfirm(null))}
      />
      <PictureDialog picture={picture} onClose={() => setPicture(null)} />
      {screenOpen && phone ? <ScreenWindow phone={phone} onClose={() => setScreenOpen(false)} /> : null}
    </div>
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
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
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

function discoveryWords(data: DatingDashboard): string {
  const { discovery, settings } = data
  const wanted = `${settings.maxDistanceKm} km, ages ${settings.ageMin} to ${settings.ageMax}`
  if (discovery.state === "setting") return `Setting Tinder to ${wanted} now.`
  if (discovery.state === "owed") return `Tinder is set to ${wanted} once the phone is free.`
  if (discovery.state === "set") return `Tinder set to ${discovery.distance}, ages ${discovery.ageMin} to ${discovery.ageMax}${discovery.at ? `, ${whenWords(discovery.at)}` : ""}.`
  if (discovery.state === "failed") return `Setting Tinder's distance and ages failed${discovery.at ? ` ${whenWords(discovery.at)}` : ""}: ${discovery.error} Change a setting or press Resume to try again.`
  return `Not set on Tinder yet. The phone sets ${wanted} once it is paired.`
}

/**
 * Swiping: whether the loop runs and why it stopped, this hour's swipes and
 * messages and the AI spend against their limits, how many of the member's
 * swipes the AI learns from, what Tinder's own distance and ages were set
 * to, and what the phone is doing now. The rules themselves live in
 * the Dating settings.
 */
export function SwipingDetails({ data }: { data: DatingDashboard }) {
  const phone = data.phone
  const { settings, hour } = data
  const current = data.walks.current
  const lastFailed = data.walks.recent.find((walk) => walk.status === "failed")
  return (
    <>
      <p className="text-muted-foreground">
        {phone?.running
          ? `Running since ${whenWords(phone.runningSince)}${phone.startedBy === "schedule" ? ", started by the schedule" : ""}. The AI swipes and drafts with the phone in your pocket until ${
              phone.startedBy === "schedule" && settings.scheduleEnd !== null ? `${settings.scheduleEnd}:00, Stop or a limit` : "Stop or a limit"
            }.`
          : phone?.stopWhy
            ? `Stopped${phone.stopWhyAt ? ` at ${whenWords(phone.stopWhyAt)}` : ""}: ${phone.stopWhy}`
            : "Start, in the left panel, lets the AI read cards and like or pass them, at a person's pace, until Stop or a limit."}
      </p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Swipes today</dt>
        <dd className="text-right tabular-nums">
          {hour.swipesToday} of {settings.swipesPerDay}
        </dd>
        <dt className="text-muted-foreground">Swipes this hour</dt>
        <dd className="text-right tabular-nums">
          {hour.swipes} of {settings.swipesPerHour}
        </dd>
        <dt className="text-muted-foreground">Messages this hour</dt>
        <dd className="text-right tabular-nums">
          {hour.messages} of {settings.messagesPerHour}
        </dd>
        <dt className="text-muted-foreground">AI spend this month</dt>
        <dd className="text-right tabular-nums">
          {dollars(data.spendDollars)} of ${settings.spendCapDollars}
        </dd>
      </dl>
      <p className="text-muted-foreground">
        {data.learningFrom
          ? `Learning from ${data.learningFrom} of your swipes: the cards where you liked or passed against the AI's score.`
          : "Not learning from your swipes yet. Like or pass a card against the AI's score and it is shown as an example next time."}
      </p>
      <p className="text-muted-foreground">{discoveryWords(data)}</p>
      {current ? (
        <p className="text-muted-foreground">
          <Loader2Icon className="mr-1.5 inline size-4 animate-spin" />
          On the phone now: {WALK_WORDS[current.kind].toLowerCase()}
          {data.walks.waiting ? `, then ${data.walks.waiting} more` : ""}.
        </p>
      ) : data.walks.waiting ? (
        <p className="text-muted-foreground">{data.walks.waiting} waiting for the phone.</p>
      ) : null}
      {lastFailed && !current ? (
        <p className="text-muted-foreground">
          Last problem, {whenWords(lastFailed.finishedAt)}: {WALK_WORDS[lastFailed.kind].toLowerCase()} failed. {lastFailed.error}
        </p>
      ) : null}
    </>
  )
}
