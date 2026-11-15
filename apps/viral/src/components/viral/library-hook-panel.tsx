import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon, FilmIcon, PlayIcon, QuoteIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/viral/cover-image"
import { HookIdeasCards } from "@/components/viral/library-hook-ideas"
import { OwnHookMenu } from "@/components/viral/library-own-hook"
import { SocialIcon } from "@/components/viral/social-icon"
import { TagField } from "@/components/viral/vault-item-panel"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { saveHookTagsFn, type LibraryHook, type OwnLibraryHook } from "@/lib/api/viral/viral-library"
import { showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { hookTypeLabel, type HookTypeChoice } from "@/lib/viral/hook-types"
import { formatTimecode } from "@/lib/viral/viral-breakdown"
import type { WriterPrice } from "@/lib/viral/writers"

/**
 * One hook on Library → Hooks (`workspace/docs/library.md`): the words with
 * Copy, its type, the person's tags, and Write hooks like this. An analysed
 * video's hook also shows the video and the projects that analysed it, and
 * Open in the project plays it there from the hook's first moment. Your own
 * hook shows its link instead, and its ⋮ edits and deletes it; it has no
 * Open in the project, because there is no video.
 */
export function LibraryHookPanel({
  hook,
  tags,
  choices,
  projects,
  writeForId,
  ideasPrice,
  onChanged,
  onDeleted,
}: {
  hook: LibraryHook
  /** Every tag this person has used, offered as they type. */
  tags: string[]
  /** The fixed types and the person's own. */
  choices: HookTypeChoice[]
  /** The person's own projects, samples left out: the ones hooks can be written for. */
  projects: { id: string; name: string }[]
  /** The project picked on the left, or the first one. */
  writeForId: string | null
  ideasPrice: WriterPrice
  onChanged: (hook: LibraryHook) => void
  onDeleted: (hook: OwnLibraryHook) => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const typeLabel = hookTypeLabel(hook.typeId, choices)

  async function copy() {
    try {
      await navigator.clipboard.writeText(hook.text)
    } catch {
      showErrorToast("The hook could not be copied. Select the words and copy them instead.")
    }
  }

  async function saveTags(next: string[]) {
    try {
      onChanged({ ...hook, tags: await saveHookTagsFn(hook, next) })
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  function openIn(projectId: string) {
    if (hook.kind !== "video") return
    void navigate({
      to: "/admin/projects/$projectId",
      params: { projectId },
      search: { open: hook.key, at: hook.hook.startMs > 0 ? hook.hook.startMs : undefined },
    })
  }

  const home = hook.kind === "video" ? (hook.projects[0] ?? null) : null

  return (
    <>
      {hook.kind === "video" ? (
        <DashboardCardTitleHeader
          icon={<SocialIcon social={hook.platform} />}
          title={
            <span className="grid leading-tight">
              <span className="truncate">{hook.title}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {hook.channelName ? `${creatorPlatformLabels[hook.platform]} · ${hook.channelName}` : creatorPlatformLabels[hook.platform]}
              </span>
            </span>
          }
          action={
            <FoldingMenu label="More for this hook" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuAction
                icon={<CopyIcon className="size-4" />}
                onClick={() => {
                  setMenuOpen(false)
                  void copy()
                }}
              >
                Copy the hook
              </MenuAction>
              {hook.projects.map((project) => (
                <MenuAction
                  key={project.id}
                  icon={<PlayIcon className="size-4" />}
                  onClick={() => {
                    setMenuOpen(false)
                    openIn(project.id)
                  }}
                >
                  Open in {project.name}
                </MenuAction>
              ))}
            </FoldingMenu>
          }
        />
      ) : (
        <DashboardCardTitleHeader
          icon={<QuoteIcon />}
          title={
            <span className="grid leading-tight">
              <span className="truncate">Your hook</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{typeLabel ?? "No type yet"}</span>
            </span>
          }
          action={
            <OwnHookMenu hook={hook} choices={choices} onCopy={() => void copy()} onChanged={onChanged} onDeleted={onDeleted} />
          }
        />
      )}
      <ScrollArea className="min-h-0 flex-1">
        {/* A side panel's body, so its first card follows Settings -> Styling ->
            Panel cards -> Opacity. The cover is a figure, not a div, so that
            card is still the body's first div (UI standard, "A side panel's
            body"). */}
        <div data-side-panel-body="" className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          {hook.kind === "video" ? (
            <figure className="mx-auto aspect-[9/16] w-32 overflow-hidden rounded-md bg-muted">
              <CoverImage
                src={hook.thumbnailUrl}
                className="size-full object-cover"
                fallback={
                  <span className="grid size-full place-items-center">
                    <FilmIcon className="size-5 text-muted-foreground" />
                  </span>
                }
              />
            </figure>
          ) : null}
          <PanelCard storageId="viral-library-hook" title="Hook" meta={typeLabel ?? "No type yet"}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
              <p className="font-medium">"{hook.text}"</p>
              {hook.kind === "video" ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatTimecode(hook.hook.startMs)} to {formatTimecode(hook.hook.endMs)}
                </p>
              ) : hook.link ? (
                <a
                  href={hook.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground underline"
                >
                  <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{hook.link}</span>
                </a>
              ) : null}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  <CopyIcon />
                  Copy
                </Button>
              </div>
            </div>
          </PanelCard>
          <PanelCard storageId="viral-library-hook-tags" title="Tags">
            <TagField id={`library-hook-tags-${hook.id}`} value={hook.tags} known={tags} onChange={saveTags} />
          </PanelCard>
          <HookIdeasCards hook={hook} projects={projects} writeForId={writeForId} price={ideasPrice} />
          {hook.kind === "video" ? (
            <PanelCard storageId="viral-library-hook-details" title="Details">
              <dl className="grid gap-2 text-sm">
                <Detail label="Views" value={formatCount(hook.views)} />
                <Detail label="Winner" value={hook.winner ? "Yes" : "No"} />
                <Detail label="Analysed in" value={hook.projects.map((project) => project.name).join(", ") || "-"} />
              </dl>
            </PanelCard>
          ) : null}
        </div>
      </ScrollArea>
      {home ? (
        <div className="shrink-0 border-t p-3">
          <Button type="button" className="w-full" onClick={() => openIn(home.id)}>
            <PlayIcon />
            Open in {home.name}
          </Button>
        </div>
      ) : null}
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
