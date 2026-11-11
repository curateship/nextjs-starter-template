import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, FilmIcon, PlayIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/viral/cover-image"
import { SocialIcon } from "@/components/viral/social-icon"
import { TagField } from "@/components/viral/vault-item-panel"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { saveHookTagsFn, type LibraryHook } from "@/lib/api/viral/viral-library"
import { showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { formatTimecode } from "@/lib/viral/viral-breakdown"

/**
 * One hook on Library → Hooks (`workspace/docs/library.md`, task part 17):
 * the words, the video they open, the person's tags, and the projects that
 * analysed it. Open in the project plays the video there from the hook's
 * first moment.
 */
export function LibraryHookPanel({
  hook,
  tags,
  onTags,
}: {
  hook: LibraryHook
  /** Every tag this person has used, offered as they type. */
  tags: string[]
  onTags: (next: string[]) => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const platform = creatorPlatformLabels[hook.platform]
  const home = hook.projects[0] ?? null

  async function copy() {
    try {
      await navigator.clipboard.writeText(hook.hook.text)
    } catch {
      showErrorToast("The hook could not be copied. Select the words and copy them instead.")
    }
  }

  function openIn(projectId: string) {
    void navigate({
      to: "/admin/projects/$projectId",
      params: { projectId },
      search: { open: hook.key, at: hook.hook.startMs > 0 ? hook.hook.startMs : undefined },
    })
  }

  async function saveTags(next: string[]) {
    try {
      onTags(await saveHookTagsFn(hook.savedVideoId, next))
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<SocialIcon social={hook.platform} />}
        title={
          <span className="grid leading-tight">
            <span className="truncate">{hook.title}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {hook.channelName ? `${platform} · ${hook.channelName}` : platform}
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <div className="mx-auto aspect-[9/16] w-32 overflow-hidden rounded-md bg-muted">
            <CoverImage
              src={hook.thumbnailUrl}
              className="size-full object-cover"
              fallback={
                <span className="grid size-full place-items-center">
                  <FilmIcon className="size-5 text-muted-foreground" />
                </span>
              }
            />
          </div>
          <InspectorCard storageId="viral-library-hook" title="Hook">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
              <p className="font-medium">"{hook.hook.text}"</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatTimecode(hook.hook.startMs)} to {formatTimecode(hook.hook.endMs)}
              </p>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  <CopyIcon />
                  Copy
                </Button>
              </div>
            </div>
          </InspectorCard>
          <InspectorCard storageId="viral-library-hook-tags" title="Tags">
            <TagField id={`library-hook-tags-${hook.savedVideoId}`} value={hook.tags} known={tags} onChange={saveTags} />
          </InspectorCard>
          <InspectorCard storageId="viral-library-hook-details" title="Details">
            <dl className="grid gap-2 text-sm">
              <Detail label="Views" value={formatCount(hook.views)} />
              <Detail label="Analysed in" value={hook.projects.map((project) => project.name).join(", ") || "-"} />
            </dl>
          </InspectorCard>
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
