import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getProxyErrorMessage,
  pasteProxies,
  type ImportProblem,
} from "@/lib/api/browser/proxies"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Pasting in a list of proxies, one per line.
 *
 * The good lines are saved and the bad ones are listed by line number with
 * what was wrong. The box is then left holding only the bad lines, so fixing
 * them and pressing Add again is the whole repair.
 */
export function ProxyImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [report, setReport] = React.useState<{ added: number; problems: ImportProblem[] } | null>(null)

  async function run() {
    setBusy(true)
    try {
      const result = await pasteProxies(text)
      const lines = text.split(/\r?\n/)
      setReport(result)
      setText(result.problems.map((problem) => lines[problem.line - 1] ?? "").join("\n"))
      if (result.added) {
        toast.success(`${result.added} ${result.added === 1 ? "proxy" : "proxies"} added.`)
        await onImported()
      }
      if (!result.problems.length) onClose()
    } catch (error) {
      showErrorToast(getProxyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={Boolean(text.trim())} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Paste in proxies</DialogTitle>
            <DialogDescription>
              One per line, as host:port, host:port:user:password, or
              socks5://user:password@host:port. They arrive as residential; change
              any of them afterwards.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void run()
            }}
          >
            <DialogBody>
              <div className="grid gap-6">
                {report?.problems.length ? (
                  <Card size="sm" aria-live="polite">
                    <CardHeader>
                      <CardTitle>
                        {report.added} added. {report.problems.length} could not be.
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-1 text-sm">
                      {report.problems.map((problem) => (
                        <p key={problem.line}>
                          Line {problem.line}: {problem.reason}.
                        </p>
                      ))}
                      <p className="pt-2 text-muted-foreground">
                        Those lines are left in the box below. Fix them and add
                        again.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The list</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <Label htmlFor="proxy-import" className="sr-only">
                      Proxies, one per line
                    </Label>
                    <Textarea
                      id="proxy-import"
                      rows={8}
                      spellCheck={false}
                      className="font-mono text-xs"
                      value={text}
                      placeholder={"gate.example.com:8080:user:password\n198.51.100.10:3128"}
                      onChange={(event) => setText(event.target.value)}
                    />
                  </CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Add them
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
