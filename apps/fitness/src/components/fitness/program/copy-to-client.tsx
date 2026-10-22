import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { copyToClient, loadLinkedClients } from "@/lib/api/fitness/coaching"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

type Client = Awaited<ReturnType<typeof loadLinkedClients>>[number]

/**
 * Copy to a client, from the three dots on a coach's own program (Tyler,
 * 21 Oct 2026). The coach picks one of the clients who said yes; the week,
 * its rules and its length are copied into the client's account, with each
 * heavy lift starting at 75 out of 100 of the client's best lift. A lift the
 * coach made themselves is left out, and the message names it.
 */
export function CopyToClientDialog({
  open,
  programId,
  programName,
  onClose,
}: {
  open: boolean
  programId: string
  programName: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [clients, setClients] = React.useState<Client[] | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [clientId, setClientId] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const pickId = React.useId()

  // The list is read from the server each time the window opens, so a client
  // who said yes a minute ago is offered.
  React.useEffect(() => {
    if (!open) return
    let live = true
    loadLinkedClients().then(
      (list) => {
        if (!live) return
        setClients(list)
        setFailed(null)
      },
      (error) => live && setFailed(getFitnessErrorMessage(error))
    )
    return () => {
      live = false
    }
  }, [open])

  function close() {
    setClientId("")
    setFailed(null)
    onClose()
  }

  async function copy() {
    const client = clients?.find((entry) => entry.userId === clientId)
    if (!client) {
      showErrorToast("Pick the client to copy it to.")
      return
    }
    setBusy(true)
    try {
      const { id, leftOut } = await copyToClient(programId, client.userId)
      const left = leftOut.length ? ` Left out ${leftOut.join(", ")}, which ${leftOut.length === 1 ? "is" : "are"} yours.` : ""
      toast.success(`Copied to ${client.name}'s programs.${left}`, {
        action: { label: "Open it", onClick: () => void navigate({ to: "/programs/$programId", params: { programId: id } }) },
      })
      close()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Copy to a client</DialogTitle>
          <DialogDescription>
            {programName}&apos;s week, rules and length go into their account. Heavy lifts start at 75 out of 100 of
            their best lifts, or empty where they gave none. Pictures and starting data stay here.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-2">
              {failed && clients === null ? (
                <p className="text-sm text-muted-foreground">
                  {failed} Close this window and open it again to try once more.
                </p>
              ) : clients === null ? (
                <LoadingRow label="Loading your clients" />
              ) : clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No client has said yes yet. Invite one from the Clients table on Programs.
                </p>
              ) : (
                <>
                  <Label htmlFor={pickId}>Client</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id={pickId} className="w-fit">
                      <SelectValue placeholder="Pick a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.userId} value={client.userId}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          {clients?.length === 0 || (failed && clients === null) ? (
            // Nothing to act on, so the window ends with one Done.
            <Button type="button" size="lg" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="lg" onClick={close}>
                Cancel
              </Button>
              <Button type="button" size="lg" disabled={busy} onClick={() => void copy()}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Copy program
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
