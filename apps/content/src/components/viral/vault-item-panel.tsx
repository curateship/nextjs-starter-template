import * as React from "react"
import {
  ArchiveIcon,
  CopyPlusIcon,
  HardDriveDownloadIcon,
  ExternalLinkIcon,
  LightbulbIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { RecordFrame } from "@/components/crm/record-frame"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { RecordMenu, type MenuAction } from "@/components/viral/dashboard/section-parts"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisCards } from "@/components/viral/analysis-cards"
import { CopyToProjectDialog, type CopyTarget } from "@/components/viral/copy-to-project-dialog"
import { CoverImage } from "@/components/viral/cover-image"
import { SavingDocument } from "@/components/viral/saving-document"
import { SavingTextarea } from "@/components/viral/saving-fields"
import { WritePostForPromoButton, YourPostRows } from "@/components/viral/promo-posts"
import { SendToVideoButton } from "@/components/viral/send-to-video"
import { SocialIcon } from "@/components/viral/social-icon"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  changeVaultItemsFn,
  loadVaultWritingPrices,
  saveEditedScriptFn,
  updateVaultItemFn,
  writeOwnIdeaScriptFn,
  type VaultItem,
} from "@/lib/api/viral/viral-vault"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { ANALYSIS_NOTES_MAX } from "@/lib/viral/analysis"
import { formatCount, formatDuration } from "@/lib/viral/creators"
import { isTextSocial } from "@/lib/viral/socials"
import { figureName } from "@/lib/viral/text-posts"
import { downloadToComputer } from "@/lib/viral/download"
import { outlierBadge } from "@/lib/viral/viral"
import {
  cleanTag,
  VAULT_STATUSES,
  VAULT_TAG_MAX,
  VAULT_TAGS_PER_ITEM_MAX,
  vaultSourceLabel,
  vaultStatusLabels,
  type VaultStatus,
} from "@/lib/viral/vault"
import { writerPriceWords, type WriterPrice } from "@/lib/viral/writers"

