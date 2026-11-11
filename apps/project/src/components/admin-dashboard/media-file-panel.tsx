import * as React from "react"
import {
  FileQuestionIcon,
  ImageIcon,
  InfoIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react"

import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { OrphanPreview } from "@/components/media/media-orphan-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type { AdminMediaItem, MediaOrphan } from "@/lib/api/media/admin-media"
import { getMediaErrorMessage, updateMedia } from "@/lib/api/media/media"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { problemLabel } from "@/lib/media/media-orphans"
import { showErrorToast } from "@/lib/toast/error-toast"

const HIDE_FILE = "Hide the file"
const HIDE_ORPHAN = "Hide the orphan"

/**
 * The Media library's right panel: the file open (Tyler, 8 Nov 2026: a file
 * opens "on the right, like a person in Users"; the file window went). In
 * the CRM's one record frame, as the person is:
 *
 * - **Header:** the file's kind, its name and its owner, then the ⋮.
 * - **The ⋮** (`TabbedMenu`): Alt text, or Description for a video, saving
 *   when the box is left, on your own files only, since it is saved through
 *   the owner's own endpoint. Then Delete in red, which asks first. A logo
 *   already sent in email cannot be deleted, and says why.
 * - **Body:** the picture or video, then its details.
 */
export function MediaFilePanel({
  item,
  reading,
  editable,
  onDelete,
  onSaved,
}: {
  item: AdminMediaItem | null
  /** A file opened by a link is being read on its own. */
  reading: boolean
  editable: boolean
  onDelete: (item: AdminMediaItem) => void
  onSaved: () => Promise<void>
}) {
  if (!item) {
    return reading ? (
      // Nothing while it is read, never a loading circle.
      <EmptyRecord title="File" icon={null} line="" loading hideLabel={HIDE_FILE} />
    ) : (
      <EmptyRecord
        title="File"
        icon={<SquareMousePointerIcon aria-hidden />}
        line="Click a file to see it here."
        hideLabel={HIDE_FILE}
      />
    )
  }
  const textLabel = item.file_type === "video" ? "Description" : "Alt text"
  return (
    <RecordFrame
      avatar={item.file_type === "video" ? <VideoIcon /> : <ImageIcon />}
      title={item.original_name}
      line={item.owner_name}
      hideLabel={HIDE_FILE}
      actions={<FileMenu item={item} textLabel={textLabel} editable={editable} onDelete={onDelete} onSaved={onSaved} />}
      body={
        <>
          {item.file_type === "video" ? (
            // Opened on purpose, so it plays with sound and seeks over range
            // requests rather than downloading in full.
            <video
              src={item.url}
              className="max-h-80 w-full rounded-lg bg-muted object-contain"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={item.url}
              alt={item.alt_text ?? item.original_name}
              className="max-h-80 w-full rounded-lg bg-muted object-contain"
            />
          )}
          <PanelCard icon={<InfoIcon />} storageId="admin-media-file" title="Details">
            <div className="grid gap-2">
              <DetailRow label="Owner" value={item.owner_name} />
              <DetailRow label="Owner's email" value={item.owner_email} />
              <DetailRow label="Type" value={item.mime_type} />
              <DetailRow label="Size" value={formatFileSize(item.file_size)} />
              <DetailRow label="Added" value={formatDate(item.created_at)} />
              <DetailRow label={textLabel} value={item.alt_text || "None"} />
              <DetailRow label="Stored at" value={item.storage_path} wrap />
            </div>
          </PanelCard>
          {item.email_protected_at ? (
            <p className="text-sm text-muted-foreground">
              This logo is kept because it appears in email already sent. Removing it would break those inbox copies.
            </p>
          ) : null}
        </>
      }
    />
  )
}

function FileMenu({
  item,
  textLabel,
  editable,
  onDelete,
  onSaved,
}: {
  item: AdminMediaItem
  textLabel: string
  editable: boolean
  onDelete: (item: AdminMediaItem) => void
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const kept = Boolean(item.email_protected_at)
  return (
    <TabbedMenu
      label="File menu"
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-4 p-3">
              <PickGroup
                title="File"
                after={
                  editable ? null : (
                    <p className="px-0.5 text-xs text-muted-foreground">
                      Only the person who uploaded a file can change its {textLabel.toLowerCase()}.
                    </p>
                  )
                }
              >
                {editable ? (
                  <PickRow label={textLabel} value={item.alt_text || "None"} empty={!item.alt_text}>
                    <TextBox
                      label={textLabel}
                      saved={item.alt_text ?? ""}
                      onSave={async (text) => {
                        try {
                          await updateMedia(item.id, text)
                          await onSaved()
                        } catch (error) {
                          showErrorToast(getMediaErrorMessage(error))
                        }
                      }}
                    />
                  </PickRow>
                ) : (
                  <PickRow label={textLabel} value={item.alt_text || "None"} empty={!item.alt_text} disabled>
                    {null}
                  </PickRow>
                )}
              </PickGroup>
              <div className="grid gap-1 border-t pt-3">
                <MenuActionRow
                  icon={<Trash2Icon />}
                  destructive
                  disabled={kept}
                  onClick={() => {
                    setOpen(false)
                    onDelete(item)
                  }}
                >
                  Delete file
                </MenuActionRow>
                {kept ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    This logo appears in email already sent, so it must stay.
                  </p>
                ) : null}
              </div>
            </div>
          ),
        },
      ]}
    />
  )
}

