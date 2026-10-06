import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { MessageSquareQuoteIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { VoiceDialog } from "@/components/social/voices/voice-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { getVoiceErrorMessage, removeVoices, type VoiceView } from "@/lib/api/social/voices"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { voiceDeleteWords, voiceUsersList } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "name" | "usedBy" | "changed"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Voice", column: "main" },
  { key: "usedBy", label: "Used by", column: "meta" },
  { key: "changed", label: "Changed", column: "meta" },
]

function compare(a: VoiceView, b: VoiceView, column: SortColumn): number {
  if (column === "usedBy") return a.usedBy.length - b.usedBy.length
  if (column === "changed") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  return a.name.localeCompare(b.name)
}

/**
 * Every voice the AI can write in: the voice, what you make, and your rules,
 * named once and shared by any number of accounts on any network. Tyler asked
 * for this on 6 Oct 2026, so a second account does not retype all three.
 *
 * Built like the Proxies dashboard. A voice opens as a window over the list,
 * with `?open=<id>` in the address, which is where the Reddit account tab's
 * link leads.
 */
export function VoicesDashboard({ initial, openId }: { initial: VoiceView[]; openId?: string }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const voices = initial

  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()
  const [creating, setCreating] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<VoiceView[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setOpen = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const editing = voices.find((voice) => voice.id === openId) ?? null

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getVoiceErrorMessage(loadError))
    }
  }, [router])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return voices
      .filter(
        (voice) =>
          !query ||
          voice.name.toLowerCase().includes(query) ||
          voice.voice.toLowerCase().includes(query) ||
          voice.usedBy.some((account) => account.handle.toLowerCase().includes(query))
      )
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, search, sort, voices])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((voice) => voice.id)

  async function remove(targets: VoiceView[]) {
    setDeleting(true)
    try {
      const { deleted } = await removeVoices(targets.map((voice) => voice.id))
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: targets.length - deleted.length,
          one: "voice",
          many: "voices",
          verb: "deleted",
        })
      )
      selection.clear()
      setDeleteTargets([])
      await refresh()
    } catch (deleteError) {
      showErrorToast(getVoiceErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Voices"
        icon={<MessageSquareQuoteIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setDeleteTargets(voices.filter((voice) => selection.selected.has(voice.id)))}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="voice-search"
              aria-label="Search voices"
              placeholder="Search voices…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New voice
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="voices"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          voices.length
            ? "No voices match that."
            : "No voices yet. Write one, then pick it for the Reddit account in Settings."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((voice) => (
          <TableRow key={voice.id} className="group" rowAction={() => setOpen(voice.id)}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(voice.id)}
                onCheckedChange={() => selection.toggle(voice.id)}
                aria-label={`Select ${voice.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => setOpen(voice.id)}
              >
                {voice.name}
              </button>
              <span className="line-clamp-1 whitespace-normal text-xs text-muted-foreground" title={voice.voice}>
                {voice.voice || "No words yet"}
              </span>
            </TableCell>
            <TableCell column="meta" className="text-sm">
              {voice.usedBy.length ? (
                voiceUsersList(voice.usedBy)
              ) : (
                <span className="text-muted-foreground">Nobody</span>
              )}
            </TableCell>
            <TableCell column="meta" className="text-sm text-muted-foreground">
              {formatTimeAgo(voice.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(voice.id)}
                title="Voice settings"
                aria-label={`Edit ${voice.name}`}
              >
                <SettingsIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTargets([voice])}
                title="Delete voice"
                aria-label={`Delete ${voice.name}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <VoiceDialog
        key={editing?.id ?? (creating ? "new-voice" : "closed")}
        open={creating || Boolean(editing)}
        voice={editing}
        onDelete={(voice) => {
          // One window at a time: the voice's window gives way to the question.
          setOpen(undefined)
          setDeleteTargets([voice])
        }}
        onClose={() => {
          setCreating(false)
          setOpen(undefined)
        }}
        onSaved={async () => {
          await refresh()
          setCreating(false)
          setOpen(undefined)
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteTargets([])
        }}
        title={deleteTargets.length === 1 ? "Delete this voice?" : `Delete ${deleteTargets.length} voices?`}
        description={voiceDeleteWords(deleteTargets.flatMap((voice) => voice.usedBy))}
        confirmLabel={deleteTargets.length === 1 ? "Delete voice" : "Delete voices"}
        loading={deleting}
        onConfirm={() => void remove(deleteTargets)}
      />
    </>
  )
}
