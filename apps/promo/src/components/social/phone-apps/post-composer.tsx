import * as React from "react"
import { brakeWords } from "@/lib/bans/options"
import { Loader2Icon, SendIcon, SparklesIcon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArchivePickButton, type ArchivePick } from "@/components/archive/archive-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { getArchiveErrorMessage, loadArchiveItem } from "@/lib/api/archive/items"
import { loadArchivePicks, sendAppPosts } from "@/lib/api/archive/posting"
import { fitWarnings } from "@/lib/archive/fit"
import { getPhoneAppErrorMessage, writeCaption, type AppAccount } from "@/lib/api/social/phone-apps"
import { slotWords } from "@/lib/phones/options"
import { NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { ABOUT_MAX, appAccountName, CAPTION_MAX, captionProblem, hashtagCount, HASHTAG_MAX } from "@/lib/social/phone-apps"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"


/** A video's address ends in one of these; anything else is posted as a photo. */
const VIDEO_ENDINGS = /\.(mp4|mov|webm|m4v)(\?|$)/i

/**
 * A new post: the photo or video from the media library, what it is about,
 * the caption, and Post (phone farm file 06, parts 34 and 35).
 *
 * Draft writes a caption and hashtags in the picked account's voice from
 * what Tyler says the post is about, into the box, to be edited. Only what
 * is in the box when Post is pressed goes out. Post sends it to the
 * account's phone, which puts the file in its gallery and posts it through
 * the app, once.
 */
export function PostComposer({
  network,
  projectId,
  account,
  accounts,
  accountPicker,
  guest = false,
  onPosted,
}: {
  network: PhoneAppNetwork
  projectId: string
  /** The account picked in the dropdown above Post, or null when none is. */
  account: AppAccount | null
  /** Every account of this network in the project, for "Also post from" (part 39). */
  accounts: AppAccount[]
  accountPicker: React.ReactNode
  /** A guest from Project posts from the archive only (part 33). */
  guest?: boolean
  onPosted: () => Promise<void>
}) {
  const [mediaUrl, setMediaUrl] = React.useState("")
  /** The archive item picked, with its slides for a carousel and its warnings (parts 34, 37, 38, 40). */
  const [pick, setPick] = React.useState<ArchivePick | null>(null)
  const [alsoFrom, setAlsoFrom] = React.useState<Set<string>>(new Set())
  const [waitingDraft, setWaitingDraft] = React.useState<{ id: string; title: string } | null>(null)
  const [about, setAbout] = React.useState("")
  const [caption, setCaption] = React.useState("")
  /** What the AI last wrote, kept beside what went out. */
  const [drafted, setDrafted] = React.useState("")
  const [drafting, setDrafting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const problem = captionProblem(network, caption)
  const tags = hashtagCount(caption)
  const most = HASHTAG_MAX[network]
  const kind = pick ? (pick.item.kind === "video" ? "video" : "photo") : VIDEO_ENDINGS.test(mediaUrl) ? "video" : "photo"
  const carousel = pick?.item.kind === "carousel" ? pick.mediaUrls : null
  const others = accounts.filter((row) => row.id !== account?.id)

  // A draft ticked for this network in Video's send window waits here (part 35).
  React.useEffect(() => {
    let cancelled = false
    loadArchivePicks(projectId, network).then(
      (answer) => {
        const first = answer.items.find((item) => answer.draftIds.includes(item.id))
        if (!cancelled) setWaitingDraft(first ? { id: first.id, title: first.title || "Untitled" } : null)
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [network, projectId])

  function applyPick(picked: ArchivePick) {
    setPick(picked)
    setMediaUrl(picked.mediaUrl)
    if (!caption.trim() && picked.caption) setCaption(picked.caption)
    if (!about.trim()) setAbout([picked.item.title, picked.item.description].filter(Boolean).join(". ").slice(0, ABOUT_MAX))
  }

  async function applyDraft(itemId: string) {
    try {
      const item = await loadArchiveItem(itemId)
      const mediaUrls = item.kind === "carousel" ? item.slideFiles.map((slide) => slide.url) : [item.fileUrl]
      applyPick({ item, mediaUrl: mediaUrls[0] ?? "", mediaUrls, caption: item.captions[network] ?? item.caption, warnings: fitWarnings(network, item) })
      setWaitingDraft(null)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    }
  }
  const phone = account?.phone ?? null
  const stopped = phoneStop(account, network)

  async function draft() {
    if (!account) {
      showErrorToast("Pick the account to post as first, so the caption is in its voice.")
      return
    }
    if (!about.trim()) {
      showErrorToast("Say what the post is about first, in a line or two.")
      return
    }
    setDrafting(true)
    try {
      const { caption: written } = await writeCaption({ accountId: account.id, about, kind })
      setCaption(written)
      setDrafted(written)
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setDrafting(false)
    }
  }

  async function post() {
    if (!account) {
      showErrorToast("Pick the account to post as, above Post.")
      return
    }
    if (!mediaUrl) {
      showErrorToast(guest ? "Pick something from the archive first." : "Pick a photo or video from your media library or the archive first.")
      return
    }
    if (problem) {
      showErrorToast(problem)
      return
    }
    if (stopped) {
      showErrorToast(`${stopped} Nothing was sent.`)
      return
    }
    setPosting(true)
    try {
      const accountIds = [account.id, ...others.filter((row) => alsoFrom.has(row.id)).map((row) => row.id)]
      const result = await sendAppPosts({ accountIds, mediaUrl, mediaUrls: carousel ?? undefined, caption, draftCaption: drafted })
      if (!result.sent) {
        showErrorToast(result.refused[0] ? getPhoneAppErrorMessage(new Error(result.refused[0].reason)) : "Nothing was sent.")
        return
      }
      for (const refusal of result.refused) {
        const name = appAccountName(network, accounts.find((row) => row.id === refusal.accountId)?.handle ?? "")
        showErrorToast(`${name} didn't post: ${getPhoneAppErrorMessage(new Error(refusal.reason))}`)
      }
      setPick(null)
      setAlsoFrom(new Set())
      setMediaUrl("")
      setAbout("")
      setCaption("")
      setDrafted("")
      await onPosted()
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      {waitingDraft && !pick ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
          <span className="min-w-0 flex-1">A draft from the archive is waiting: {waitingDraft.title}</span>
          <Button type="button" size="sm" onClick={() => void applyDraft(waitingDraft.id)}>
            Use it
          </Button>
        </div>
      ) : null}
      {pick ? (
        <div className="grid gap-2">
          <Label>From the archive</Label>
          <div className="flex items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {pick.item.coverUrl ? <img src={pick.item.coverUrl} alt="" className="size-full object-cover" /> : null}
            </span>
            <div className="grid min-w-0 gap-0.5 text-sm">
              <span className="truncate font-medium">{pick.item.title || "Untitled"}</span>
              <span className="text-muted-foreground">
                {carousel ? `${carousel.length} pictures in one post` : pick.item.kind === "video" ? "Video" : "Picture"}
              </span>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => { setPick(null); setMediaUrl("") }}>
              Clear
            </Button>
          </div>
          {pick.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>
      ) : guest ? null : (
        <ImageUpload
          label="Photo or video"
          value={mediaUrl}
          onChange={(value) => setMediaUrl(value)}
          aspect="square"
          showVideos
          emptyLabel="Pick from the media library"
        />
      )}
      <div>
        <ArchivePickButton projectId={projectId} network={network} onPick={applyPick} label={pick ? "Pick another from the archive" : "From archive"} />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`about-${network}`} hint="A line or two for the AI. It is never posted.">
          What the post is about
        </FieldLabel>
        <Textarea
          id={`about-${network}`}
          value={about}
          maxLength={ABOUT_MAX}
          onChange={(event) => setAbout(event.target.value)}
          placeholder="Our new timer mode, shown on a phone, for people who study at night"
        />
      </div>
      <div>
        <Button type="button" variant="outline" disabled={drafting} onClick={() => void draft()}>
          {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          Draft caption
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`caption-${network}`}>Caption</Label>
        <Textarea
          id={`caption-${network}`}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          aria-invalid={problem ? true : undefined}
          placeholder="Write it, or press Draft caption and edit what comes back"
        />
        <p className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
          {problem ??
            `${caption.length.toLocaleString("en-US")} of ${CAPTION_MAX[network].toLocaleString("en-US")} characters · ${tags} ${tags === 1 ? "hashtag" : "hashtags"}${most === null ? "" : ` of ${most}`}`}
        </p>
      </div>
      <div className="grid gap-2">
        <Label>Post as</Label>
        <div className="flex min-w-0 items-center gap-2">{accountPicker}</div>
        {stopped ? <p className="text-sm text-amber-600 dark:text-amber-400">{stopped}</p> : null}
      </div>
      {others.length ? (
        <div className="grid gap-2">
          <Label>Also post from</Label>
          {others.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <Checkbox
                id={`also-${network}-${row.id}`}
                checked={alsoFrom.has(row.id)}
                onCheckedChange={() =>
                  setAlsoFrom((current) => {
                    const next = new Set(current)
                    if (next.has(row.id)) next.delete(row.id)
                    else next.add(row.id)
                    return next
                  })
                }
              />
              <Label htmlFor={`also-${network}-${row.id}`} className="font-normal">
                {appAccountName(network, row.handle)}
                {row.phone ? <span className="text-muted-foreground"> · {row.phone.name}</span> : null}
              </Label>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">One press posts from every ticked account straight away, each on its own phone.</p>
        </div>
      ) : null}
      <div>
        <Button type="button" disabled={posting} onClick={() => void post()}>
          {posting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {phone ? `Post from phone${phone.shelfSlot ? ` · ${slotWords(phone.shelfSlot)}` : ""}` : "Post from phone"}
        </Button>
      </div>
      {account ? (
        <p className="text-xs text-muted-foreground">
          {appAccountName(network, account.handle)} posts it in the {NETWORK_NAMES[network]} app on its phone, once. A post that
          fails is never tried again by itself.
        </p>
      ) : null}
    </div>
  )
}

/** Why the picked account's phone cannot take a post now, in words, or null. */
function phoneStop(account: AppAccount | null, network: PhoneAppNetwork): string | null {
  if (!account) return null
  const name = account.handle ? `@${account.handle}` : "This account"
  if (account.banScreen) return `${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard.`
  if (account.paused) {
    return account.paused === "account"
      ? `${name} is paused.`
      : account.paused === "brake"
        ? brakeWords(network)
        : account.paused === "network"
        ? `This network is paused on ${name}'s project.`
        : `${name}'s project is paused.`
  }
  const phone = account.phone
  if (!phone) return `${name} is on no phone. Pick its phone on the Accounts dashboard.`
  if (phone.status === "offline") return `${phone.name} is offline: ${phone.offlineReason}.`
  if (phone.addressStop) return `${phone.name} was stopped for showing the wrong address: ${phone.addressStop}`
  return null
}
