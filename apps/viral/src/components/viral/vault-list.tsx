import * as React from "react"
import { FilmIcon, LightbulbIcon } from "lucide-react"

import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { TableCell } from "@/components/ui/table"
import { CoverImage } from "@/components/viral/cover-image"
import { SocialIcon } from "@/components/viral/social-icon"
import type { VaultItem } from "@/lib/api/viral/viral-vault"
import { formatCount } from "@/lib/viral/creators"
import { vaultSourceLabel, vaultStatusLabels } from "@/lib/viral/vault"
import { formatShortDay } from "@/lib/viral/viral-view"

type VaultColumn = "idea" | "status" | "views" | "saved"

/**
 * The vault's ideas as a list, newest first, on the shell's table (the
 * Admin 3 panel design, "A table"): the cover, the title with its channel
 * and tags, then the status, the views when it was saved and when it was
 * saved, as chips that drop out as the middle narrows. The open idea has the
 * sliding bar. The Viral dashboard's Vault row draws every project's ideas,
 * where `showProject` adds the project's name under each title; a project's
 * own dashboard draws that project's. While Mass select is on, `ticks`
 * draws a tick box first on each row.
 */
export function VaultList({
  items,
  openId,
  onOpen,
  showProject = false,
  ticks,
  onRightClick,
  empty,
}: {
  items: VaultItem[]
  openId: string | null
  onOpen: (item: VaultItem) => void
  showProject?: boolean
  ticks?: { ticked: Set<string>; onTick: (id: string) => void; onTickAll: () => void } | null
  onRightClick?: (item: VaultItem, x: number, y: number) => void
  /** Drawn in place of the rows when there are none. */
  empty?: React.ReactNode
}) {
  const ids = items.map((item) => item.id)
  const all = ids.length > 0 && ids.every((id) => ticks?.ticked.has(id))
  const some = ids.some((id) => ticks?.ticked.has(id))
  return (
    <CrmTable<VaultColumn>
      columns={[
        { key: "idea", label: "Idea", column: "main", className: "min-w-40", sortable: false },
        { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
        { key: "views", label: "Views", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        { key: "saved", label: "Saved", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
      ]}
      sort="saved"
      direction="desc"
      onSort={() => undefined}
      actions={false}
      select={ticks ? { noun: "ideas", checked: all ? true : some ? "indeterminate" : false, onToggle: ticks.onTickAll } : null}
      empty={items.length ? null : empty}
    >
      {items.map((item) => (
        <CrmTableRow
          key={item.id}
          open={item.id === openId}
          label={item.title}
          tick={ticks ? { shown: true, ticked: ticks.ticked.has(item.id), onToggle: () => ticks.onTick(item.id) } : null}
          onOpen={() => onOpen(item)}
          onRightClick={onRightClick ? (x, y) => onRightClick(item, x, y) : undefined}
        >
          <MainCell
            lead={
              <span className="size-7 shrink-0 overflow-hidden rounded-md bg-muted">
                <CoverImage src={item.thumbnailUrl} className="size-full object-cover" fallback={<VaultIdeaIcon item={item} />} />
              </span>
            }
            name={item.title}
            line={[showProject ? item.projectName : null, item.channelName || vaultSourceLabel(item), ...item.tags.slice(0, 3)]
              .filter(Boolean)
              .join(" · ")}
          />
          <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
            <Chip muted={item.status === "idea"}>{vaultStatusLabels[item.status]}</Chip>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
            {formatCount(item.stats.views)}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden whitespace-nowrap md:hidden @2xl:table-cell">
            {formatShortDay(item.createdAt)}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )
}

/**
 * What stands in for an idea's cover when it has none: a film for a video,
 * the network's mark for a post, a light bulb for one you typed.
 */
export function VaultIdeaIcon({ item }: { item: Pick<VaultItem, "kind" | "platform"> }) {
  return (
    <span className="grid size-full place-items-center">
      {item.kind === "own" || !item.platform ? (
        <LightbulbIcon className="size-3.5 text-muted-foreground" />
      ) : item.kind === "post" ? (
        <SocialIcon social={item.platform} />
      ) : (
        <FilmIcon className="size-3.5 text-muted-foreground" />
      )}
    </span>
  )
}