/**
 * One idea in the vault, as the right panel shows it (task parts 17 to 20
 * and 22): the kept copy of the video, its numbers when it was saved, the
 * status and tags, the notes, the analysis that was picked, and Send to
 * Video. The project page's vault and the Vault page both draw it, so a saved
 * idea looks the same wherever it is opened.
 *
 * The copy is Viral's own, so it still plays after the creator deletes the
 * original. Status, tags and notes each save as they change.
 *
 * An idea with no video (more-features task part 1), a saved post or one you
 * typed, has no player, and its cards start with Idea. A post adds The post,
 * with its words and link, and its numbers in its network's own words. Your
 * own idea's notes are written in the shell's editor, and its script comes
 * from Write a script.
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
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [copying, setCopying] = React.useState<CopyTarget | null>(null)
  const platform = vaultSourceLabel(item)
  const sourceUrl = item.sourceUrl

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

  async function saveScript(words: string[] | null) {
    try {
      onChanged(await saveEditedScriptFn(item.id, words))
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  async function copyLink() {
    if (!sourceUrl) return
    try {
      await navigator.clipboard.writeText(sourceUrl)
    } catch {
      showErrorToast("The link could not be copied.")
    }
  }

  const badge = outlierBadge({ times: item.stats.outlier, typicalViews: null })
  const postFigures =
    item.kind === "post" && isTextSocial(item.platform)
      ? (["views", "likes", "replies", "reposts"] as const).flatMap((figure) => {
          const label = figureName(item.platform as "x" | "reddit" | "linkedin", figure)
          const value = figure === "replies" ? item.stats.comments : figure === "reposts" ? (item.stats.reposts ?? null) : item.stats[figure]
          return label ? [{ label, value }] : []
        })
      : []
  const deleteWords =
    item.kind === "own"
      ? `"${item.title}" leaves the vault with its notes, its script and its tags.`
      : item.kind === "post"
        ? `"${item.title}" leaves the vault with its notes and its tags. The post stays on ${platform}.`
        : `"${item.title}" leaves the vault with its kept copy, its notes and its tags. The original stays on ${platform}.`

  const actions: MenuAction[] = [
    ...(sourceUrl
      ? [
          {
            label: `Open on ${platform}`,
            icon: <ExternalLinkIcon className="size-4" />,
            onSelect: () => window.open(sourceUrl, "_blank", "noopener,noreferrer"),
          },
          { label: "Copy link", icon: <LinkIcon className="size-4" />, onSelect: () => void copyLink() },
        ]
      : []),
    // Shown only while Viral keeps a copy (Tyler, 6 Nov 2026: "Both ⋮ menus").
    ...(item.hasFile
      ? [{ label: "Download to computer", icon: <HardDriveDownloadIcon className="size-4" />, onSelect: () => downloadToComputer("idea", item.id) }]
      : []),
    {
      label: "Copy to another project",
      icon: <CopyPlusIcon className="size-4" />,
      onSelect: () => setCopying({ kind: "idea", itemId: item.id, title: item.title, post: item.kind === "post" }),
    },
    { label: "Delete from the vault", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting(true) },
  ]

  return (
    <>
      <RecordFrame
        avatar={item.platform ? <SocialIcon social={item.platform} /> : <LightbulbIcon />}
        title={item.title}
        line={item.channelName ? `${platform} · ${item.channelName}` : platform}
        hideLabel="Hide the idea"
        actions={
          <RecordMenu
            label="Idea menu"
            groups={
              <PickGroup title="Idea">
                <PickMenuRow
                  label="Status"
                  value={vaultStatusLabels[item.status]}
                  selected={item.status}
                  options={VAULT_STATUSES.map((status) => ({ value: status, label: vaultStatusLabels[status] }))}
                  onPick={(value) => void update({ status: value as VaultStatus })}
                />
              </PickGroup>
            }
            actions={actions}
          />
        }
        bare
        body={
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {item.kind !== "video" ? null : item.playbackUrl ? (
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
          <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)] content-start gap-3.75", PANEL_GUTTER, item.kind !== "video" && "pt-3.75")}>
          <PanelCard storageId="viral-vault-idea" title="Idea">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <TagField id={`vault-tags-${item.id}`} value={item.tags} known={tags} onChange={(next) => update({ tags: next })} />
            {item.kind === "own" ? (
              // Your own idea's notes are written in the shell's editor, as a project's notes are.
              <div className="grid gap-2">
                <Label>Notes</Label>
                <div className="rounded-md border bg-background">
                  <SavingDocument
                    key={item.id}
                    value={item.notes}
                    placeholder="What it's about, how you'd film it"
                    onSave={(notes) => update({ notes })}
                  />
                </div>
              </div>
            ) : (
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
            )}
          </div>
          </PanelCard>

          {item.post ? (
            <PanelCard storageId="viral-vault-post" title="The post">
              <div className="grid gap-2 text-sm break-words">
                {item.post.community ? <p className="text-xs text-muted-foreground">r/{item.post.community}</p> : null}
                {item.post.title ? <p className="font-medium">{item.post.title}</p> : null}
                <p className="whitespace-pre-wrap">{item.post.text || "This post has no words, only a picture or video."}</p>
                {item.post.link ? (
                  <a href={item.post.link} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground underline">
                    {item.post.link}
                  </a>
                ) : null}
              </div>
            </PanelCard>
          ) : null}

          <PanelCard storageId="viral-vault-numbers" title="Numbers">
            {item.kind === "own" ? (
              <p className="text-sm text-muted-foreground">Your posts of this idea show here once Promo reports them.</p>
            ) : null}
            <dl className="grid gap-2 text-sm empty:hidden">
              {item.kind === "video" ? (
                <>
                  <Detail label="Views" value={formatCount(item.stats.views)} />
                  <Detail label="Likes" value={formatCount(item.stats.likes)} />
                  <Detail label="Comments" value={formatCount(item.stats.comments)} />
                  <Detail label="Outlier" value={badge ?? "-"} />
                  <Detail label="Score" value={item.stats.score === null ? "-" : String(item.stats.score)} />
                  <Detail label="Length" value={formatDuration(item.stats.durationSeconds) || "-"} />
                </>
              ) : item.kind === "post" ? (
                <>
                  {/* In the post's own words: Reddit's upvotes and comments, LinkedIn's reactions. */}
                  {postFigures.map((figure) => (
                    <Detail key={figure.label} label={figure.label} value={formatCount(figure.value)} />
                  ))}
                  <Detail label="Followers" value={formatCount(item.stats.subscribers)} />
                </>
              ) : null}
              {/* Your own posts of it, as Promo reported them (features task part 21). */}
              <YourPostRows itemId={item.id} refreshKey={item.status} />
            </dl>
          </PanelCard>

          {item.analysis ? (
            <AnalysisCards
              pieces={item.analysis}
              topic={item.analysisTopic ?? ""}
              sourceTitle={item.title}
              scriptEdit={{ edited: item.editedScript, onSave: saveScript }}
            />
          ) : item.kind === "own" ? (
            <WriteScriptCard item={item} onChanged={onChanged} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArchiveIcon className="size-4" />
              Saved before any analysis. Open it in its project and press Analyse with AI, then save it again.
            </p>
          )}
          </div>
        </div>
      </ScrollArea>
        }
        footer={
          // The sticky footer, as on the project page (Tyler, 4 Nov 2026: "this should be in the sticky footer").
          <div className="@container flex min-w-0 flex-1 gap-2">
            <div className="min-w-0 flex-1">
              <SendToVideoButton item={item} projectId={item.projectId} onChanged={onChanged} className="w-full" compact />
            </div>
            <div className="min-w-0 flex-1">
              <WritePostForPromoButton itemId={item.id} className="w-full" />
            </div>
          </div>
        }
      />
      <CopyToProjectDialog target={copying} currentProjectId={item.projectId} onClose={() => setCopying(null)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this idea from the vault?"
        description={deleteWords}
        confirmLabel="Delete idea"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}

/**
 * Write a script on your own idea (Tyler, 6 Nov 2026: "Script on a button").
 * The price and the writer show before it runs. The server refuses a sample
 * project and a project with no topic before the AI is asked.
 */
function WriteScriptCard({ item, onChanged }: { item: VaultItem; onChanged: (item: VaultItem) => void }) {
  const [price, setPrice] = React.useState<WriterPrice | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    let live = true
    loadVaultWritingPrices().then(
      (prices) => {
        if (live) setPrice(prices.ownScript)
      },
      () => undefined
    )
    return () => {
      live = false
    }
  }, [])

  async function write() {
    setBusy(true)
    try {
      onChanged(await writeOwnIdeaScriptFn(item.id))
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelCard storageId="viral-vault-own-script" title="Script">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm">
        <p className="text-muted-foreground">
          No script yet. The AI writes one for the project's topic from the title and your notes
          {price ? `, for ${writerPriceWords(price)}.` : "."}
        </p>
        <div>
          <Button type="button" disabled={busy} onClick={() => void write()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            Write a script
          </Button>
        </div>
      </div>
    </PanelCard>
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
