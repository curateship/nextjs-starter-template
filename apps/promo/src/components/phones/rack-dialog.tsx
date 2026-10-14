import * as React from "react"
import { CopyIcon, KeyRoundIcon, Loader2Icon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"

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
import {
  getPhoneErrorMessage,
  makePairingCode,
  type PairingCode,
  type PhonesPage,
  type RackView,
} from "@/lib/api/phones/phones"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The rack: the program on the computer the phones plug into. Shows whether
 * it is checking in, which version it runs and what its last update did, and
 * makes the one-time code and the one command that install and pair it.
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
              <Card key={rack.id} size="sm">
                <CardHeader>
                  <CardTitle>{rack.name || "Rack"}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm">
                  <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-muted-foreground">Checking in</dt>
                    <dd className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${rack.live ? "bg-emerald-500" : "bg-destructive"}`}
                      />
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
                </CardContent>
              </Card>
            ))}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Connect a rack</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
                  <li>On each phone: Settings, About phone, tap Build number seven times.</li>
                  <li>Then Settings, System, Developer options, and switch on USB debugging.</li>
                  <li>Make a code below and paste the command into Terminal on the computer the phones plug into.</li>
                  <li>Plug the phones in and tap Allow on each phone&apos;s screen.</li>
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
