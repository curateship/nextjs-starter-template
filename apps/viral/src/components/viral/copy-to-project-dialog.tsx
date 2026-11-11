import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { copyVideoToProjectFn } from "@/lib/api/viral/viral-copy"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { copyVaultItemFn } from "@/lib/api/viral/viral-vault"
import { showErrorToast } from "@/lib/toast/error-toast"

/** What is being copied: a video on the right panel, or a vault idea. */
export type CopyTarget = { kind: "video"; url: string; title: string } | { kind: "idea"; itemId: string; title: string }

type Choices = { state: "loading" } | { state: "ready"; projects: { id: string; name: string }[] } | { state: "failed"; error: string }

/**
 * Copy to another project (`workspace/docs/vault.md`, task part 16; Tyler:
 * "Copy, both keep it"). Lists the person's other projects that aren't
 * archived or samples, and copies into the one picked. Both projects keep
 * it, sharing one downloaded file.
 */
export function CopyToProjectDialog({
  target,
  currentProjectId,
  onClose,
}: {
  /** Null while the window is shut. */
  target: CopyTarget | null
  currentProjectId: string
  onClose: () => void
}) {
  const [choices, setChoices] = React.useState<Choices>({ state: "loading" })
  const [picked, setPicked] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)
  const open = target !== null

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadViralProjects({ archived: false })
      .then((list) => {
        if (!live) return
        const projects = list.projects
          .filter((project) => project.id !== currentProjectId && !project.sample)
          .map((project) => ({ id: project.id, name: project.name }))
        setChoices({ state: "ready", projects })
        setPicked((was) => (projects.some((project) => project.id === was) ? was : (projects[0]?.id ?? "")))
      })
      .catch((error) => {
        if (live) setChoices({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [currentProjectId, open, reloads])

  async function copy() {
    if (!target) return
    if (!picked) {
      showErrorToast("You have no other project to copy it to. Make one first.")
      return
    }
    setBusy(true)
    try {
      if (target.kind === "idea") {
        await copyVaultItemFn(target.itemId, picked)
      } else {
        await copyVideoToProjectFn(target.url, picked)
      }
      onClose()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const projects = choices.state === "ready" ? choices.projects : []

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy to another project</DialogTitle>
          <DialogDescription>
            {target?.kind === "idea"
              ? "The idea keeps its analysis, numbers, notes, status and tags in both vaults."
              : "The video shows in both projects, playing from one downloaded copy."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="truncate">{target?.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {choices.state === "loading" ? (
                <LoadingRow label="Finding your projects" />
              ) : choices.state === "failed" ? (
                <ErrorRow message={choices.error} onRetry={() => setReloads((count) => count + 1)} />
              ) : projects.length ? (
                <div className="grid gap-2">
                  <Label htmlFor="viral-copy-project">Project</Label>
                  <Select value={picked} onValueChange={setPicked}>
                    <SelectTrigger id="viral-copy-project" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You have no other project to copy it to. Make one first.</p>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void copy()} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Copy to project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
