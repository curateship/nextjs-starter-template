import * as React from "react"
import { ArchiveIcon, CopyPlusIcon, ExternalLinkIcon, LinkIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnalysisCards } from "@/components/viral/analysis-cards"
import { CopyToProjectDialog, type CopyTarget } from "@/components/viral/copy-to-project-dialog"
import { CoverImage } from "@/components/viral/cover-image"
import { SavingTextarea } from "@/components/viral/saving-fields"
import { WritePostForPromoButton, YourPostRows } from "@/components/viral/promo-posts"
import { SendToVideoButton } from "@/components/viral/send-to-video"
import { SocialIcon } from "@/components/viral/social-icon"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { changeVaultItemsFn, updateVaultItemFn, type VaultItem } from "@/lib/api/viral/viral-vault"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ANALYSIS_NOTES_MAX } from "@/lib/viral/analysis"
import { creatorPlatformLabels, formatCount, formatDuration } from "@/lib/viral/creators"
import { outlierBadge } from "@/lib/viral/viral"
import {
  cleanTag,
  VAULT_STATUSES,
  VAULT_TAG_MAX,
  VAULT_TAGS_PER_ITEM_MAX,
  vaultStatusLabels,
  type VaultStatus,
} from "@/lib/viral/vault"

/**
 * One idea in the vault, as the right panel shows it (task parts 17 to 20
 * and 22): the kept copy of the video, its numbers when it was saved, the
 * status and tags, the notes, the analysis that was picked, and Send to
 * Video. The project page's vault and the Vault page both draw it, so a saved
 * idea looks the same wherever it is opened.
 *
 * The copy is Viral's own, so it still plays after the creator deletes the
 * original. Status, tags and notes each save as they change.
 */
