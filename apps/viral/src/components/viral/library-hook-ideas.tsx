import * as React from "react"
import { CopyIcon, Loader2Icon, PenLineIcon } from "lucide-react"
import { toast } from "sonner"

import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadHookIdeas, writeHookIdeasFn, type HookIdeas, type LibraryHook } from "@/lib/api/viral/viral-library"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { HOOK_IDEAS_COUNT } from "@/lib/viral/library"
import { formatShortDay } from "@/lib/viral/viral-view"
import { writerPriceWords, type WriterPrice } from "@/lib/viral/writers"

type Ideas = { state: "loading" } | { state: "ready"; ideas: HookIdeas[] } | { state: "failed"; error: string }

/**
 * Write hooks like this on a hook's right panel (`workspace/docs/library.md`,
 * more-features task part 6). Tyler, 6 Nov 2026: "Kept under the hook". The
 * project picker follows the project picked on the left, as a format's
 * does; each press keeps five hooks under this one, newest first, each with
 * Copy.
 */
export function HookIdeasCards({
  hook,
  projects,
  writeForId,
  price,
}: {
  hook: Pick<LibraryHook, "kind" | "id">
  /** The person's own projects, samples left out: the ones hooks can be written for. */
  projects: { id: string; name: string }[]
  /** The project picked on the left, or the first one. */
  writeForId: string | null
  /** What one press costs, and who writes it (Settings → AI writer). */
  price: WriterPrice
}) {
  const [projectId, setProjectId] = React.useState(writeForId ?? "")
  const [writeForFrom, setWriteForFrom] = React.useState(writeForId)
  if (writeForFrom !== writeForId) {
    setWriteForFrom(writeForId)
    setProjectId(writeForId ?? "")
  }
  const [busy, setBusy] = React.useState(false)
  const [ideas, setIdeas] = React.useState<Ideas>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const pickedProject = projects.find((project) => project.id === projectId) ?? null
  const { kind, id } = hook

  React.useEffect(() => {
    let live = true
    loadHookIdeas({ kind, id })
      .then((list) => {
        if (live) setIdeas({ state: "ready", ideas: list })
      })
      .catch((error) => {
        if (live) setIdeas({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [kind, id, reloads])

  async function write() {
    if (!pickedProject) {
      showErrorToast("Make a project of your own first, so the hooks have a topic to be written for.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const written = await writeHookIdeasFn({ kind, id }, pickedProject.id)
      setIdeas((was) => (was.state === "ready" ? { state: "ready", ideas: [written, ...was.ideas] } : was))
      toast.success(`${HOOK_IDEAS_COUNT} hooks written.`)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const priceLine = writerPriceWords(price)

  return (
    <>
      <InspectorCard
        storageId="viral-library-hook-write"
        title="Write hooks like this"
        description={priceLine.charAt(0).toUpperCase() + priceLine.slice(1)}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`hook-ideas-project-${id}`}>Written for</Label>
            {projects.length ? (
              <Select value={pickedProject?.id ?? ""} onValueChange={setProjectId}>
                <SelectTrigger id={`hook-ideas-project-${id}`} className="w-full">
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
              <p className="text-sm text-muted-foreground">Make a project of your own first. Its topic is what the hooks are written for.</p>
            )}
          </div>
          <div>
            <Button type="button" onClick={() => void write()} disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
              Write {HOOK_IDEAS_COUNT} hooks
            </Button>
          </div>
        </div>
      </InspectorCard>

      <InspectorCard storageId="viral-library-hook-written" title="Hooks written">
        {ideas.state === "loading" ? (
          <LoadingRow label="Reading the hooks written" />
        ) : ideas.state === "failed" ? (
          <ErrorRow message={ideas.error} onRetry={() => setReloads((count) => count + 1)} />
        ) : ideas.ideas.length ? (
          <ul className="grid gap-4 text-sm break-words">
            {ideas.ideas.map((batch) => (
              <li key={batch.id} className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0">
                <p className="text-xs text-muted-foreground">
                  {[batch.projectName, formatShortDay(batch.createdAt)].filter(Boolean).join(" · ")}
                </p>
                <ul className="grid gap-1.5">
                  {batch.hooks.map((line, index) => (
                    <WrittenHook key={index} line={line} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing written from this hook yet.</p>
        )}
      </InspectorCard>
    </>
  )
}

function WrittenHook({ line }: { line: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(line)
      toast.success("Hook copied.")
    } catch {
      showErrorToast("The hook could not be copied. Select the words and copy them instead.")
    }
  }
  return (
    <li className="flex items-start gap-2">
      <p className="min-w-0 flex-1 pt-1">"{line}"</p>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy "${line}"`} onClick={() => void copy()}>
        <CopyIcon />
      </Button>
    </li>
  )
}
