import * as React from "react"
import { Loader2Icon, MessageSquareQuoteIcon, SparklesIcon, Trash2Icon } from "lucide-react"

import { ActionRow } from "@/components/crm/crm-record-menu"
import { RecordFrame } from "@/components/crm/record-frame"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getVoiceErrorMessage,
  loadTryPosts,
  saveVoice,
  tryVoiceOn,
  type VoiceView,
} from "@/lib/api/social/voices"
import { useAutoSave } from "@/lib/hooks/use-auto-save"
import { voiceUsersWords } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type Words = { name: string; voice: string; commentRules: string }

/**
 * One voice on the Projects dashboard's right panel (Tyler, 12 Nov 2026):
 * who uses it, its name, how it sounds and the lines it must not cross,
 * each saving itself 700ms after the last letter, then Try it. What you make
 * is the project's description. Saving changes every account using it,
 * which is why who uses it is said first. Delete is in the ⋮.
 */
export function VoiceRecord({
  voice,
  onSaved,
  onDelete,
}: {
  voice: VoiceView
  /** The list behind reads again, so its name and first line follow. */
  onSaved: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const draft = useAutoSave<Words>(
    { name: voice.name, voice: voice.voice, commentRules: voice.commentRules },
    {
      save: async (words) => {
        await saveVoice(voice.id, words)
        onSaved()
      },
      describeError: getVoiceErrorMessage,
      blockedReason: (words) => (words.name.trim() ? null : "Give the voice a name first."),
    }
  )
  const set = (key: keyof Words) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value
    draft.change((current) => ({ ...current, [key]: next }))
  }
  const flush = () => void draft.saveNow()

  return (
    <RecordFrame
      avatar={<MessageSquareQuoteIcon aria-hidden />}
      title={draft.value.name.trim() || "Untitled voice"}
      line={voiceUsersWords(voice.usedBy)}
      hideLabel="Hide the voice"
      actions={
        <TabbedMenu
          label="Voice menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid p-3">
                  <ActionRow
                    destructive
                    icon={<Trash2Icon className="size-4" />}
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete()
                    }}
                  >
                    Delete
                  </ActionRow>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-3.75">
          <div className="grid gap-2">
            <Label htmlFor="voice-name">Name</Label>
            <Input
              id="voice-name"
              value={draft.value.name}
              placeholder="Main voice"
              aria-invalid={!draft.value.name.trim() || undefined}
              onChange={set("name")}
              onBlur={flush}
              onKeyDown={(event) => {
                if (event.key === "Enter") flush()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="voice-words">How it sounds</Label>
            <Textarea
              id="voice-words"
              rows={1}
              value={draft.value.voice}
              placeholder="Plain and direct. I have run a small agency for six years, so I answer from experience rather than theory."
              onChange={set("voice")}
              onBlur={flush}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="voice-rules">Lines the AI must not cross</Label>
            <Textarea
              id="voice-rules"
              rows={1}
              value={draft.value.commentRules}
              placeholder="Never pretend to be a customer. Never claim a number I have not given you."
              onChange={set("commentRules")}
              onBlur={flush}
            />
          </div>
          <TryVoice voice={voice} words={draft.value} />
        </div>
      }
    />
  )
}

/**
 * Two drafts in this voice for a real post already found, so a voice is
 * tuned in a minute: change its words above, try again, compare. Uses the
 * words on screen even before they are saved. Nothing is stored or sent.
 */
function TryVoice({ voice, words }: { voice: VoiceView; words: Words }) {
  const [posts, setPosts] = React.useState<Array<{ id: string; title: string; subreddit: string }> | null>(null)
  const [postId, setPostId] = React.useState("")
  const [drafts, setDrafts] = React.useState<string[]>([])
  const [trying, setTrying] = React.useState(false)

  React.useEffect(() => {
    let live = true
    loadTryPosts().then(
      (rows) => {
        if (!live) return
        setPosts(rows)
        setPostId((current) => current || rows[0]?.id || "")
      },
      () => {
        if (live) setPosts([])
      }
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t pt-4" aria-label="Try it">
      <h3 className="text-sm font-medium">Try it</h3>
      {posts === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the newest posts
        </p>
      ) : !posts.length ? (
        <p className="text-sm text-muted-foreground">
          No posts found yet. Run a keyword on a project&apos;s page, then try the voice on one of its posts.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor="voice-try-post">On this post</Label>
            <Select value={postId} onValueChange={setPostId}>
              <SelectTrigger id="voice-try-post" className="w-full min-w-0 [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {posts.map((post) => (
                  <SelectItem key={post.id} value={post.id}>
                    r/{post.subreddit} · {post.title.slice(0, 80)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={trying}
            onClick={async () => {
              setTrying(true)
              try {
                setDrafts(
                  await tryVoiceOn({
                    voiceId: voice.id,
                    findId: postId,
                    voice: words.voice,
                    commentRules: words.commentRules,
                  })
                )
              } catch (error) {
                showErrorToast(getVoiceErrorMessage(error))
              } finally {
                setTrying(false)
              }
            }}
          >
            {trying ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {drafts.length ? "Try again" : "Write two drafts"}
          </Button>
          {drafts.map((draft, index) => (
            <p key={index} className="rounded-lg border p-3 text-sm whitespace-pre-wrap">
              {draft}
            </p>
          ))}
        </>
      )}
    </section>
  )
}
