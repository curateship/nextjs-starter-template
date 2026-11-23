import * as React from "react"

import { avatarImageUrl, avatarInitials, avatarTone } from "@/lib/avatar"

// The one way a person is drawn anywhere in the product. Surfaces choose the
// size by setting `--avatar-size` in styles.css, never by passing pixel values
// here, so a member list, a chat line and the leaderboard stay in step.
//
// The name always appears next to the avatar in every surface that uses it, so
// the picture is decorative and carries no alternative text of its own.
export function ProfileAvatar({
  name,
  avatarMediaId,
  className,
}: {
  name: string
  avatarMediaId?: string | null
  className?: string
}) {
  // A picture that has been moderated away mid-session (or that never made it
  // to storage) falls back to the initial instead of a broken image icon.
  // Remembering which id failed means a new picture is tried again.
  const [failedMediaId, setFailedMediaId] = React.useState<string | null>(null)

  return (
    <span className={`p-avatar${className ? ` ${className}` : ""}`} data-tone={avatarTone(name)}>
      {avatarMediaId && avatarMediaId !== failedMediaId ? (
        <img src={avatarImageUrl(avatarMediaId)} alt="" loading="lazy" onError={() => setFailedMediaId(avatarMediaId)} />
      ) : (
        <b aria-hidden="true">{avatarInitials(name)}</b>
      )}
    </span>
  )
}