export function VaultItemPanel({
  item,
  tags,
  onChanged,
  onDeleted,
}: {
  item: VaultItem
  /** Every tag this person has used, offered as they type. */
  tags: string[]
  onChanged: (item: VaultItem) => void
  onDeleted: (item: VaultItem) => void | Promise<void>
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [copying, setCopying] = React.useState<CopyTarget | null>(null)
  const platform = creatorPlatformLabels[item.platform]

  async function update(change: { notes?: string; status?: VaultStatus; tags?: string[] }) {
    try {
      onChanged(await updateVaultItemFn(item.id, change))
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const result = await changeVaultItemsFn([item.id], { kind: "delete" })
      if (result.skipped.length) {
        showErrorToast(result.skipped[0].reason)
        return
      }
      setDeleting(false)
      await onDeleted(item)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(item.sourceUrl)
    } catch {
      showErrorToast("The link could not be copied.")
    }
  }

  const badge = outlierBadge({ times: item.stats.outlier, typicalViews: null })

  return (
    <>
      <DashboardCardTitleHeader
        icon={<SocialIcon social={item.platform} />}
        title={
          <span className="grid leading-tight">
            <span className="truncate">{item.title}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {item.channelName ? `${platform} · ${item.channelName}` : platform}
            </span>
          </span>
        }
        action={
          <FoldingMenu label="More for this idea" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuAction
              icon={<ExternalLinkIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                window.open(item.sourceUrl, "_blank", "noopener,noreferrer")
              }}
            >
              Open on {platform}
            </MenuAction>
            <MenuAction
              icon={<LinkIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                void copyLink()
              }}
            >
              Copy link
            </MenuAction>
            <MenuAction
              icon={<CopyPlusIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                setCopying({ kind: "idea", itemId: item.id, title: item.title })
              }}
            >
              Copy to another project
            </MenuAction>
            <MenuLine />
            <MenuAction
              icon={<Trash2Icon className="size-4" />}
              destructive
              onClick={() => {
                setMenuOpen(false)
                setDeleting(true)
              }}
            >
              Delete from the vault
            </MenuAction>
          </FoldingMenu>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {item.playbackUrl ? (
            <video
              src={item.playbackUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] max-h-[60vh] w-full bg-black object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 border-b p-3">
              <CoverImage src={item.thumbnailUrl} className="max-h-[40vh] rounded-md object-contain" fallback={null} />
              <p className="text-center text-xs text-muted-foreground">
                The kept copy isn't in yet, so it plays on {platform} for now.
              </p>
            </div>
          )}

          {/* Everything under the player is a card, as on the project page (Tyler, 4 Nov 2026: "all these should be in cards"). */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <InspectorCard storageId="viral-vault-idea" title="Idea">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`vault-status-${item.id}`}>Status</Label>
              <Select value={item.status} onValueChange={(value) => void update({ status: value as VaultStatus })}>
                <SelectTrigger id={`vault-status-${item.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAULT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {vaultStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TagField id={`vault-tags-${item.id}`} value={item.tags} known={tags} onChange={(next) => update({ tags: next })} />
            <div className="grid gap-2">
              <Label htmlFor={`vault-notes-${item.id}`}>Notes</Label>
              <SavingTextarea
                id={`vault-notes-${item.id}`}
                rows={2}
                maxLength={ANALYSIS_NOTES_MAX}
                value={item.notes}
                placeholder="What to keep, what to change, how you'd film it"
                onSave={(notes) => update({ notes })}
              />
            </div>
          </div>
          </InspectorCard>

          <InspectorCard storageId="viral-vault-numbers" title="Numbers">
            <dl className="grid gap-2 text-sm">
              <Detail label="Views" value={formatCount(item.stats.views)} />
              <Detail label="Likes" value={formatCount(item.stats.likes)} />
              <Detail label="Comments" value={formatCount(item.stats.comments)} />
              <Detail label="Outlier" value={badge ?? "-"} />
              <Detail label="Score" value={item.stats.score === null ? "-" : String(item.stats.score)} />
              <Detail label="Length" value={formatDuration(item.stats.durationSeconds) || "-"} />
              {/* Your own posts of it, as Promo reported them (features task part 21). */}
              <YourPostRows itemId={item.id} refreshKey={item.status} />
            </dl>
          </InspectorCard>

          {item.analysis ? (
            <AnalysisCards pieces={item.analysis} topic={item.analysisTopic ?? ""} sourceTitle={item.title} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArchiveIcon className="size-4" />
              Saved before any analysis. Open it in its project and press Analyse with AI, then save it again.
            </p>
          )}
          </div>
        </div>
      </ScrollArea>
      {/* The sticky footer, as on the project page (Tyler, 4 Nov 2026: "this should be in the sticky footer"). */}
      <div className="@container flex shrink-0 gap-2 border-t p-3">
        <div className="min-w-0 flex-1">
          <SendToVideoButton item={item} projectId={item.projectId} onChanged={onChanged} className="w-full" compact />
        </div>
        <div className="min-w-0 flex-1">
          <WritePostForPromoButton itemId={item.id} className="w-full" />
        </div>
      </div>
      <CopyToProjectDialog target={copying} currentProjectId={item.projectId} onClose={() => setCopying(null)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this idea from the vault?"
        description={`"${item.title}" leaves the vault with its kept copy, its notes and its tags. The original stays on ${platform}.`}
        confirmLabel="Delete idea"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}

/**
 * Free tags typed on an idea, kept per account (Tyler, 4 Nov 2026: "Status
 * and tags"). Tags already used anywhere are offered as you type; each
 * change saves at once.
 */
export function TagField({
  id,
  value,
  known,
  onChange,
}: {
  id: string
  value: string[]
  known: string[]
  onChange: (next: string[]) => Promise<boolean>
}) {
  const [text, setText] = React.useState("")
  const listId = `${id}-known`

  async function add(raw: string) {
    const tag = cleanTag(raw)
    if (!tag) return
    if (value.some((one) => one.toLowerCase() === tag.toLowerCase())) {
      setText("")
      return
    }
    if (value.length >= VAULT_TAGS_PER_ITEM_MAX) {
      showErrorToast(`An idea can have at most ${VAULT_TAGS_PER_ITEM_MAX} tags.`)
      return
    }
    if (await onChange([...value, tag])) setText("")
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Tags</Label>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {value.map((tag) => (
            <li key={tag} className="flex h-7 items-center gap-1 rounded-md border bg-muted/40 pl-2 text-sm">
              {tag}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${tag}`}
                onClick={() => void onChange(value.filter((one) => one !== tag))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          list={listId}
          value={text}
          maxLength={VAULT_TAG_MAX}
          placeholder="hooks, Q1"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              void add(text)
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void add(text)}>
          <PlusIcon />
          Add
        </Button>
      </div>
      <datalist id={listId}>
        {known
          .filter((tag) => !value.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
