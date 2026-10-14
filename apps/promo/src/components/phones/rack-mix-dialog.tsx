import { AlertTriangleIcon } from "lucide-react"

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
import { MIX_MIN_PHONES } from "@/lib/phones/options"
import { MIX_KIND_WORDS, type RackMix } from "@/lib/phones/rack-mix"

/**
 * The rack mix, from Mix on the Phones dashboard (part 27 of the phone farm):
 * each model, carrier and Android version with how many phones share it, and
 * a warning above them when more than half the rack shares one.
 */
export function RackMixDialog({ open, mix, onClose }: { open: boolean; mix: RackMix; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Rack mix</DialogTitle>
          <DialogDescription>
            How alike the phones are. A platform spots a farm by patterns across phones, so it warns
            when more than half of {MIX_MIN_PHONES} or more phones share one model, carrier or Android
            version.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Warnings</CardTitle>
              </CardHeader>
              <CardContent>
                {mix.warnings.length ? (
                  <ul className="grid gap-2">
                    {mix.warnings.map((warning) => (
                      <li
                        key={`${warning.kind}:${warning.value}`}
                        className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400"
                      >
                        <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
                        <span>{warning.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {mix.total < MIX_MIN_PHONES
                      ? `${mix.total} ${mix.total === 1 ? "phone" : "phones"} so far. The warning starts at ${MIX_MIN_PHONES}.`
                      : "No model, carrier or Android version is on more than half the phones."}
                  </p>
                )}
              </CardContent>
            </Card>
            {(["model", "carrier", "android"] as const).map((kind) => (
              <Card key={kind} size="sm">
                <CardHeader>
                  <CardTitle>{MIX_KIND_WORDS[kind]}</CardTitle>
                </CardHeader>
                <CardContent>
                  {mix.counts[kind].length ? (
                    <ul className="grid gap-1.5 text-sm">
                      {mix.counts[kind].map((entry) => (
                        <li key={entry.value} className="flex items-center justify-between gap-4">
                          <span className={entry.known ? "truncate" : "truncate text-muted-foreground"}>{entry.value}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {entry.count} of {mix.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No phones yet.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
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
