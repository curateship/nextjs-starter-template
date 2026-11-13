import * as React from "react"
import { LayoutTemplateIcon, Loader2Icon, PenLineIcon, Trash2Icon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SavingInput } from "@/components/viral/saving-fields"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  deleteFormatFn,
  loadFormatScripts,
  renameFormatFn,
  writeFromFormatFn,
  type FormatScript,
  type ViralFormat,
} from "@/lib/api/viral/viral-library"
import { formatShortDay } from "@/lib/viral/viral-view"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { scriptText } from "@/lib/viral/analysis"
import { FORMAT_IDEA_MAX, FORMAT_NAME_MAX } from "@/lib/viral/formats"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"

type Scripts = { state: "loading" } | { state: "ready"; scripts: FormatScript[] } | { state: "failed"; error: string }

/**
 * One saved format on Library → Formats (`workspace/docs/library.md`, task
 * part 18): its parts in order, Write a script for an idea line in one of the
 * person's projects, and the scripts already written from it. The ⋮ renames
 * it and deletes it.
 */
export function LibraryFormatPanel({
  format,
  projects,
  writeForId,
  priceCents,
  onChanged,
  onDeleted,
}: {
  format: ViralFormat
  /** The person's own projects, samples left out: the ones a script can be written for. */
  projects: { id: string; name: string }[]
  /** The project picked on the left, or the first one. */
  writeForId: string | null
  priceCents: number
  onChanged: (format: ViralFormat) => void
  onDeleted: (format: ViralFormat) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [sections, toggle] = useOpenSections<"name">()
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState<"write" | "delete" | null>(null)
  const [projectId, setProjectId] = React.useState(writeForId ?? "")
  // Picking another project on the left while this format is open moves
  // "Written for" to it, since that pick is what Write a script writes for.
  const [writeForFrom, setWriteForFrom] = React.useState(writeForId)
  if (writeForFrom !== writeForId) {
    setWriteForFrom(writeForId)
    setProjectId(writeForId ?? "")
  }
  const [idea, setIdea] = React.useState("")
  const [scripts, setScripts] = React.useState<Scripts>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const pickedProject = projects.find((project) => project.id === projectId) ?? null

  React.useEffect(() => {
    let live = true
    loadFormatScripts(format.id)
      .then((list) => {
        if (live) setScripts({ state: "ready", scripts: list })
      })
      .catch((error) => {
        if (live) setScripts({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [format.id, reloads])

  async function rename(name: string) {
    try {
      onChanged(await renameFormatFn(format.id, name))
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  async function write() {
    if (!pickedProject) {
      showErrorToast("Make a project of your own first, so the script has a topic to be written for.")
      return
    }
    if (!idea.trim()) {
      showErrorToast("Say what this video is about first.")
      return
    }
    setBusy("write")
    dismissErrorToast()
    try {
      const script = await writeFromFormatFn({ formatId: format.id, projectId: pickedProject.id, idea })
      setScripts((was) => (was.state === "ready" ? { state: "ready", scripts: [script, ...was.scripts] } : was))
      setIdea("")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy("delete")
    try {
      await deleteFormatFn(format.id)
      setDeleting(false)
      onDeleted(format)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const total = format.parts.reduce((sum, part) => sum + part.seconds, 0)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<LayoutTemplateIcon />}
        title={format.name}
        action={
          <FoldingMenu label="More for this format" align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuSection label="Name" value={format.name} open={sections.has("name")} onToggle={() => toggle("name")}>
              <Label htmlFor={`format-name-${format.id}`} className="sr-only">
                Name
              </Label>
              <SavingInput
                id={`format-name-${format.id}`}
                value={format.name}
                maxLength={FORMAT_NAME_MAX}
                onSave={rename}
              />
            </MenuSection>
            <MenuLine />
            <MenuAction
              icon={<Trash2Icon className="size-4" />}
              destructive
              onClick={() => {
                setMenuOpen(false)
                setDeleting(true)
              }}
            >
              Delete format
            </MenuAction>
          </FoldingMenu>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div data-side-panel-body="" className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <PanelCard storageId="viral-format-parts" title="Parts" meta={`About ${total}s in all`}>
            <ol className="grid gap-2 text-sm break-words">
              {format.parts.map((part, index) => (
                <li key={index} className="grid gap-0.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {segmentRoleLabels[part.role]} · about {part.seconds}s
                  </span>
                  {part.summary ? <span>{part.summary}</span> : null}
                </li>
              ))}
            </ol>
            {format.sourceTitle ? (
              <p className="mt-3 text-xs text-muted-foreground">Saved from "{format.sourceTitle}"</p>
            ) : null}
          </PanelCard>

          <PanelCard storageId="viral-format-write" title="Write a script" meta={`About ${priceCents} cent${priceCents === 1 ? "" : "s"}`}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <div className="grid gap-2">
                <Label htmlFor={`format-project-${format.id}`}>Written for</Label>
                {projects.length ? (
                  <Select value={pickedProject?.id ?? ""} onValueChange={setProjectId}>
                    <SelectTrigger id={`format-project-${format.id}`} className="w-full">
                      <SelectValue placeholder="Pick a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">Make a project of your own first. Its topic is what the script is written for.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`format-idea-${format.id}`}>The idea</Label>
                <Textarea
                  id={`format-idea-${format.id}`}
                  rows={1}
                  value={idea}
                  maxLength={FORMAT_IDEA_MAX}
                  placeholder="Three lunches dads can prep in ten minutes"
                  onChange={(event) => setIdea(event.target.value)}
                />
              </div>
              <div>
                <Button type="button" onClick={() => void write()} disabled={busy === "write"}>
                  {busy === "write" ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                  Write
                </Button>
              </div>
            </div>
          </PanelCard>

          <PanelCard storageId="viral-format-scripts" title="Scripts">
            {scripts.state === "loading" ? (
              <LoadingRow label="Reading the scripts" />
            ) : scripts.state === "failed" ? (
              <ErrorRow message={scripts.error} onRetry={() => setReloads((count) => count + 1)} />
            ) : scripts.scripts.length ? (
              <ul className="grid gap-4 text-sm break-words">
                {scripts.scripts.map((script) => (
                  <ScriptRow key={script.id} script={script} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing written from this format yet.</p>
            )}
          </PanelCard>
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this format?"
        description={`"${format.name}" goes, with every script written from it.`}
        confirmLabel="Delete format"
        loading={busy === "delete"}
        onConfirm={() => void remove()}
      />
    </>
  )
}

function ScriptRow({ script }: { script: FormatScript }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(scriptText(script.script, segmentRoleLabels))
    } catch {
      showErrorToast("The script could not be copied. Select the words and copy them instead.")
    }
  }
  return (
    <li className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <p className="font-medium">{script.idea}</p>
      <p className="text-xs text-muted-foreground">
        {[script.projectName, formatShortDay(script.createdAt)].filter(Boolean).join(" · ")}
      </p>
      {script.script.map((part, index) => (
        <div key={index} className="grid gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">
            {segmentRoleLabels[part.role]} · about {part.seconds}s
          </p>
          <p className="whitespace-pre-wrap">{part.words}</p>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          Copy
        </Button>
      </div>
    </li>
  )
}
