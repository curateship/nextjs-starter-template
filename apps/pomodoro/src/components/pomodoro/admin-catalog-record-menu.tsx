import * as React from "react"
import { Trash2Icon, UploadIcon } from "lucide-react"

import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { PickGroup, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { TagsField } from "@/components/pomodoro/tags-field"
import {
  getCatalogAdminErrorMessage,
  loadCatalogItem,
  saveCatalogItem,
  type AdminCatalogItem,
  type AdminCatalogRow,
} from "@/lib/api/pomodoro/admin-catalog"
import { CATALOG_DESCRIPTORS, CATALOG_LICENCES, DESCRIPTOR_LABELS, type CatalogKind } from "@/lib/pomodoro/admin-catalog"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The open background's or sound's ⋮ on the right, the Admin 3 panel
 * design's record menu (Tyler, 15 Nov 2026: "the details edit and the credit
 * should be moved into the 3 dotted settings", then "this is not following
 * ui standard"). One General tab, 20.4rem wide:
 *
 * - **Details:** Name, Hint, Tags, Kind, Free or Pro, Status.
 * - **Credits:** Artist, Source link, Licence, Licence note.
 * - **Under the groups:** Replace file, which opens the item's window on its
 *   Files card, then Delete in red under a line.
 *
 * Every row saves itself. The item is read in full when the menu opens, and
 * each change is saved over that copy, the file left as it is.
 */
export function CatalogRecordMenu({
  kind,
  row,
  knownTags,
  onSaved,
  onReplaceFile,
  onDelete,
}: {
  kind: CatalogKind
  row: AdminCatalogRow
  knownTags: string[]
  /** Reads the list again after a save. */
  onSaved: () => Promise<void> | void
  onReplaceFile: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [item, setItem] = React.useState<AdminCatalogItem | null>(null)
  // The copy each save starts from, so two quick changes never undo each other.
  const latest = React.useRef<AdminCatalogItem | null>(null)

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadCatalogItem(row.id).then(
      (loaded) => {
        if (!live) return
        latest.current = loaded
        setItem(loaded)
      },
      (error) => {
        if (live) showErrorToast(getCatalogAdminErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [open, row.id])

  const save = async (patch: Partial<AdminCatalogItem>) => {
    const before = latest.current
    if (!before) return
    const next = { ...before, ...patch }
    latest.current = next
    setItem(next)
    try {
      await saveCatalogItem({
        id: next.id,
        kind,
        label: next.label,
        hint: next.hint,
        descriptor: next.descriptor,
        locked: next.locked,
        status: next.status,
        tags: next.tags,
        volume: next.volume,
        artist: next.artist,
        sourceUrl: next.sourceUrl,
        licence: next.licence,
        licenceNote: next.licenceNote,
        source: null,
      })
      await onSaved()
    } catch (error) {
      latest.current = before
      setItem(before)
      showErrorToast(getCatalogAdminErrorMessage(error))
    }
  }

  const close = (then: () => void) => () => {
    setOpen(false)
    then()
  }

  const content = item ? (
    <div className="grid gap-4 p-3">
      <PickGroup title="Details">
        <TextPickRow label="Name" value={item.label} onCommit={(label) => (label ? void save({ label }) : undefined)} />
        <TextPickRow label="Hint" value={item.hint} onCommit={(hint) => void save({ hint })} />
        <TagsRow tags={item.tags} knownTags={knownTags} onCommit={(tags) => void save({ tags })} />
        <PickMenuRow
          label="Kind"
          value={DESCRIPTOR_LABELS[item.descriptor] ?? item.descriptor}
          options={CATALOG_DESCRIPTORS[kind].map((value) => ({ value, label: DESCRIPTOR_LABELS[value] }))}
          selected={item.descriptor}
          onPick={(descriptor) => void save({ descriptor })}
        />
        <PickMenuRow
          label="Free or Pro"
          value={item.locked ? "Pro" : "Free"}
          options={[
            { value: "free", label: "Free" },
            { value: "pro", label: "Pro" },
          ]}
          selected={item.locked ? "pro" : "free"}
          onPick={(value) => void save({ locked: value === "pro" })}
        />
        <PickMenuRow
          label="Status"
          value={item.status === "live" ? "Live" : "Draft"}
          options={[
            { value: "draft", label: "Draft" },
            { value: "live", label: "Live" },
          ]}
          selected={item.status}
          onPick={(value) => void save({ status: value === "live" ? "live" : "draft" })}
        />
      </PickGroup>

      <PickGroup title="Credits">
        <TextPickRow label="Artist" value={item.artist ?? ""} onCommit={(artist) => void save({ artist: artist || null })} />
        <TextPickRow
          label="Source link"
          value={item.sourceUrl ?? ""}
          placeholder="https://"
          inputMode="url"
          onCommit={(sourceUrl) => void save({ sourceUrl: sourceUrl || null })}
        />
        <PickMenuRow
          label="Licence"
          value={item.licence ? (CATALOG_LICENCES.find((licence) => licence.value === item.licence)?.label ?? item.licence) : "None"}
          empty={!item.licence}
          options={[{ value: "none", label: "Not set" }, ...CATALOG_LICENCES.map(({ value, label }) => ({ value, label }))]}
          selected={item.licence ?? "none"}
          onPick={(value) => void save({ licence: value === "none" ? null : value })}
        />
        <TextPickRow
          label="Licence note"
          value={item.licenceNote ?? ""}
          multiline
          onCommit={(licenceNote) => void save({ licenceNote: licenceNote || null })}
        />
      </PickGroup>

      <div className="grid">
        <ActionRow icon={<UploadIcon className="size-4" />} onClick={close(onReplaceFile)}>
          Replace file
        </ActionRow>
        <div className="-mx-3 my-1 border-t" />
        <ActionRow icon={<Trash2Icon className="size-4" />} destructive onClick={close(onDelete)}>
          Delete {kind === "sound" ? "sound" : "background"}
        </ActionRow>
      </div>
    </div>
  ) : (
    <p className="p-3 text-sm text-muted-foreground">Reading…</p>
  )

  return (
    <TabbedMenu
      label={kind === "sound" ? "Sound menu" : "Background menu"}
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[{ value: "general", label: "General", content }]}
    />
  )
}

/** The tags: the row lists them; its box is the same tag field the window has, saved as focus leaves it. */
function TagsRow({ tags, knownTags, onCommit }: { tags: string[]; knownTags: string[]; onCommit: (tags: string[]) => void }) {
  const id = React.useId()
  const [text, setText] = React.useState(tags.join(", "))
  const commit = () => {
    const next = text
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (next.join(",") !== tags.join(",")) onCommit(next)
  }
  return (
    <PickRow label="Tags" value={tags.length ? tags.join(", ") : "None"} empty={!tags.length}>
      <div
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit()
        }}
      >
        <TagsField id={id} value={text} onChange={setText} knownTags={knownTags} />
      </div>
    </PickRow>
  )
}
