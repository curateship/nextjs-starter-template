import * as React from "react"
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SavingInput, SavingTextarea } from "@/components/viral/saving-fields"
import { TagField } from "@/components/viral/vault-item-panel"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { createOwnHookFn, deleteOwnHookFn, updateOwnHookFn, type OwnLibraryHook } from "@/lib/api/viral/viral-library"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { hookTypeLabel, type HookTypeChoice } from "@/lib/viral/hook-types"
import { cleanHookLink, OWN_HOOK_LINK_MAX, OWN_HOOK_WORDS_MAX } from "@/lib/viral/library"

const NO_TYPE = "none"

/**
 * Your own hook on Library → Hooks (`workspace/docs/library.md`,
 * more-features task part 8). Tyler, 6 Nov 2026: "Words, link, tags".
 */

/** The type picker: the fixed types, then your own, then nothing. Leaving it on No type lets the labelling pass name it. */
export function HookTypeSelect({
  id,
  value,
  choices,
  onChange,
}: {
  id: string
  value: string | null
  choices: HookTypeChoice[]
  onChange: (typeId: string | null) => void
}) {
  // A type deleted meanwhile still shows its id rather than a blank box; picking another replaces it.
  return (
    <Select value={value ?? NO_TYPE} onValueChange={(next) => onChange(next === NO_TYPE ? null : next)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TYPE}>No type</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.id} value={choice.id}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * "+ New hook", last in the Hooks tab's header: the usual New dropdown,
 * holding the words first, then the link and the type, then the tags. A hook
 * is one line, so Enter in the words makes it. The typed values stay when it
 * is clicked away, and clear once the hook is made.
 */
export function NewHookDropdown({
  choices,
  tags,
  onCreated,
}: {
  choices: HookTypeChoice[]
  /** Every tag this person has used, offered as they type. */
  tags: string[]
  onCreated: (hook: OwnLibraryHook) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [words, setWords] = React.useState("")
  const [link, setLink] = React.useState("")
  const [typeId, setTypeId] = React.useState<string | null>(null)
  const [draftTags, setDraftTags] = React.useState<string[]>([])
  const [badLink, setBadLink] = React.useState(false)

  async function create() {
    if (!words.trim()) {
      showErrorToast("Type the hook's words first.")
      return
    }
    if (link.trim() && !cleanHookLink(link)) {
      setBadLink(true)
      showErrorToast("The link has to start with http:// or https://.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const hook = await createOwnHookFn({ words, link, typeId, tags: draftTags })
      setWords("")
      setLink("")
      setTypeId(null)
      setDraftTags([])
      setBadLink(false)
      setOpen(false)
      toast.success("Hook added to the Library.")
      onCreated(hook)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New hook"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create hook"
      busy={busy}
      onSubmit={() => void create()}
      trigger={
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New hook">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New hook</span>
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-hook-words">The hook</Label>
        <Input
          id="new-hook-words"
          autoFocus
          value={words}
          maxLength={OWN_HOOK_WORDS_MAX}
          placeholder="Nobody tells you this about meal prep"
          onChange={(event) => setWords(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-hook-link">Where you heard it</Label>
        <Input
          id="new-hook-link"
          type="url"
          value={link}
          maxLength={OWN_HOOK_LINK_MAX}
          aria-invalid={badLink || undefined}
          placeholder="https://"
          onChange={(event) => {
            setLink(event.target.value)
            setBadLink(false)
          }}
          onBlur={() => setBadLink(Boolean(link.trim()) && !cleanHookLink(link))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-hook-type">Type</Label>
        <HookTypeSelect id="new-hook-type" value={typeId} choices={choices} onChange={setTypeId} />
      </div>
      <TagField
        id="new-hook-tags"
        value={draftTags}
        known={tags}
        onChange={async (next) => {
          setDraftTags(next)
          return true
        }}
      />
    </NewRecordDropdown>
  )
}

/**
 * Your own hook's ⋮: its words, link and type, each saving as it changes,
 * then Copy, then Delete in red. Deleting asks first, because the hooks
 * written from it go too and there is no bin.
 */
export function OwnHookMenu({
  hook,
  choices,
  onCopy,
  onChanged,
  onDeleted,
}: {
  hook: OwnLibraryHook
  choices: HookTypeChoice[]
  onCopy: () => void
  onChanged: (hook: OwnLibraryHook) => void
  onDeleted: (hook: OwnLibraryHook) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [sections, toggle] = useOpenSections<"words" | "link" | "type">()
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function save(change: { words?: string; link?: string; typeId?: string | null }) {
    dismissErrorToast()
    try {
      onChanged(await updateOwnHookFn(hook.id, change))
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteOwnHookFn(hook.id)
      setDeleting(false)
      toast.success("The hook is deleted, with the hooks written from it.")
      onDeleted(hook)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <FoldingMenu label="More for this hook" align="end" open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuSection label="Words" value={hook.text} open={sections.has("words")} onToggle={() => toggle("words")}>
          <Label htmlFor={`own-hook-words-${hook.id}`} className="sr-only">
            Words
          </Label>
          <SavingTextarea
            id={`own-hook-words-${hook.id}`}
            rows={1}
            value={hook.text}
            maxLength={OWN_HOOK_WORDS_MAX}
            onSave={(words) => save({ words })}
          />
        </MenuSection>
        <MenuSection label="Link" value={hook.link ? "Set" : "None"} open={sections.has("link")} onToggle={() => toggle("link")}>
          <Label htmlFor={`own-hook-link-${hook.id}`} className="sr-only">
            Link
          </Label>
          <SavingInput
            id={`own-hook-link-${hook.id}`}
            type="url"
            value={hook.link ?? ""}
            maxLength={OWN_HOOK_LINK_MAX}
            placeholder="https://"
            onSave={(link) => save({ link })}
          />
        </MenuSection>
        <MenuSection
          label="Type"
          value={hookTypeLabel(hook.typeId, choices) ?? "None"}
          open={sections.has("type")}
          onToggle={() => toggle("type")}
        >
          <Label htmlFor={`own-hook-type-${hook.id}`} className="sr-only">
            Type
          </Label>
          <HookTypeSelect
            id={`own-hook-type-${hook.id}`}
            value={hook.typeId}
            choices={choices}
            onChange={(typeId) => void save({ typeId })}
          />
        </MenuSection>
        <MenuLine />
        <MenuAction
          icon={<CopyIcon className="size-4" />}
          onClick={() => {
            setMenuOpen(false)
            onCopy()
          }}
        >
          Copy the hook
        </MenuAction>
        <MenuAction
          icon={<Trash2Icon className="size-4" />}
          destructive
          onClick={() => {
            setMenuOpen(false)
            setDeleting(true)
          }}
        >
          Delete hook
        </MenuAction>
      </FoldingMenu>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this hook?"
        description={`"${hook.text}" goes, with its tags and every hook written from it.`}
        confirmLabel="Delete hook"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
