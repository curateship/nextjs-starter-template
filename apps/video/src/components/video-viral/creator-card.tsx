import { ExternalLinkIcon, EyeOffIcon, Loader2Icon, UserIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  creatorPlatformLabels,
  formatCount,
} from "@/lib/video/creators"
import type { ViralCreator } from "@/lib/video/viral"

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
  onFollow,
  onUnfollow,
  onHide,
}: {
  creator: ViralCreator
  /** Worked out from the uploads on screen when the card has none of its own. */
  postsPerWeek: number | null
  busy: boolean
  onFollow: () => void
  onUnfollow: () => void
  onHide: () => void
}) {
  const platform = creatorPlatformLabels[creator.platform]
  const rate = creator.postsPerWeek ?? postsPerWeek
  return (
    <>
      <DashboardCardTitleHeader
        icon={<UserIcon />}
        title={creator.name}
        meta={platform}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-14">
              {creator.avatarUrl ? (
                <AvatarImage src={creator.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>
                {creator.name.replace(/^@/, "").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5">
              <p className="truncate font-medium">{creator.name}</p>
              {creator.handle ? (
                <p className="truncate text-xs text-muted-foreground">
                  @{creator.handle}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-lg border p-2 text-center">
            <Figure
              label="Subscribers"
              value={formatCount(creator.subscribers)}
            />
            <Figure label="Hits here" value={String(creator.hits)} />
            <Figure
              label="Per week"
              value={rate === null ? "—" : String(rate)}
            />
          </dl>
          {rate === null ? (
            <p className="text-xs text-muted-foreground">
              Not enough posts yet to say how often they post.
            </p>
          ) : null}

          <div className="grid gap-2">
            {creator.followedId ? (
              <Button variant="outline" disabled={busy} onClick={onUnfollow}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Unfollow in this project
              </Button>
            ) : (
              <Button disabled={busy} onClick={onFollow}>
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
            <Button variant="ghost" disabled={busy} onClick={onHide}>
              <EyeOffIcon />
              Hide from this project
            </Button>
          </div>

          <InspectorCard
            storageId="viral-creator-scores"
            title="Their results here"
          >
            <p className="text-sm text-muted-foreground">
              {creator.hits
                ? `${creator.hits} of this project's videos are theirs, with a typical score of ${creator.typicalScore ?? "—"}.`
                : "None of this project's search results are theirs yet."}
            </p>
          </InspectorCard>
        </div>
      </ScrollArea>
    </>
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
