import * as React from "react"
import { ArrowLeftIcon, ClapperboardIcon, ExternalLinkIcon, Loader2Icon, RefreshCwIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import type { VaultItem } from "@/lib/api/viral/viral-vault"
import { loadVideoProjects, refreshVideoSend, sendToVideoFn, type VideoProjectOption } from "@/lib/api/viral/viral-video-link"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Video is asked how a send is copying at most this often (`workspace/docs/send-to-video.md`). */
const SEND_POLL_MS = 20_000

type Picker =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; projects: VideoProjectOption[]; lastProjectId: string | null }

/**
 * A footer button's words, hidden while the row is narrow so three buttons
 * share one row as icons, and shown once the nearest `@container` is 320px
 * wide. The button's tooltip and name carry the words either way.
 */
export function FitLabel({ full }: { full: string }) {
  return <span className="hidden truncate @xs:inline">{full}</span>
}

/**
 * A footer button that may show its icon alone in a narrow panel, so it is
 * named and has the shared tooltip. It takes the props a menu's trigger
 * hands it, so it can open a dropdown too.
 */
export function TipButton({ tip, ...props }: React.ComponentProps<typeof Button> & { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={tip} {...props} />
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Send to Video (task part 22): a button that opens a picker of the Video
 * app's projects, the one this project sent to last first. An idea sent
 * before asks Replace (the same draft gets the new script and file) or Send
 * as new. While Video copies the original the button says so, and Video is
 * asked again every 20 seconds until the draft is ready; then the button
 * becomes Open in Video.
 */
export function SendToVideoButton({
  item,
  projectId,
  onChanged,
  className,
  startOpen = false,
  compact = false,
}: {
  item: VaultItem
  /** The Viral project, for the last Video project it sent to. */
  projectId: string
  onChanged: (item: VaultItem) => void
  className?: string
  /** Opens the picker as soon as it is drawn: Send to Video pressed before the video was in the vault. */
  startOpen?: boolean
  /** One of three buttons in a footer row: its words show only once the row has room. */
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [picker, setPicker] = React.useState<Picker>({ state: "loading" })
  const [asking, setAsking] = React.useState<VideoProjectOption | null>(null)
  const [busy, setBusy] = React.useState(false)
  const changed = React.useRef(onChanged)
  React.useEffect(() => {
    changed.current = onChanged
  })

  const sendId = item.send?.id ?? null
  const copying = item.send?.status === "sending" || item.send?.status === "copying"
  React.useEffect(() => {
    if (!sendId || !copying) return
    const timer = setInterval(() => {
      refreshVideoSend(sendId)
        .then((next) => changed.current(next))
        .catch(() => undefined)
    }, SEND_POLL_MS)
    return () => clearInterval(timer)
  }, [copying, sendId])

  function load() {
    setPicker({ state: "loading" })
    loadVideoProjects(projectId)
      .then((answer) => setPicker({ state: "ready", ...answer }))
      .catch((error) => setPicker({ state: "failed", error: getViralErrorMessage(error) }))
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    setAsking(null)
    if (next) load()
  }

  const startedOpen = React.useRef(false)
  React.useEffect(() => {
    if (!startOpen || startedOpen.current) return
    startedOpen.current = true
    setOpen(true)
    loadVideoProjects(projectId)
      .then((answer) => setPicker({ state: "ready", ...answer }))
      .catch((error) => setPicker({ state: "failed", error: getViralErrorMessage(error) }))
  }, [projectId, startOpen])

  async function send(project: VideoProjectOption, mode: "new" | "replace" | null) {
    setBusy(true)
    try {
      const next = await sendToVideoFn({ itemId: item.id, videoProjectId: project.id, mode })
      setOpen(false)
      changed.current(next)
      toast.success(
        next.send?.status === "failed"
          ? `Video refused it: ${next.send.error ?? "no reason given"}`
          : next.send?.status === "ready"
            ? `Sent to ${project.name}.`
            : `Sending to ${project.name}. Video is copying the original; this says when it's in.`
      )
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function pick(project: VideoProjectOption) {
    // Sent before: Replace or Send as new is asked in the same menu.
    if (item.sentAt) setAsking(project)
    else void send(project, null)
  }

  const word = copying ? "Sending to Video…" : item.sentAt ? "Send again" : "Send to Video"
  const trigger = (
    <TipButton
      type="button"
      variant="outline"
      className={className}
      disabled={busy || copying}
      tip={word}
    >
      {busy || copying ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
      {compact ? <FitLabel full={word} /> : <span className="truncate">{word}</span>}
    </TipButton>
  )

  const projects = picker.state === "ready" ? orderProjects(picker.projects, picker.lastProjectId) : []

  return (
    <div className="grid min-w-0 gap-2">
      {item.send?.status === "failed" ? (
        <ErrorRow message={`The last send failed: ${item.send.error ?? "Video gave no reason."}`} />
      ) : null}
      {item.sentEditUrl && !copying ? (
        <TipButton variant="outline" className={className} asChild tip="Open in Video">
          <a href={item.sentEditUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLinkIcon />
            {compact ? <FitLabel full="Open in Video" /> : "Open in Video"}
          </a>
        </TipButton>
      ) : null}
      <FoldingMenu label="Send to Video" fit align="end" open={open} onOpenChange={onOpenChange} trigger={trigger}>
        {asking ? (
          <>
            <p className="px-2.5 py-2 text-muted-foreground">Sent before. What should {asking.name} get?</p>
            <MenuAction icon={<RefreshCwIcon className="size-4" />} disabled={busy} onClick={() => void send(asking, "replace")}>
              Replace the draft
            </MenuAction>
            <MenuAction icon={<SendIcon className="size-4" />} disabled={busy} onClick={() => void send(asking, "new")}>
              Send as new
            </MenuAction>
            <MenuLine />
            <MenuAction icon={<ArrowLeftIcon className="size-4" />} onClick={() => setAsking(null)}>
              Pick another project
            </MenuAction>
          </>
        ) : picker.state === "loading" ? (
          <LoadingRow label="Asking Video for its projects" />
        ) : picker.state === "failed" ? (
          <p className="max-w-72 px-2.5 py-2 text-muted-foreground">{picker.error}</p>
        ) : projects.length ? (
          projects.map((project) => (
            <MenuAction
              key={project.id}
              icon={<ClapperboardIcon className="size-4" />}
              disabled={busy}
              onClick={() => pick(project)}
            >
              <span className="truncate">{project.name}</span>
              {project.id === (picker.state === "ready" ? picker.lastProjectId : null) ? (
                <span className="ml-auto pl-3 text-muted-foreground">Last used</span>
              ) : null}
            </MenuAction>
          ))
        ) : (
          <p className="max-w-72 px-2.5 py-2 text-muted-foreground">Video has no projects yet. Make one in Video first.</p>
        )}
      </FoldingMenu>
    </div>
  )
}

/** The last project sent to first, then Video's own order. */
function orderProjects(projects: VideoProjectOption[], lastProjectId: string | null) {
  const last = projects.find((one) => one.id === lastProjectId)
  return last ? [last, ...projects.filter((one) => one.id !== last.id)] : projects
}
