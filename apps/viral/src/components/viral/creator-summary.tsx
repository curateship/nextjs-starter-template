import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { beatsUsualLine, type ViralCreator } from "@/lib/viral/viral"

/**
 * The top of a creator page in the middle panel (Tyler, 4 Nov 2026: "In the
 * middle panel"): their picture, followers, typical views, and how often
 * they double them (`workspace/docs/project-page.md`).
 */
export function CreatorSummary({ creator }: { creator: ViralCreator }) {
  const beats = beatsUsualLine(creator.beatsUsual)
  return (
    <div className="flex items-center gap-3 border-b px-3 py-3">
      <Avatar className="size-10 shrink-0">
        {creator.avatarUrl ? <AvatarImage src={creator.avatarUrl} alt="" /> : null}
        <AvatarFallback>{creator.name.replace(/^@/, "").slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <dl className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-x-4 gap-y-1 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{creatorPlatformLabels[creator.platform]} followers</dt>
          <dd className="font-medium tabular-nums">{formatCount(creator.subscribers)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Typical video</dt>
          <dd className="font-medium tabular-nums">
            {creator.typicalViews === null ? "-" : `${formatCount(creator.typicalViews)} views`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Hits</dt>
          <dd className="font-medium">{beats ?? "Too few videos to say yet"}</dd>
        </div>
      </dl>
    </div>
  )
}
