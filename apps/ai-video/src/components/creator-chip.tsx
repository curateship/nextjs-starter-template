import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { creatorInitials } from "@/lib/dashboard-format"
import { cn } from "@/lib/utils"

type ChipCreator = {
  username: string
  display_name: string | null
  avatar_url: string | null
}

// Author chip (avatar + name + @handle) overlaid on a gallery thumbnail. The
// caller positions and tints the wrapper via className; renders nothing when
// there's no creator.
export function CreatorChip({
  creator,
  className,
}: {
  creator: ChipCreator | null
  className?: string
}) {
  if (!creator) return null
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 backdrop-blur-sm",
        className
      )}
    >
      <Avatar className="size-7 shrink-0">
        {creator.avatar_url ? (
          <AvatarImage src={creator.avatar_url} alt="" />
        ) : null}
        <AvatarFallback className="text-[10px]">
          {creatorInitials(creator)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate text-xs font-medium text-white">
          {creator.display_name ?? creator.username}
        </span>
        <span className="block truncate text-[10px] text-white/70">
          @{creator.username}
        </span>
      </span>
    </span>
  )
}
