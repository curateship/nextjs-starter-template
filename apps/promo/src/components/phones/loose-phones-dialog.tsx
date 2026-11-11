import * as React from "react"

import { PhoneStatusText } from "@/components/phones/phone-status"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { changePhones, getPhoneErrorMessage, type PhoneRecord, type RackView } from "@/lib/api/phones/phones"
import { systemWords } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Not on a rack (Racks dashboard, part 83): the phones no rack has, either
 * typed in before a rack existed for them or left behind when their rack was
 * deleted. Put on a rack shows each one on that rack's page before it is
 * plugged in. Plugging it into a different rack still moves it there.
 */
export function LoosePhonesDialog({
  open,
  phones,
  racks,
  onClose,
  onChanged,
}: {
  open: boolean
  phones: PhoneRecord[]
  racks: RackView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState<string | null>(null)

  async function putOn(phone: PhoneRecord, rack: RackView) {
    setBusy(phone.id)
    try {
      const { done } = await changePhones({ action: "rack", ids: [phone.id], rackId: rack.id })
      if (!done.length) showErrorToast(`${phone.name} is not there any more. Refresh the list.`)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Not on a rack</DialogTitle>
          <DialogDescription>
            Phones no rack has yet. Put one on a rack to see it on that rack&apos;s page; plugging it into a
            rack later moves it to that rack by itself.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {phones.length ? (
            <ul className="grid gap-3">
              {phones.map((phone) => (
                <li key={phone.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border p-3">
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium">{phone.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[phone.model, systemWords(phone.kind, phone.androidVersion), phone.serial].filter(Boolean).join(" · ") ||
                        "No model read yet"}
                    </span>
                    <span className="text-sm">
                      <PhoneStatusText phone={phone} />
                    </span>
                  </span>
                  <Select
                    value=""
                    disabled={busy !== null || !racks.length}
                    onValueChange={(rackId) => {
                      const rack = racks.find((one) => one.id === rackId)
                      if (rack) void putOn(phone, rack)
                    }}
                  >
                    <SelectTrigger aria-label={`Put ${phone.name} on a rack`} className="w-full sm:w-fit sm:min-w-48">
                      <SelectValue placeholder={racks.length ? "Put on a rack" : "Make a rack first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {racks.map((rack) => (
                        <SelectItem key={rack.id} value={rack.id}>
                          {rack.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every phone is on a rack.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
