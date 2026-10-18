import * as React from "react"
import { CopyIcon, KeyRoundIcon, Loader2Icon, RefreshCwIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  askRackLog,
  getPhoneErrorMessage,
  loadRackLog,
  makePairingCode,
  type PairingCode,
  type PhonesPage,
  type RackLogView,
  type RackView,
} from "@/lib/api/phones/phones"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The Log tab asks the rack again this often, for this long, until its lines arrive. */
const LOG_POLL_MS = 3_000
const LOG_WAIT_MS = 30_000

/**
 * The rack: the program on the computer the phones plug into. Shows whether
 * it is checking in, which version it runs and what its last update did, and
 * makes the one-time code and the one command that install and pair it. Each
 * rack's Log tab shows the last lines of the program's own `rack.log`
 * (part 61), so a failed action is read here and never on the Mac.
 *
 * Disconnect asks first, through the dashboard's own question, because a
 * window never opens another window.
 */
export function RackDialog({
  open,
  page,
  onClose,
  onDisconnect,
}: {
  open: boolean
  page: PhonesPage
  onClose: () => void
  onDisconnect: (rack: RackView) => void
}) {
  const [pairing, setPairing] = React.useState<PairingCode | null>(null)
  const [making, setMaking] = React.useState(false)

  async function makeCode() {
    setMaking(true)
    try {
      setPairing(await makePairingCode())
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setMaking(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Command copied.")
    } catch {
      showErrorToast("This browser would not copy. Select the command and copy it by hand.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPairing(null)
          onClose()
        }
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Rack</DialogTitle>
          <DialogDescription>
            A small program on the computer the phones plug into. It calls Promo, so nothing
            at home is opened to the internet, and it is the only thing that touches the phones.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            {page.racks.map((rack) => (
              <RackCard key={rack.id} rack={rack} page={page} onDisconnect={onDisconnect} />
            ))}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Connect a rack</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
                  <li>On each Android: Settings, About phone, tap Build number seven times.</li>
                  <li>Then Settings, System, Developer options, and switch on USB debugging.</li>
                  <li>An iPhone needs nothing switched on, only iOS 17 or newer.</li>
                  <li>Make a code below and paste the command into Terminal on the computer the phones plug into.</li>
                  <li>Plug the phones in and tap Allow on each Android, or Trust on each iPhone.</li>
                </ol>
                {pairing ? (
                  <div className="grid gap-2">
                    <p>
                      Code <span className="font-mono font-medium">{pairing.code}</span>, works once until{" "}
                      {formatDateTime(pairing.expiresAt)}.
                    </p>
                    <div className="flex items-start gap-2">
                      <code className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all">
                        {pairing.command}
                      </code>
                      <Hint label="Copy the command">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Copy the command"
                          onClick={() => void copy(pairing.command)}
                        >
                          <CopyIcon />
                        </Button>
                      </Hint>
                    </div>
                  </div>
                ) : null}
                <div>
                  <Button type="button" variant="outline" disabled={making} onClick={() => void makeCode()}>
                    {making ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                    {pairing ? "Make a new code" : "Make a pairing code"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              setPairing(null)
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

/** One rack: what it reports, and its log behind a tab of its own. */
function RackCard({
  rack,
  page,
  onDisconnect,
}: {
  rack: RackView
  page: PhonesPage
  onDisconnect: (rack: RackView) => void
}) {
  const [tab, setTab] = React.useState<"about" | "log">("about")
  const wdaExpired = rack.wdaExpiresAt ? new Date(rack.wdaExpiresAt) < new Date() : false
  return (
    <Card size="sm">
      <Tabs value={tab} onValueChange={(value) => setTab(value as "about" | "log")} className="gap-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <CardTitle>{rack.name || "Rack"}</CardTitle>
            <TabsList>
              <TabsTrigger value="about">Rack</TabsTrigger>
              <TabsTrigger value="log">Log</TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <TabsContent value="about" className="grid gap-4">
            <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Checking in</dt>
              <dd className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-full ${rack.live ? "bg-emerald-500" : "bg-destructive"}`} />
                {rack.live
                  ? "Yes"
                  : rack.seenAt
                    ? `No, last seen ${formatTimeAgo(rack.seenAt)}`
                    : "Not yet. Run the install command on that computer."}
              </dd>
              <dt className="text-muted-foreground">Computer</dt>
              <dd>{rack.platform || "Not reported yet"}</dd>
              <dt className="text-muted-foreground">Program version</dt>
              <dd>
                {!rack.version
                  ? "Not reported yet"
                  : rack.upToDate
                    ? `${rack.version}, the newest`
                    : `${rack.version}. ${page.rackVersion} installs itself on its next check-in.`}
              </dd>
              <dt className="text-muted-foreground">Paired</dt>
              <dd>{formatDateTime(rack.pairedAt)}</dd>
              {rack.wdaExpiresAt ? (
                <>
                  <dt className="text-muted-foreground">iPhone tool</dt>
                  {/* The signature on WebDriverAgent, the tool that drives an iPhone. Red once it has run out, with the word too. */}
                  <dd className={wdaExpired ? "text-destructive" : undefined}>
                    WebDriverAgent signed until {formatDateTime(rack.wdaExpiresAt)}
                    {wdaExpired ? ", which has passed" : ""}
                  </dd>
                </>
              ) : null}
            </dl>
            {rack.updateNote ? (
              <p role="status" className="text-destructive">
                {rack.updateNote}
              </p>
            ) : null}
            <div>
              <Button type="button" variant="destructive" onClick={() => onDisconnect(rack)}>
                <UnplugIcon />
                Disconnect this rack
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="log">{tab === "log" ? <RackLogPanel rack={rack} /> : null}</TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}

/**
 * The last lines of the rack program's own log, newest at the bottom. The tab
 * asks, the rack is told on its next check for work, and the lines arrive a
 * few seconds later; the tab reads again every 3 seconds for up to 30. The
 * log is never streamed whole and never stored.
 */
function RackLogPanel({ rack }: { rack: RackView }) {
  const [log, setLog] = React.useState<RackLogView>(null)
  // While waiting: when the ask went out on this clock, and when the lines
  // already shown were sent on the server's clock, so an answer counts as new
  // against the server's own time and never against this computer's.
  const [asked, setAsked] = React.useState<{ since: number; before: number } | null>(null)
  const [gaveUp, setGaveUp] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  const ask = React.useCallback(async () => {
    setGaveUp(false)
    setError(null)
    try {
      // The lines Promo already holds come first, so the answer the rack sends
      // to this ask counts as new against them and not against a blank tab.
      const held = await loadRackLog(rack.id)
      if (held) setLog(held)
      await askRackLog(rack.id)
      setAsked({ since: Date.now(), before: held ? new Date(held.at).getTime() : 0 })
    } catch (askError) {
      setError(getPhoneErrorMessage(askError))
    }
  }, [rack.id])

  // Asked once as the tab opens, when the rack is there to answer.
  const askRef = React.useRef(ask)
  React.useEffect(() => {
    askRef.current = ask
  })
  React.useEffect(() => {
    if (rack.live) void askRef.current()
  }, [rack.id, rack.live])

  // Reads every 3 seconds after an ask until lines newer than the ones shown arrive, or 30 seconds pass.
  React.useEffect(() => {
    if (asked === null) return
    let live = true
    const read = async () => {
      try {
        const next = await loadRackLog(rack.id)
        if (!live) return
        if (next && new Date(next.at).getTime() > asked.before) {
          setLog(next)
          setAsked(null)
          return
        }
        if (Date.now() - asked.since >= LOG_WAIT_MS) {
          setGaveUp(true)
          setAsked(null)
        }
      } catch (readError) {
        if (live) setError(getPhoneErrorMessage(readError))
      }
    }
    void read()
    const timer = setInterval(() => void read(), LOG_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [asked, rack.id])

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" })
  }, [log])

  const waiting = asked !== null
  const words = !rack.live
    ? "The rack is not checking in, so it cannot send its log."
    : error
      ? error
      : waiting
        ? "The rack has not answered yet."
        : gaveUp
          ? "The rack has not answered in 30 seconds. Press Refresh to ask again."
          : log
            ? `The rack's last ${log.lines.length} ${log.lines.length === 1 ? "line" : "lines"}, sent ${formatTimeAgo(log.at)}.`
            : "No lines yet."

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className={!rack.live || error ? "text-destructive" : "text-muted-foreground"}>
          {words}
        </p>
        <Button type="button" variant="outline" disabled={!rack.live || waiting} onClick={() => void ask()}>
          {waiting ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          Refresh
        </Button>
      </div>
      {log ? (
        <ScrollArea className="rounded-md border bg-muted" viewportClassName="max-h-96">
          <pre className="p-3 font-mono text-xs whitespace-pre-wrap break-all">{log.lines.join("\n")}</pre>
          <div ref={endRef} />
        </ScrollArea>
      ) : null}
    </div>
  )
}
