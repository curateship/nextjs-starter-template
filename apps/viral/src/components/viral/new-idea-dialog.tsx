import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { createOwnIdeaFn, type VaultItem } from "@/lib/api/viral/viral-vault"
import { emptyWrittenPageBody, writtenPageBodyIsEmpty, type WrittenPageNode } from "@/lib/pages/written-page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { VAULT_TITLE_MAX } from "@/lib/viral/vault"

type Choices = { state: "loading" } | { state: "ready"; projects: { id: string; name: string }[] } | { state: "failed"; error: string }

/**
 * "+ New idea" on the Vault page's middle header and on a project's vault
 * (more-features task part 3, Tyler: "Script on a button"). The button sits
 * where every list's primary add sits, and keeps its icon alone in a narrow
 * panel.
 */
export function NewIdeaButton({ onPress }: { onPress: () => void }) {
  return (
    <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New idea" onClick={onPress}>
      <PlusIcon className="size-4" />
      <span className="@max-3xl:hidden">New idea</span>
    </Button>
  )
}

/**
 * The New idea window: the project, a title, and notes in the shell's
 * editor. The idea starts at Idea with no script; Write a script on the idea
 * writes one when pressed. The project list leaves out samples and archived
 * projects, which the server refuses too.
 */
export function NewIdeaDialog({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean
  /** The project it opens on: the one on screen, or the one picked on the Vault page's left. */
  projectId?: string
  onClose: () => void
  onCreated: (item: VaultItem) => void | Promise<void>
}) {
  const [choices, setChoices] = React.useState<Choices>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const [picked, setPicked] = React.useState(projectId ?? "")
  const [title, setTitle] = React.useState("")
  const [notes, setNotes] = React.useState<WrittenPageNode | null>(null)
  // A fresh editor each time the window opens, so last time's words never show. The editor reads its
  // starting document once, so it is handed the same one until then.
  const [opening, setOpening] = React.useState(0)
  const [start, setStart] = React.useState(emptyWrittenPageBody)
  const [busy, setBusy] = React.useState(false)
  const [titleWrong, setTitleWrong] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTitle("")
      setNotes(null)
      setTitleWrong(false)
      setOpening((count) => count + 1)
      setStart(emptyWrittenPageBody())
      if (projectId) setPicked(projectId)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadViralProjects({ archived: false })
      .then((list) => {
        if (!live) return
        const projects = list.projects.filter((project) => !project.sample).map((project) => ({ id: project.id, name: project.name }))
        setChoices({ state: "ready", projects })
        setPicked((was) => (projects.some((project) => project.id === was) ? was : (projects[0]?.id ?? "")))
      })
      .catch((error) => {
        if (live) setChoices({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [open, reloads])

  const notesWritten = notes !== null && !writtenPageBodyIsEmpty(notes)
  const dirty = Boolean(title.trim()) || notesWritten
  const projects = choices.state === "ready" ? choices.projects : []

  async function create() {
    if (!picked) {
      showErrorToast("Make a project of your own first, then add ideas to it.")
      return
    }
    if (!title.trim()) {
      setTitleWrong(true)
      showErrorToast("Give the idea a title first.")
      return
    }
    setBusy(true)
    try {
      const item = await createOwnIdeaFn({ projectId: picked, title, notes: notesWritten ? JSON.stringify(notes) : "" })
      toast.success(`"${item.title}" is in ${item.projectName}'s vault. Press Write a script on it when you want one.`)
      onClose()
      await onCreated(item)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New idea</DialogTitle>
            <DialogDescription>Your own idea, kept in a project's vault. It starts at Idea, with no script until you ask for one.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The idea</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {choices.state === "loading" ? (
                  <LoadingRow label="Finding your projects" />
                ) : choices.state === "failed" ? (
                  <ErrorRow message={choices.error} onRetry={() => setReloads((count) => count + 1)} />
                ) : projects.length ? (
                  <div className="grid gap-2">
                    <Label htmlFor="viral-new-idea-project">Project</Label>
                    <Select value={picked} onValueChange={setPicked}>
                      <SelectTrigger id="viral-new-idea-project" className="w-full">
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
                  <p className="text-sm text-muted-foreground">You have no project of your own yet. Make one first.</p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="viral-new-idea-title">Title</Label>
                  <Input
                    id="viral-new-idea-title"
                    autoFocus
                    value={title}
                    maxLength={VAULT_TITLE_MAX}
                    aria-invalid={titleWrong || undefined}
                    placeholder="Three lunches you can make in ten minutes"
                    onChange={(event) => {
                      setTitle(event.target.value)
                      if (event.target.value.trim()) setTitleWrong(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void create()
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <DocumentEditor
                    key={opening}
                    value={start}
                    placeholder="What it's about, how you'd film it"
                    onChange={setNotes}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create idea
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