/** The alt text or description, saved when the box is left or Enter is pressed. */
function TextBox({ label, saved, onSave }: { label: string; saved: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = React.useState(saved)
  const commit = () => {
    if (text.trim() === saved) return
    void onSave(text.trim())
  }
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor="admin-media-alt-text">{label}</FieldLabel>
      <Input
        id="admin-media-alt-text"
        value={text}
        placeholder="Optional"
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}

/**
 * An orphan on the right: a file in storage that nothing points at, or a
 * record whose file has gone. There is nothing to change on one, so its ⋮
 * holds Delete alone.
 */
export function OrphanPanel({
  orphan,
  scanning,
  onDelete,
}: {
  orphan: MediaOrphan | null
  scanning: boolean
  onDelete: (orphan: MediaOrphan) => void
}) {
  if (!orphan) {
    return scanning ? (
      <EmptyRecord title="Orphan" icon={null} line="" loading hideLabel={HIDE_ORPHAN} />
    ) : (
      <EmptyRecord
        title="Orphan"
        icon={<FileQuestionIcon aria-hidden />}
        line="Nothing orphaned to show."
        hideLabel={HIDE_ORPHAN}
      />
    )
  }
  return (
    <RecordFrame
      avatar={<FileQuestionIcon />}
      title={orphan.name}
      line={problemLabel(orphan.kind)}
      hideLabel={HIDE_ORPHAN}
      actions={<OrphanMenu orphan={orphan} onDelete={onDelete} />}
      body={
        <>
          <OrphanPreview row={orphan} className="h-56 w-full rounded-lg border bg-muted" />
          <p className="text-sm text-muted-foreground">
            {orphan.kind === "unlinked_object"
              ? "This file sits in storage but nothing in the database points at it, so it is costing money for nothing."
              : "The database still lists this file, but it is no longer in storage."}
          </p>
          <PanelCard icon={<InfoIcon />} storageId="admin-media-orphan" title="Details">
            <div className="grid gap-2">
              <DetailRow label="Problem" value={problemLabel(orphan.kind)} />
              <DetailRow label="Size" value={formatFileSize(orphan.bytes)} />
              <DetailRow label="Uploaded by" value={orphan.ownerName ?? "Unknown"} />
              <DetailRow label="Uploaded" value={orphan.createdAt ? formatDate(orphan.createdAt) : "Not known"} />
              <DetailRow label="Stored at" value={orphan.storagePath} wrap />
            </div>
          </PanelCard>
        </>
      }
    />
  )
}

function OrphanMenu({ orphan, onDelete }: { orphan: MediaOrphan; onDelete: (orphan: MediaOrphan) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <TabbedMenu
      label="Orphan menu"
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-1 p-3">
              <MenuActionRow
                icon={<Trash2Icon />}
                destructive
                onClick={() => {
                  setOpen(false)
                  onDelete(orphan)
                }}
              >
                Delete orphan
              </MenuActionRow>
            </div>
          ),
        },
      ]}
    />
  )
}

/**
 * A name and its value, as the person panel draws them. A storage key wraps,
 * because it is only useful read in full.
 */
function DetailRow({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={
          wrap
            ? "min-w-0 max-w-full text-right text-sm font-medium break-all"
            : "ml-auto min-w-0 max-w-full truncate text-right text-sm font-medium"
        }
      >
        {value}
      </span>
    </div>
  )
}
