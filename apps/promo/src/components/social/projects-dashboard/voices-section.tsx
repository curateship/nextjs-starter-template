import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { MessageSquareQuoteIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { VoiceRecord } from "@/components/social/voices/voice-record"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell } from "@/components/ui/table"
import { getVoiceErrorMessage, removeVoices, saveVoice, type VoiceView } from "@/lib/api/social/voices"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import type { ProjectsSearch } from "@/lib/social/projects-dashboard-search"
import { voiceDeleteWords, voiceUsersList } from "@/lib/social/wording"

type Column = "name" | "usedBy" | "changed"

/**
 * The Voices section (Tyler, 12 Nov 2026): every voice the AI can write in,
 * named once and shared by any number of accounts on any network. Each row
 * has its name and first line, who drafts with it and when it last changed.
 * The voice opens on the right, saving as it is typed (`VoiceRecord`), in
 * place of the old window. Voices belong to no project, so the Projects
 * block narrows nothing here.
 */
export function VoicesSection({
  voices,
  search,
  frame,
}: {
  voices: VoiceView[]
  search: ProjectsSearch
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const [sort, setSort] = React.useState<Column>("name")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "name" ? "asc" : "desc")
    }
  }
  const [deleting, setDeleting] = React.useState<VoiceView[] | null>(null)
  const closingDeleting = useLastValue(deleting)
  const shownDeleting = deleting ?? closingDeleting
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getVoiceErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = q.trim().toLowerCase()
    return voices
      .filter(
        (voice) =>
          !needle ||
          voice.name.toLowerCase().includes(needle) ||
          voice.voice.toLowerCase().includes(needle) ||
          voice.usedBy.some((account) => account.handle.toLowerCase().includes(needle))
      )
      .sort((a, b) => {
        if (sort === "usedBy") return (a.usedBy.length - b.usedBy.length) * sign || a.name.localeCompare(b.name)
        if (sort === "changed") return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sign
        return a.name.localeCompare(b.name) * sign
      })
  }, [direction, q, sort, voices])
  const ids = rows.map((voice) => voice.id)
  const openId = search.open
  const openVoice = voices.find((voice) => voice.id === openId) ?? null

  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((voice) => voice.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  useClearSelectionOnListChange(selection.setSelected, q)
  const selected = voices.filter((voice) => selection.selected.has(voice.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  async function remove(list: VoiceView[]) {
    const ok = await run(async () => {
      await removeVoices(list.map((voice) => voice.id))
      selection.clear()
      await router.invalidate()
    })
    if (ok) setDeleting(null)
  }

  async function create() {
    const name = newName.trim()
    if (!name) return
    const ok = await run(async () => {
      const { id } = await saveVoice(null, { name })
      await router.invalidate()
      setOpen(id)
    })
    if (ok) {
      setCreating(false)
      setNewName("")
    }
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={MessageSquareQuoteIcon} label="Voices" />}
        end={<PanelReopenButton side="right" label="Show the voice" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    setDeleting(selected)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for voices"
        search={{
          name: "voice-search",
          label: "Search voices by name, words or account",
          placeholder: "Search voices",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        primary={
          <NewRecordDropdown
            label="New voice"
            open={creating}
            onOpenChange={setCreating}
            submitLabel="Create voice"
            busy={busy}
            onSubmit={() => void create()}
            trigger={
              <Button type="button" className="@max-3xl:size-8 @max-3xl:px-0" aria-label="New voice">
                <PlusIcon className="size-4" />
                <span className="@max-3xl:hidden">New voice</span>
              </Button>
            }
          >
            <div className="grid gap-2">
              <Label htmlFor="new-voice-name">Name</Label>
              <Input
                id="new-voice-name"
                autoFocus
                value={newName}
                placeholder="Main voice"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void create()
                  }
                }}
              />
            </div>
          </NewRecordDropdown>
        }
      />
      <CrmTable<Column>
        columns={[
          { key: "name", label: "Voice", column: "main", className: "min-w-40" },
          { key: "usedBy", label: "Used by", column: "preview", className: "hidden md:hidden @xl:table-cell" },
          { key: "changed", label: "Changed", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions={false}
        select={
          massSelect
            ? {
                noun: "voices",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : q
              ? "No voices match that search."
              : "No voices yet. A voice is how the AI sounds when it drafts. Make one with New voice."
        }
      >
        {rows.map((voice) => (
          <CrmTableRow
            key={voice.id}
            open={voice.id === openId}
            label={voice.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(voice.id), onToggle: () => selection.toggle(voice.id) }}
            onOpen={() => pick(voice.id)}
            onRightClick={(x, y) => setRightClick({ id: voice.id, x, y })}
          >
            <MainCell name={voice.name}>
              {voice.voice ? (
                <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">{voice.voice.split("\n")[0]}</span>
              ) : null}
            </MainCell>
            <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
              {voice.usedBy.length ? (
                <span className="block truncate">{voiceUsersList(voice.usedBy)}</span>
              ) : (
                <span className="text-muted-foreground">Nobody</span>
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatTimeAgo(voice.updatedAt)}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const voice = voices.find((each) => each.id === rightClick.id)
            return voice
              ? [{ label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting([voice]) }]
              : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: q,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Voice",
      showLabel: "Show the voice",
      content: openVoice ? (
        <VoiceRecord
          key={openVoice.id}
          voice={openVoice}
          onSaved={() => void router.invalidate()}
          onDelete={() => setDeleting([openVoice])}
        />
      ) : (
        <EmptyRecord
          title="Voice"
          icon={<MessageSquareQuoteIcon aria-hidden />}
          line={voices.length ? "Click a voice to see it here." : "Make a voice with New voice to see it here."}
          hideLabel="Hide the voice"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          shownDeleting && shownDeleting.length === 1 ? `Delete ${shownDeleting[0].name}?` : `Delete ${shownDeleting?.length ?? 0} voices?`
        }
        description={voiceDeleteWords((shownDeleting ?? []).flatMap((voice) => voice.usedBy))}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    ),
  })
}
