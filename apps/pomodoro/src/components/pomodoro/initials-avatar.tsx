import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Coloured initials seeded from the display name — no stock faces. The old
 * app shipped four photo avatars and handed everyone one of them; a name the
 * person chose says more and never puts a stranger's face on a stranger.
 */
export function InitialsAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white",
        className
      )}
      style={{ backgroundColor: `hsl(${hash} 55% 45%)` }}
    >
      {initials || "?"}
    </span>
  )
}

/**
 * A person's own photo when they uploaded one, their coloured initials when
 * not. The photo is always one the account uploaded itself (`users.avatar_url`),
 * so it can be drawn as it stands.
 */
export function PersonAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl: string | null
  className?: string
}) {
  // A photo that will not load falls back to the initials, never a broken
  // image.
  const [failed, setFailed] = React.useState<string | null>(null)
  if (!avatarUrl || failed === avatarUrl) return <InitialsAvatar name={name} className={className} />
  return (
    <img
      src={avatarUrl}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(avatarUrl)}
      className={cn("size-8 shrink-0 rounded-full object-cover", className)}
    />
  )
}
