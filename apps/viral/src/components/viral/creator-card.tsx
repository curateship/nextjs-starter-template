import { ExternalLinkIcon, EyeOffIcon, Loader2Icon, UserIcon } from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import {
  creatorPlatformLabels,
  formatCount,
} from "@/lib/viral/creators"
import type { ViralCreator } from "@/lib/viral/viral"

/**
 * The right panel when a creator is picked instead of a video: who they are,
 * how big, how often they post, and the three things to do about them.
 * Following them adds them to this project; a creator followed in other
 * projects stays in those when unfollowed here.
 */
export function CreatorCard({
  creator,
  postsPerWeek,
  busy,
  hiding,
  onFollow,
  onUnfollow,
  onHide,
}: {
  creator: ViralCreator
  /** Worked out from the uploads on screen when the card has none of its own. */
  postsPerWeek: number | null
  /** Following or unfollowing is running. */
  busy: boolean
  /** Hiding the channel is running. */
  hiding: boolean
  onFollow: () => void
  onUnfollow: () => void
  onHide: () => void
}) {
  const platform = creatorPlatformLabels[creator.platform]
  const rate = creator.postsPerWeek ?? postsPerWeek
  return (
    <RecordFrame
      avatar={<UserIcon />}
      title={creator.name}
      // The name and handle are the header's alone: the picture and name repeated
      // under it are gone (Tyler, 21 Nov 2026: "remove this").
      line={creator.handle ? `${platform} · @${creator.handle}` : platform}
      hideLabel="Hide the creator"
      body={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.75 pt-3.75">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 rounded-lg border p-2 text-center">
            <Figure
              label="Subscribers"
              value={formatCount(creator.subscribers)}
            />
            <Figure label="Hits here" value={String(creator.hits)} />
            <Figure
              label="Per week"
              value={rate === null ? "-" : String(rate)}
            />
          </dl>
          {rate === null ? (
            <p className="text-xs text-muted-foreground">
              Not enough posts yet to say how often they post.
            </p>
          ) : null}

          {/* The buttons' words wrap rather than run past a narrow panel. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-8 [&_[data-slot=button]]:min-w-0 [&_[data-slot=button]]:shrink [&_[data-slot=button]]:whitespace-normal">
            {creator.followedId ? (
              <Button variant="outline" disabled={busy || hiding} onClick={onUnfollow}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Unfollow in this project
              </Button>
            ) : (
              <Button disabled={busy || hiding} onClick={onFollow}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Follow
              </Button>
            )}
            {creator.profileUrl ? (
              <Button variant="outline" asChild>
                <a
                  href={creator.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <ExternalLinkIcon />
                  Open their profile
                </a>
              </Button>
            ) : null}
            <Button variant="ghost" disabled={busy || hiding} onClick={onHide}>
              {hiding ? <Loader2Icon className="animate-spin" /> : <EyeOffIcon />}
              Hide from this project
            </Button>
          </div>

          {/* The panel's cards, marked as its body, so the first follows Settings
              -> Styling -> Panel cards -> Opacity; the avatar and buttons above
              are not cards (UI standard, "A side panel's body"). */}
          <div data-side-panel-body="" className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <PanelCard
            storageId="viral-creator-scores"
            title="Their results here"
          >
            <p className="text-sm text-muted-foreground">
              {creator.hits
                ? creator.typicalScore === null
                  ? `${creator.hits} of this project's videos are theirs, with no typical score yet.`
                  : `${creator.hits} of this project's videos are theirs, with a typical score of ${creator.typicalScore}.`
                : "None of this project's search results are theirs yet."}
            </p>
          </PanelCard>
          </div>
        </div>
      }
    />
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  )
}
