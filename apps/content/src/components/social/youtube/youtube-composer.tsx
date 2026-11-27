import * as React from "react"
import { Loader2Icon, SendIcon, SparklesIcon } from "lucide-react"

import { ArchivePickButton, type ArchivePick } from "@/components/archive/archive-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { brakeWords } from "@/lib/bans/options"
import { getArchiveErrorMessage, loadArchiveItem } from "@/lib/api/archive/items"
import { loadArchivePicks } from "@/lib/api/archive/posting"
import { fitWarnings } from "@/lib/archive/fit"
import { getYoutubeErrorMessage, sendYoutubeUpload, writeYoutubeUploadWords, type YoutubeChannel, type YoutubeTemplateRow } from "@/lib/api/social/youtube"
import {
  ABOUT_MAX,
  DESCRIPTION_MAX,
  isShort,
  splitTags,
  tagsLength,
  TAGS_MAX,
  TITLE_MAX,
  uploadWordsProblem,
} from "@/lib/social/youtube/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { channelName } from "@/lib/social/youtube/options"

/** "No template" in the Template dropdown, which a Select cannot hold as "". */
const NO_TEMPLATE = "none"

/**
 * YouTube's New post (YouTube task, parts 3 to 7): the video, from the
 * Archive or the media library, what it is about, the template, Write, three
 * titles to pick from, the title, description and tags, the thumbnail,
 * YouTube's AI question, the channel, and Post.
 *
 * Write fills the boxes in the picked channel's voice; only what is in them
 * when Post is pressed goes out. Post sends the upload to the channel's
 * browser or phone, once. A tall video of three minutes or less goes up as a
 * Short, which takes no thumbnail.
 */
