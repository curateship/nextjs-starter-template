import * as React from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogToolbar,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAutomationRunErrorMessage,
  listAutomationTestContacts,
  testAutomationWithContact,
  type AutomationTestContact,
} from "@/lib/api/automations/automation-runs"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export function TestWithContactDialog({
  open,
  automationId,
  automationName,
  onOpenChange,
  onStarted,
}: {
  open: boolean
  automationId: string
  automationName: string
  onOpenChange: (open: boolean) => void
  onStarted: (runId: string) => void | Promise<void>
}) {
  const searchId = React.useId()
  const [search, setSearch] = React.useState("")
  const [contacts, setContacts] = React.useState<AutomationTestContact[]>([])
  const [selected, setSelected] = React.useState<AutomationTestContact | null>(
    null
  )
  const [loading, setLoading] = React.useState(false)
  const [starting, setStarting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let current = true
    const timer = window.setTimeout(
      async () => {
        setLoading(true)
        try {
          const result = await listAutomationTestContacts(search)
          if (current) setContacts(result)
        } catch (error) {
          if (current) showErrorToast(getAutomationRunErrorMessage(error))
        } finally {
          if (current) setLoading(false)
        }
      },
      search ? 250 : 0
    )
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [open, search])

  function close() {
    if (starting) return
    setSearch("")
    setSelected(null)
    setContacts([])
    onOpenChange(false)
  }

  async function start() {
    if (!selected || starting) return
    setStarting(true)
    try {
      const { runId } = await testAutomationWithContact(
        automationId,
        selected.id
      )
      toast.success(
        `Testing "${automationName}" as ${selected.name || selected.email}.`
      )
      onOpenChange(false)
      setSearch("")
      setSelected(null)
      setContacts([])
      await onStarted(runId)
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Test with one contact</DialogTitle>
          <DialogDescription>
            Walk this flow using one contact&apos;s real details. Emails go to
            you with a TEST subject, and outside changes are skipped.
          </DialogDescription>
        </DialogHeader>
        <DialogToolbar>
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor={searchId}>Search contacts</Label>
            <DashboardToolbarSearch
              id={searchId}
              className="min-w-0 flex-1 sm:flex-1"
              inputClassName="sm:w-full lg:w-full"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setSelected(null)
              }}
              placeholder="Name or email…"
            />
          </div>
        </DialogToolbar>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Choose a contact</CardTitle>
              <CardDescription>
                The selected contact never receives an email and nothing about
                them is changed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {loading ? (
                <LoadingRow label="Finding contacts…" />
              ) : contacts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? "No contacts you could email match that search."
                    : "There are no contacts you could email to test with."}
                </p>
              ) : (
                <div className="grid gap-1" role="group" aria-label="Contacts">
                  {contacts.map((contact) => {
                    const chosen = selected?.id === contact.id
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setSelected(contact)}
                        className={cn(
                          "grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2 text-left hover:bg-muted/50",
                          focusRing,
                          chosen
                            ? "border-primary bg-muted/50"
                            : "border-transparent"
                        )}
                      >
                        <span className="truncate text-sm font-medium">
                          {contact.name || contact.email}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                        {chosen ? (
                          <CheckIcon className="col-start-2 row-span-2 row-start-1 size-4 self-center" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={starting}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected || starting}
            onClick={() => void start()}
          >
            {starting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Start test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
