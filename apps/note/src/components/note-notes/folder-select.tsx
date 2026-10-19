import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { NoteFolder } from "@/lib/note/notes/notes"
import { folderRows } from "@/lib/note/notes/tree"

const NO_FOLDER_VALUE = "__loose__"

/**
 * Picks one of the person's note folders, drawn as the tree it is, with
 * "No folder" first for a loose note.
 */
export function FolderSelect({
  id,
  folders,
  value,
  onChange,
  exceptIds,
  noneLabel = "No folder",
}: {
  id: string
  folders: NoteFolder[]
  /** A folder's id, or null for no folder. */
  value: string | null
  onChange: (folderId: string | null) => void
  /** Folders that cannot be picked, such as a folder's own children. */
  exceptIds?: ReadonlySet<string>
  /** What the "no folder" choice is called here. */
  noneLabel?: string
}) {
  return (
    <Select value={value ?? NO_FOLDER_VALUE} onValueChange={(next) => onChange(next === NO_FOLDER_VALUE ? null : next)}>
      <SelectTrigger id={id} className="w-full sm:w-fit sm:min-w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_FOLDER_VALUE}>{noneLabel}</SelectItem>
        {folderRows(folders)
          .filter((row) => !exceptIds?.has(row.folder.id))
          .map((row) => (
            <SelectItem key={row.folder.id} value={row.folder.id}>
              <span style={{ paddingLeft: `${row.depth * 12}px` }}>{row.folder.name}</span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
