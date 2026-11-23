import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { cn } from "@/lib/utils"

/**
 * The picture on a public profile: the person's own upload when there is
 * one, and the coloured initials when there is not.
 *
 * This sits beside `initials-avatar.tsx` rather than changing it, because
 * that file's decision still stands. The old app shipped four stock faces and
 * handed everyone one of them, which is why this app gives nobody a face they
 * did not choose. A picture somebody uploaded themselves is a different
 * thing: it is their choice rather than an assignment, and `isOwnedImageUrl`
 * (`src/server/media/library.ts`) is what stops anyone setting a stranger's
 * upload as their own. Tyler's call, 2 Oct 2026.
 *
 * The header's account menu draws it too, because there it is your own face.
 * Everywhere else in this app — the leaderboard, room chat — stays initials.
 */
export function ProfilePhoto({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl: string | null
  className?: string
}) {
  if (!avatarUrl) return <InitialsAvatar name={name} className={className} />
  return (
    <img
      src={avatarUrl}
      // Smaller copies, the same way the brand logo asks for them. Without
      // this a public profile serves whatever the person uploaded, at full
      // size, to every phone that opens it.
      srcSet={mediaImageSrcSet(avatarUrl)}
      sizes="80px"
      // The name rather than "profile picture": a screen reader reading the
      // page aloud should say whose face it is.
      alt={name}
      loading="lazy"
      decoding="async"
      className={cn(
        "size-8 shrink-0 rounded-full border bg-muted object-cover",
        className
      )}
    />
  )
}
