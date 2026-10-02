import { LinkIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatTimeAgo } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { socialProfileUrl } from "@/lib/trade/social/creator"
import type { SocialCreator } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * This creator, down the left: how many people follow them, and where else
 * they point.
 *
 * **Two things and no more.** It used to carry eight tiles of counting —
 * posts held, posts a week, first post, last post, markets named, tracked
 * since — and Tyler cut the lot on 29 Sep 2026: none of them told him
 * anything he could not see in the posts beside them, and the post count was
 * already in the middle panel's own header.
 *
 * Both numbers come from the creator's public X page, read when this screen
 * opens. Never from the pasting, which knows nothing about the account.
 */
export function SocialFiguresPanel({ creator }: { creator: SocialCreator }) {
  return (
    <>
      <DashboardCardTitleHeader
        // The way back to the list, in the square an icon would otherwise
        // repeat the title in. This screen is always opened from `/social`,
        // even when the address was pasted.
        back={{ to: "/social", label: "Back to the feed" }}
        icon={null}
        title={
          // Their picture beside their name, both read from their X page. The
          // link on the pair opens that page.
          <a
            href={socialProfileUrl(creator.handle)}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md hover:underline",
              focusRing
            )}
          >
            <Avatar size="sm">
              {creator.picture ? (
                <AvatarImage src={creator.picture} alt="" />
              ) : null}
              <AvatarFallback>
                {creator.handle.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate">@{creator.handle}</span>
          </a>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-5 px-5 py-4">
          <div className="grid gap-0.5">
            <span className="text-[11px] text-muted-foreground">Followers</span>
            <span className="text-2xl leading-tight font-semibold tracking-tight tabular-nums">
              {creator.followers === null
                ? "—"
                : creator.followers.toLocaleString()}
            </span>
            <span className="text-[10px] leading-tight text-muted-foreground">
              {creator.followers === null
                ? "X has not been read yet"
                : creator.followersAt
                  ? `read ${formatTimeAgo(new Date(creator.followersAt))}`
                  : "from their X page"}
            </span>
          </div>

          <div className="grid gap-2">
            <span className="text-[11px] text-muted-foreground">Links</span>
            {creator.links.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This creator lists no links on X, or their page has not been
                read yet.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {creator.links.map((link) => (
                  <li
                    key={link.url}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <LinkIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener nofollow"
                      title={link.url}
                      className={cn(
                        "min-w-0 truncate rounded-sm text-xs hover:underline",
                        focusRing
                      )}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
