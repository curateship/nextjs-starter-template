import * as React from "react"
import { Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import { FieldError } from "@/components/video-assets/field-error"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getLinkImportErrorMessage,
  removeProjectLinkImport,
  retryProjectLinkImport,
  startLinkImport,
} from "@/lib/api/video/link-imports"
import type { MediaCollectionSummary } from "@/lib/api/video/media"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  LINK_IMPORT_NONE,
  LINK_IMPORT_PER_PASTE,
  LINK_IMPORT_PLATFORM_NAMES,
  LINK_IMPORT_TOO_MANY,
  splitPastedLinks,
  type LinkImportItem,
  type LinkImportStartResult,
} from "@/lib/video/link-imports"

/**
 * Import from a link in the Media panel (`workspace/docs/import-from-a-link.md`):
 * the window that takes the links, the tiles that stand in for them while
 * they download, and the hook that watches them.
 */

const NO_COLLECTION = "none"

/**
 * The Import from a link window. Every good line starts at once and the
 * window closes. When a line is refused, the window stays open with only the
 * refused lines in the box and each one's reason under it.
 */
export function LinkImportDialog({
  open,
  onOpenChange,
  projectId,
  collections,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  collections: MediaCollectionSummary[]
  onStarted: () => void
}) {
  const [text, setText] = React.useState("")
  const [collectionId, setCollectionId] = React.useState(NO_COLLECTION)
  const [refused, setRefused] = React.useState<LinkImportStartResult["skipped"]>([])
  const [boxError, setBoxError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setText("")
      setCollectionId(NO_COLLECTION)
      setRefused([])
      setBoxError(null)
    }
  }
  // A collection deleted in another tab while the window is open.
  if (collectionId !== NO_COLLECTION && !collections.some((item) => item.id === collectionId)) {
    setCollectionId(NO_COLLECTION)
  }

  async function submit() {
    if (busy) return
    const links = splitPastedLinks(text)
    const local = !links.length
      ? LINK_IMPORT_NONE
      : links.length > LINK_IMPORT_PER_PASTE
        ? LINK_IMPORT_TOO_MANY
        : null
    if (local) {
      setBoxError(local)
      showErrorToast(local)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const result = await startLinkImport(
        projectId,
        links.join("\n"),
        collectionId === NO_COLLECTION ? null : collectionId
      )
      if (result.started) onStarted()
      if (!result.skipped.length) {
        onOpenChange(false)
        return
      }
      setRefused(result.skipped)
      setText(result.skipped.map((line) => line.link).join("\n"))
      setBoxError(null)
    } catch (error) {
      const message = getLinkImportErrorMessage(error)
      setRefused([])
      setBoxError(message)
      showErrorToast(message)
    } finally {
      setBusy(false)
    }
  }

  const refusedText = refused.map((line) => line.link).join("\n")
  const describedBy = boxError || refused.length ? "link-import-error" : undefined

  return (
    <FormDialog
      open={open}
      // The refused lines left in the box are not work to lose.
      dirty={text.trim() !== "" && text !== refusedText}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import from a link</DialogTitle>
            <DialogDescription>
              TikTok, Instagram and YouTube videos up to 100MB. They download in
              the background and land in this project's media.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="link-import-links">One link per line</Label>
                  <Textarea
                    id="link-import-links"
                    autoFocus
                    rows={1}
                    className="max-h-60"
                    value={text}
                    placeholder="https://www.tiktok.com/@creator/video/…"
                    aria-invalid={boxError || refused.length ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => {
                      setText(event.target.value)
                      setBoxError(null)
                      setRefused([])
                    }}
                  />
                  <FieldError id="link-import-error" message={boxError} />
                  {refused.length ? (
                    <ul id="link-import-error" className="grid gap-1 text-sm text-destructive">
                      {refused.map((line) => (
                        <li key={line.link}>
                          <span className="block break-all text-foreground">{line.link}</span>
                          {line.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {collections.length ? (
                  <div className="grid gap-2">
                    <Label htmlFor="link-import-collection">Collection</Label>
                    <Select value={collectionId} onValueChange={setCollectionId}>
                      <SelectTrigger id="link-import-collection">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_COLLECTION}>None</SelectItem>
                        {collections.map((collection) => (
                          <SelectItem key={collection.id} value={collection.id}>
                            {collection.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
              {refused.length ? "Close" : "Cancel"}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The tile an import shows while it waits or downloads, and the red one it
 * leaves when it fails, with Try again and Remove on its right-click. It
 * cannot be dragged: there is no file yet.
 */
export function LinkImportTile({
  item,
  onChanged,
}: {
  item: LinkImportItem
  onChanged: () => void
}) {
  const [working, setWorking] = React.useState(false)
  const failed = item.status === "failed"
  const platform = LINK_IMPORT_PLATFORM_NAMES[item.platform]

  async function act(action: (id: string) => Promise<unknown>) {
    setWorking(true)
    try {
      await action(item.id)
      onChanged()
    } catch (error) {
      showErrorToast(getLinkImportErrorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const tile = (
    <div
      role="status"
      aria-label={failed ? `${platform} import failed: ${item.error ?? ""}` : `Downloading from ${platform}`}
      style={{
        position: "relative",
        breakInside: "avoid",
        marginBottom: 12,
        aspectRatio: "9 / 16",
        borderRadius: 11,
        overflow: "hidden",
        border: failed ? "1px solid var(--destructive)" : "1px solid var(--line)",
        background: "var(--panel2)",
        display: "grid",
        placeItems: "center",
        padding: 10,
        textAlign: "center",
      }}
    >
      <div className="grid justify-items-center gap-1.5">
        {failed ? null : <Loader2Icon className="size-5 animate-spin text-muted-foreground" />}
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {failed ? `${platform} import failed` : `Downloading from ${platform}`}
        </div>
        {item.title ? (
          <div className="line-clamp-2" style={{ fontSize: 11, color: "var(--mut)" }}>
            {item.title}
          </div>
        ) : null}
        {failed ? (
          <div className="line-clamp-4 text-destructive" style={{ fontSize: 11 }}>
            {item.error}
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{tile}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={CONTEXT_MENU_CONTENT_CLASS}>
          {failed ? (
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_ITEM_CLASS}
              disabled={working}
              onSelect={() => void act(retryProjectLinkImport)}
            >
              <RotateCcwIcon />
              Try again
            </ContextMenuPrimitive.Item>
          ) : null}
          <ContextMenuPrimitive.Item
            className={CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS}
            disabled={working}
            onSelect={() => void act(removeProjectLinkImport)}
          >
            <Trash2Icon />
            Remove
          </ContextMenuPrimitive.Item>
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}