export function YoutubeComposer({
  projectId,
  channel,
  templates,
  channelPicker,
  onPosted,
}: {
  projectId: string
  /** The channel picked in the dropdown above Post, or null when none is. */
  channel: YoutubeChannel | null
  templates: YoutubeTemplateRow[]
  channelPicker: React.ReactNode
  onPosted: () => Promise<void>
}) {
  const [mediaUrl, setMediaUrl] = React.useState("")
  const [pick, setPick] = React.useState<ArchivePick | null>(null)
  const [waitingDraft, setWaitingDraft] = React.useState<{ id: string; title: string } | null>(null)
  const [about, setAbout] = React.useState("")
  const [templateId, setTemplateId] = React.useState<string>(NO_TEMPLATE)
  const [titles, setTitles] = React.useState<string[]>([])
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [thumbnailUrl, setThumbnailUrl] = React.useState("")
  const [aiMade, setAiMade] = React.useState(false)
  /** What the AI last wrote, kept beside what went out. */
  const [drafted, setDrafted] = React.useState({ title: "", description: "" })
  const [writing, setWriting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)

  // A template deleted meanwhile is no longer offered, so the pick falls back to none.
  const template = templates.find((row) => row.id === templateId) ?? null
  const short = pick ? isShort({ width: pick.item.width, height: pick.item.height, durationMs: pick.item.durationMs }) : false
  const tagList = splitTags(tags)
  // A limit passed shows as it is typed; a missing title is said only when Upload is pressed.
  const problem = title.trim() ? uploadWordsProblem({ title, description, tags: tagList }) : null
  const stopped = channelStop(channel)

  // A draft ticked for YouTube in Video's send window waits here, as on Instagram.
  React.useEffect(() => {
    let cancelled = false
    loadArchivePicks(projectId, "youtube").then(
      (answer) => {
        const first = answer.items.find((item) => answer.draftIds.includes(item.id))
        if (!cancelled) setWaitingDraft(first ? { id: first.id, title: first.title || "Untitled" } : null)
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [projectId])

  function applyPick(picked: ArchivePick) {
    setPick(picked)
    setMediaUrl(picked.mediaUrl)
    if (!about.trim()) setAbout([picked.item.title, picked.item.description].filter(Boolean).join(". ").slice(0, ABOUT_MAX))
    if (!description.trim() && picked.caption) setDescription(picked.caption.slice(0, DESCRIPTION_MAX))
  }

  async function applyDraft(itemId: string) {
    try {
      const item = await loadArchiveItem(itemId)
      applyPick({ item, mediaUrl: item.fileUrl, mediaUrls: [item.fileUrl], caption: item.captions.youtube ?? item.caption, warnings: fitWarnings("youtube", item) })
      setWaitingDraft(null)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    }
  }

  async function write() {
    if (!channel) {
      showErrorToast("Pick the channel to post as first, so the words are in its voice.")
      return
    }
    if (!about.trim() && !pick) {
      showErrorToast("Say what the video is about first, in a line or two, or pick a video from the archive.")
      return
    }
    setWriting(true)
    try {
      const words = await writeYoutubeUploadWords({ accountId: channel.id, about, mediaUrl, templateId: template?.id ?? null })
      setTitles(words.titles)
      setTitle(words.titles[0] ?? "")
      setDescription(words.description)
      setTags(words.tags.join(", "))
      setDrafted({ title: words.titles[0] ?? "", description: words.description })
    } catch (failure) {
      showErrorToast(getYoutubeErrorMessage(failure))
    } finally {
      setWriting(false)
    }
  }

  async function post() {
    if (!channel) {
      showErrorToast("Pick the channel to post as, above Post.")
      return
    }
    if (!mediaUrl) {
      showErrorToast("Pick a video from the archive or your media library first.")
      return
    }
    const refused = uploadWordsProblem({ title, description, tags: tagList })
    if (refused) {
      showErrorToast(refused)
      return
    }
    if (stopped) {
      showErrorToast(`${stopped} Nothing was sent.`)
      return
    }
    setPosting(true)
    try {
      await sendYoutubeUpload({
        accountId: channel.id,
        mediaUrl,
        title,
        description,
        tags,
        thumbnailUrl: short ? "" : thumbnailUrl,
        aiMade,
        templateId: template?.id ?? null,
        draftTitle: drafted.title,
        draftDescription: drafted.description,
      })
      setPick(null)
      setMediaUrl("")
      setAbout("")
      setTitles([])
      setTitle("")
      setDescription("")
      setTags("")
      setThumbnailUrl("")
      setAiMade(false)
      setDrafted({ title: "", description: "" })
      await onPosted()
    } catch (failure) {
      showErrorToast(getYoutubeErrorMessage(failure))
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
              <span className="text-muted-foreground">{short ? "Goes up as a Short" : "Goes up as a video"}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setPick(null)
                setMediaUrl("")
              }}
            >
              Clear
            </Button>
          </div>
          {pick.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>
      ) : (
        <ImageUpload label="Video" value={mediaUrl} onChange={(value) => setMediaUrl(value)} aspect="video" showVideos emptyLabel="Pick from the media library" />
      )}
      <div>
        <ArchivePickButton projectId={projectId} network="youtube" onPick={applyPick} label={pick ? "Pick another from the archive" : "From archive"} />
      </div>
      {short ? (
        <p className="text-xs text-muted-foreground">This goes up as a Short: it is tall or square and three minutes or less. A Short takes no thumbnail of its own.</p>
      ) : null}

      <div className="grid gap-2">
        <FieldLabel htmlFor="youtube-about" hint="A line or two for the AI. It is never posted.">
          What the video is about
        </FieldLabel>
        <Textarea
          id="youtube-about"
          value={about}
          maxLength={ABOUT_MAX}
          onChange={(event) => setAbout(event.target.value)}
          placeholder="How to set up the timer for a study night, shown on a phone"
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="youtube-template"
          hint="A description layout this project keeps. Write copies its fixed words as typed and has the AI write the rest. Make them with Templates above the list."
        >
          Description template
        </FieldLabel>
        <Select value={template ? template.id : NO_TEMPLATE} onValueChange={setTemplateId}>
          <SelectTrigger id="youtube-template" className="w-full sm:w-fit sm:min-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
            {templates.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Button type="button" variant="outline" disabled={writing} onClick={() => void write()}>
          {writing ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          Write title and description
        </Button>
      </div>

      {titles.length > 1 ? (
        <div className="grid gap-2">
          <Label>Pick a title</Label>
          <div className="grid gap-1.5">
            {titles.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={choice === title}
                onClick={() => setTitle(choice)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm hover:bg-accent",
                  choice === title && "border-foreground bg-accent font-medium"
                )}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="youtube-title">Title</Label>
        <Input id="youtube-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={title.trim().length > TITLE_MAX ? true : undefined} />
        <p className={cn("text-xs", title.trim().length > TITLE_MAX ? "text-destructive" : "text-muted-foreground")}>
          {title.trim().length} of {TITLE_MAX} characters
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="youtube-description">Description</Label>
        <Textarea
          id="youtube-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={description.length > DESCRIPTION_MAX ? true : undefined}
          placeholder="Write it, or press Write and edit what comes back"
        />
        <p className={cn("text-xs", description.length > DESCRIPTION_MAX ? "text-destructive" : "text-muted-foreground")}>
          {description.length.toLocaleString("en-US")} of {DESCRIPTION_MAX.toLocaleString("en-US")} characters
        </p>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="youtube-tags" hint="Search phrases people type, with a comma between each. YouTube counts them together.">
          Tags
        </FieldLabel>
        <Input id="youtube-tags" value={tags} onChange={(event) => setTags(event.target.value)} aria-invalid={tagsLength(tagList) > TAGS_MAX ? true : undefined} />
        <p className={cn("text-xs", tagsLength(tagList) > TAGS_MAX ? "text-destructive" : "text-muted-foreground")}>
          {tagList.length} {tagList.length === 1 ? "tag" : "tags"} · {tagsLength(tagList)} of {TAGS_MAX} characters
        </p>
      </div>
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

      {short ? null : (
        <div className="grid gap-2">
          <ImageUpload label="Thumbnail" value={thumbnailUrl} onChange={(value) => setThumbnailUrl(value)} aspect="video" emptyLabel="YouTube picks a frame when there is none" />
          <div>
            <ArchivePickButton
              projectId={projectId}
              network="youtube"
              pictures
              label="Thumbnail from archive"
              onPick={(picked) => setThumbnailUrl(picked.mediaUrl)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Only a channel YouTube has verified with a phone number can set its own thumbnail. On any other the video still goes up, and its row says why the thumbnail did not take.</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox id="youtube-ai-made" checked={aiMade} onCheckedChange={(checked) => setAiMade(checked === true)} />
        <FieldLabel
          htmlFor="youtube-ai-made"
          hint="YouTube asks this on every upload: does the video show realistic people, places or events that were made or changed by AI? Tick it and YouTube labels the video."
        >
          AI-made or altered
        </FieldLabel>
      </div>

      <div className="grid gap-2">
        <Label>Post as</Label>
        <div className="flex min-w-0 items-center gap-2">{channelPicker}</div>
        {stopped ? <p className="text-sm text-amber-600 dark:text-amber-400">{stopped}</p> : null}
      </div>
      <div>
        <Button type="button" disabled={posting} onClick={() => void post()}>
          {posting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {channel?.phone ? "Upload from phone" : "Upload"}
        </Button>
      </div>
      {channel ? (
        <p className="text-xs text-muted-foreground">
          {channelName(channel.handle)} uploads it {channel.phone ? "in the YouTube app on its phone" : "in YouTube Studio in its browser"}, Public and not made for kids, once. An upload that fails is
          never tried again by itself.
        </p>
      ) : null}
    </div>
  )
}

/** Why the picked channel cannot take an upload now, in words, or null. */
function channelStop(channel: YoutubeChannel | null): string | null {
  if (!channel) return null
  const name = channelName(channel.handle)
  if (channel.banScreen) return `${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard.`
  if (channel.paused) {
    return channel.paused === "account"
      ? `${name} is paused.`
      : channel.paused === "brake"
        ? brakeWords("youtube")
        : channel.paused === "network"
          ? `This network is paused on ${name}'s project.`
          : `${name}'s project is paused.`
  }
  if (!channel.handle) return `${name}: YouTube has not been read signed in yet. Sign it in, then press Check now on the Accounts dashboard.`
  if (!channel.phone && !channel.profileName) return `${name} runs nowhere. Pick its browser profile or phone on the Accounts dashboard.`
  const phone = channel.phone
  if (phone?.status === "offline") return `${phone.name} is offline: ${phone.offlineReason}.`
  if (phone?.addressStop) return `${phone.name} was stopped for showing the wrong address: ${phone.addressStop}`
  return null
}
