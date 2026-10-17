import * as React from "react"
import { Loader2Icon, SendIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getPhoneAppErrorMessage, sendAppPost, writeCaption, type AppAccount } from "@/lib/api/social/phone-apps"
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
  account,
  accountPicker,
  onPosted,
}: {
  network: PhoneAppNetwork
  /** The account picked in the dropdown above Post, or null when none is. */
  account: AppAccount | null
  accountPicker: React.ReactNode
  onPosted: () => Promise<void>
}) {
  const [mediaUrl, setMediaUrl] = React.useState("")
  const [about, setAbout] = React.useState("")
  const [caption, setCaption] = React.useState("")
  /** What the AI last wrote, kept beside what went out. */
  const [drafted, setDrafted] = React.useState("")
  const [drafting, setDrafting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const problem = captionProblem(network, caption)
  const tags = hashtagCount(caption)
  const most = HASHTAG_MAX[network]
  const kind = VIDEO_ENDINGS.test(mediaUrl) ? "video" : "photo"
  const phone = account?.phone ?? null
  const stopped = phoneStop(account)

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
      showErrorToast("Pick a photo or video from your media library first.")
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
      await sendAppPost({ accountId: account.id, mediaUrl, caption, draftCaption: drafted })
      toast.success(`Sent to ${phone?.name ?? "the phone"}. It posts in the ${NETWORK_NAMES[network]} app, once, and shows under Posts.`)
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
      <ImageUpload
        label="Photo or video"
        value={mediaUrl}
        onChange={(value) => setMediaUrl(value)}
        aspect="square"
        showVideos
        emptyLabel="Pick from the media library"
      />
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
function phoneStop(account: AppAccount | null): string | null {
  if (!account) return null
  const name = account.handle ? `@${account.handle}` : "This account"
  if (account.banScreen) return `${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard.`
  if (account.paused) return account.paused === "account" ? `${name} is paused.` : `${name}'s project is paused.`
  const phone = account.phone
  if (!phone) return `${name} is on no phone. Pick its phone on the Accounts dashboard.`
  if (phone.status === "offline") return `${phone.name} is offline: ${phone.offlineReason}.`
  if (phone.addressStop) return `${phone.name} was stopped for showing the wrong address: ${phone.addressStop}`
  return null
}
