import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, Trash2Icon } from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MAX_PUBLIC_SOCIAL_LINKS,
  MAX_PUBLIC_SOCIAL_URL_LENGTH,
  PUBLIC_SOCIAL_LINKS_FULL_MESSAGE,
  PUBLIC_SOCIAL_PLATFORM_LABELS,
  PUBLIC_SOCIAL_PLATFORMS,
  PUBLIC_SOCIAL_URL_MESSAGE,
  normalizePublicSocialUrl,
  type PublicSocialLink,
  type PublicSocialPlatform,
} from "@/lib/pages/public-social"
import { showErrorToast } from "@/lib/toast/error-toast"

const CHIP_CLASS =
  "w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"

/**
 * The social accounts in the public footer, edited the way the footer links
 * above them are: a wrapping row of chips, dragged into the order the footer
 * draws them in, each one opening a window for its two fields.
 */
export function PublicSocialEditor({
  links,
  onLinksChange,
  onSaveConfig,
}: {
  links: PublicSocialLink[]
  onLinksChange: (links: PublicSocialLink[]) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const sensors = useNavSensors()
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = React.useState<
    number | null
  >(null)
  const ids = links.map((_, index) => `public-footer-social-${index}`)
  const full = links.length >= MAX_PUBLIC_SOCIAL_LINKS
  const pendingDelete =
    pendingDeleteIndex === null ? null : (links[pendingDeleteIndex] ?? null)

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onLinksChange(arrayMove(links, from, to))
  }

  /**
   * Writes the accounts and waits for the settings save, so the window knows
   * whether it may close. A refused save puts the list back as it was: nothing
   * reached the server, so the row must not keep an account the reload would
   * not show, and pressing Done again must not add a second copy of it.
   */
  const saveLinks = async (next: PublicSocialLink[]) => {
    onLinksChange(next)
    const saved = await onSaveConfig()
    if (!saved) onLinksChange(links)
    return saved
  }

  return (
    <div className="grid gap-4">
      <DndContext
        id="custom-shell-public-footer-social"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap items-center gap-2">
            {links.map((link, index) => (
              <SocialChip
                key={ids[index]}
                id={ids[index]}
                link={link}
                dialogOpen={openIndex === index}
                onDialogOpenChange={(open) =>
                  setOpenIndex(open ? index : null)
                }
                onSave={(next) =>
                  saveLinks(
                    links.map((item, at) => (at === index ? next : item))
                  )
                }
                onDelete={() => setPendingDeleteIndex(index)}
              />
            ))}

            <DisabledReason
              disabled={full}
              reason={PUBLIC_SOCIAL_LINKS_FULL_MESSAGE}
            >
              <button
                type="button"
                disabled={full}
                onClick={() => setCreating(true)}
                className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Add a social account"
                title="Add account"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </DisabledReason>
          </div>
        </SortableContext>
      </DndContext>

      {creating ? (
        <SocialDialog
          link={null}
          onClose={() => setCreating(false)}
          onSave={async (next) => {
            const saved = await saveLinks([...links, next])
            if (saved) setCreating(false)
            return saved
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null)
        }}
        title="Delete this account?"
        description={
          pendingDelete
            ? `${PUBLIC_SOCIAL_PLATFORM_LABELS[pendingDelete.platform]} will come off the public footer.`
            : null
        }
        confirmLabel="Delete account"
        onConfirm={() => {
          if (pendingDeleteIndex === null) return
          onLinksChange(links.filter((_, at) => at !== pendingDeleteIndex))
          setPendingDeleteIndex(null)
        }}
      />
    </div>
  )
}

function SocialChip({
  id,
  link,
  dialogOpen,
  onDialogOpenChange,
  onSave,
  onDelete,
}: {
  id: string
  link: PublicSocialLink
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onSave: (link: PublicSocialLink) => Promise<boolean>
  onDelete: () => void
}) {
  const label = PUBLIC_SOCIAL_PLATFORM_LABELS[link.platform]
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          className="max-w-56 justify-start px-3 text-sm font-medium"
          onClick={() => onDialogOpenChange(true)}
          aria-label={`Edit settings for ${label}`}
        >
          <span className="truncate">{label}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      {dialogOpen ? (
        <SocialDialog
          link={link}
          onClose={() => onDialogOpenChange(false)}
          onSave={async (next) => {
            const saved = await onSave(next)
            if (saved) onDialogOpenChange(false)
            return saved
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * One social account, edited as a draft.
 *
 * The window holds its own copy until Done, the same as the link window, so
 * Escape and a click outside leave the saved accounts exactly as they were.
 * Done checks the address against the rule the save applies and stays open on
 * a problem, because the save drops an account with an address it will not
 * serve, and a window that closed on "Saved" and lost the account would be the
 * worse of the two.
 */
function SocialDialog({
  link,
  onClose,
  onSave,
}: {
  link: PublicSocialLink | null
  onClose: () => void
  onSave: (link: PublicSocialLink) => Promise<boolean>
}) {
  const id = React.useId()
  const [draft, setDraft] = React.useState<PublicSocialLink>(
    () => link ?? { platform: "twitter", url: "" }
  )
  const [attempted, setAttempted] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const urlInputRef = React.useRef<HTMLInputElement>(null)
  const url = draft.url.trim()
  const urlProblem = normalizePublicSocialUrl(url) !== url || !url
  const urlInvalid = attempted && urlProblem
  const dirty =
    draft.platform !== (link?.platform ?? "twitter") ||
    draft.url !== (link?.url ?? "")

  const save = async () => {
    setAttempted(true)
    if (urlProblem) {
      showErrorToast(PUBLIC_SOCIAL_URL_MESSAGE)
      urlInputRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      await onSave({ ...draft, url })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {PUBLIC_SOCIAL_PLATFORM_LABELS[draft.platform]}
            </DialogTitle>
            <DialogDescription>
              {link
                ? "Edit this social account."
                : "Add a social account to the public footer."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-platform`}>Platform</FieldLabel>
                  <Select
                    value={draft.platform}
                    disabled={saving}
                    onValueChange={(platform) =>
                      setDraft((current) => ({
                        ...current,
                        platform: platform as PublicSocialPlatform,
                      }))
                    }
                  >
                    <SelectTrigger id={`${id}-platform`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUBLIC_SOCIAL_PLATFORMS.map((platform) => (
                        <SelectItem key={platform} value={platform}>
                          {PUBLIC_SOCIAL_PLATFORM_LABELS[platform]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor={`${id}-url`}
                    hint="The full address of the account's page."
                  >
                    Address
                  </FieldLabel>
                  <Input
                    ref={urlInputRef}
                    id={`${id}-url`}
                    value={draft.url}
                    maxLength={MAX_PUBLIC_SOCIAL_URL_LENGTH}
                    placeholder="https://x.com/yourname"
                    disabled={saving}
                    aria-invalid={urlInvalid || undefined}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
