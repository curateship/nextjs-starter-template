import * as React from "react"
import { CheckIcon, Loader2Icon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAutomationRunErrorMessage,
  listAutomationTestMembers,
  testAutomationWithMember,
  type AutomationTestMember,
} from "@/lib/api/automations/automation-runs"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export function TestWithMemberDialog({
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
  const [members, setMembers] = React.useState<AutomationTestMember[]>([])
  const [selected, setSelected] = React.useState<AutomationTestMember | null>(
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
          const result = await listAutomationTestMembers(search)
          if (current) setMembers(result)
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
    setMembers([])
    onOpenChange(false)
  }

  async function start() {
    if (!selected || starting) return
    setStarting(true)
    try {
      const { runId } = await testAutomationWithMember(
        automationId,
        selected.id
      )
      toast.success(`Testing "${automationName}" as ${selected.name}.`)
      onOpenChange(false)
      setSearch("")
      setSelected(null)
      setMembers([])
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
          <DialogTitle>Test with one member</DialogTitle>
          <DialogDescription>
            Walk this flow using one member&apos;s real details. Emails go to
            you with a TEST subject, and outside changes are skipped.
          </DialogDescription>
        </DialogHeader>
        <DialogToolbar>
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor={searchId}>Search members</Label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={searchId}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setSelected(null)
                }}
                className="pl-8"
                placeholder="Name or email…"
                autoComplete="off"
              />
            </div>
          </div>
        </DialogToolbar>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Choose a member</CardTitle>
              <CardDescription>
                The selected member never receives an email and their account is
                not changed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {loading ? (
                <LoadingRow label="Finding members…" />
              ) : members.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? "No active members match that search."
                    : "There are no active members to test with."}
                </p>
              ) : (
                <div className="grid gap-1" role="group" aria-label="Members">
                  {members.map((member) => {
                    const chosen = selected?.id === member.id
                    return (
                      <button
                        key={member.id}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setSelected(member)}
                        className={cn(
                          "grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2 text-left hover:bg-muted/50",
                          focusRing,
                          chosen
                            ? "border-primary bg-muted/50"
                            : "border-transparent"
                        )}
                      >
                        <span className="truncate text-sm font-medium">
                          {member.name || member.email}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {member.email}
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
