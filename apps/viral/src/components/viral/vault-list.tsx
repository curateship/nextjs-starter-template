import { FilmIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollBar } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/viral/cover-image"
import type { VaultItem } from "@/lib/api/viral/viral-vault"
import { cn } from "@/lib/utils"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { vaultStatusLabels } from "@/lib/viral/vault"
import { formatShortDay } from "@/lib/viral/viral-view"

/**
 * The vault's ideas as a list, newest first: the cover, the title and its
 * channel, the status, the tags, the views when it was saved and when it was
 * saved. Picking a row opens the idea on the right. The project page's vault
 * draws it with one project's ideas; the Vault page with every project's,
 * where `showProject` adds the project's name under each title. While Mass
 * select is on, `ticked` and `onTick` draw a tick box first on each row.
 */
export function VaultList({
  items,
  selectedId,
  onPick,
  showProject = false,
  ticked,
  onTick,
}: {
  items: VaultItem[]
  selectedId: string | null
  onPick: (item: VaultItem) => void
  showProject?: boolean
  ticked?: Set<string>
  onTick?: (id: string) => void
}) {
  const ticking = Boolean(ticked && onTick)
  return (
    <>
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            {ticking ? <TableHead column="select" /> : null}
            <TableHead column="main" className="w-full min-w-56">
              Idea
            </TableHead>
            <TableHead column="meta">Status</TableHead>
            <TableHead column="meta">Views</TableHead>
            <TableHead column="meta">Saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              aria-current={item.id === selectedId ? "true" : undefined}
              className={cn(item.id === selectedId && "bg-muted")}
              rowAction={() => onPick(item)}
            >
              {ticking ? (
                <TableCell column="select">
                  <Checkbox
                    checked={ticked?.has(item.id) ?? false}
                    onCheckedChange={() => onTick?.(item.id)}
                    aria-label={`Tick ${item.title}`}
                  />
                </TableCell>
              ) : null}
              <TableCell column="main" className="w-full max-w-0 min-w-56">
                <div className="flex items-center gap-3">
                  <span className="size-8 shrink-0 overflow-hidden rounded-md bg-muted">
                    <CoverImage
                      src={item.thumbnailUrl}
                      className="size-full object-cover"
                      fallback={
                        <span className="grid size-full place-items-center">
                          <FilmIcon className="size-4 text-muted-foreground" />
                        </span>
                      }
                    />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => onPick(item)}>
                      {item.title}
                    </button>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">
                        {showProject ? `${item.projectName} · ` : ""}
                        {item.channelName || creatorPlatformLabels[item.platform]}
                      </span>
                      {item.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="shrink-0">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </span>
                </div>
              </TableCell>
              <TableCell column="meta">
                <Badge variant={item.status === "idea" ? "outline" : "secondary"}>{vaultStatusLabels[item.status]}</Badge>
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {formatCount(item.stats.views)}
              </TableCell>
              <TableCell column="meta" className="whitespace-nowrap">
                {formatShortDay(item.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </>
  )
}
