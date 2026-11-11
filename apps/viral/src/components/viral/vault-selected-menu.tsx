import * as React from "react"
import { CircleDotIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react"

import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { changeVaultItemsFn, type VaultBulkChange, type VaultBulkResult } from "@/lib/api/viral/viral-vault"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cleanTag, VAULT_STATUSES, VAULT_TAG_MAX, vaultStatusLabels } from "@/lib/viral/vault"
import { describeVaultBulk } from "@/lib/viral/vault-bulk"

/**
 * The "N selected" button on a vault list (task part 20): Set status first,
 * then Add a tag, then Delete, each one request for every ticked idea.
 * Delete asks first, because it takes the kept copy of each video with it.
 */
export function VaultSelectedMenu({
  ids,
  tags,
  onClear,
  onDone,
}: {
  ids: string[]
  /** Every tag this person has used, offered first on the Add a tag page. */
  tags: string[]
  onClear: () => void
  /** After a change that went through, so the list reads itself again. */
  onDone: (change: VaultBulkChange, result: VaultBulkResult) => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [newTag, setNewTag] = React.useState("")

  async function change(next: VaultBulkChange, verb: string) {
    setBusy(true)
    try {
      const result = await changeVaultItemsFn(ids, next)
      const message = describeVaultBulk(result, verb)
      if (result.skipped.length) showErrorToast(message)
      await onDone(next, result)
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  function addTag(name: string, close: () => void) {
    const tag = cleanTag(name)
    if (!tag) {
      showErrorToast("Type the tag's name first.")
      return
    }
    close()
    setNewTag("")
    void change({ kind: "tag", name: tag }, `tagged "${tag}"`)
  }

  return (
    <>
      <SelectedMenu
        count={ids.length}
        busy={busy}
        onClear={onClear}
        main={(menu) => (
          <>
            <SelectedMenuRow page="status" onClick={() => menu.step("status")}>
              <CircleDotIcon className="size-4 text-muted-foreground" />
              Set status
            </SelectedMenuRow>
            <SelectedMenuRow page="tag" onClick={() => menu.step("tag")}>
              <TagIcon className="size-4 text-muted-foreground" />
              Add a tag
            </SelectedMenuRow>
            <SelectedMenuRow
              onClick={() => {
                menu.close()
                setDeleting(true)
              }}
            >
              <Trash2Icon className="size-4 text-muted-foreground" />
              Delete
            </SelectedMenuRow>
          </>
        )}
        pages={{
          status: {
            title: "Set status",
            content: (menu) =>
              VAULT_STATUSES.map((status) => (
                <SelectedMenuRow
                  key={status}
                  onClick={() => {
                    menu.close()
                    void change({ kind: "status", status }, `set to ${vaultStatusLabels[status]}`)
                  }}
                >
                  {vaultStatusLabels[status]}
                </SelectedMenuRow>
              )),
          },
          tag: {
            title: "Add a tag",
            content: (menu) => (
              <>
                <form
                  className="flex items-center gap-1 p-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    addTag(newTag, menu.close)
                  }}
                >
                  <Input
                    aria-label="New tag"
                    value={newTag}
                    maxLength={VAULT_TAG_MAX}
                    placeholder="New tag"
                    onChange={(event) => setNewTag(event.target.value)}
                  />
                  <button
                    type="submit"
                    aria-label="Add this tag"
                    className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:bg-accent"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </form>
                {tags.map((tag) => (
                  <SelectedMenuRow key={tag} onClick={() => addTag(tag, menu.close)}>
                    <TagIcon className="size-4 text-muted-foreground" />
                    <span className="truncate">{tag}</span>
                  </SelectedMenuRow>
                ))}
              </>
            ),
          },
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${ids.length} ${plural(ids.length, "idea", "ideas")} from the vault?`}
        description="Each one leaves the vault with its kept copy of the video, its notes and its tags. The originals stay where they were posted."
        confirmLabel={`Delete ${plural(ids.length, "idea", "ideas")}`}
        loading={busy}
        onConfirm={() =>
          void change({ kind: "delete" }, "deleted").then((done) => {
            if (done) setDeleting(false)
          })
        }
      />
    </>
  )
}
