import { AtSignIcon, BriefcaseBusinessIcon, MessagesSquareIcon, MusicIcon, SmartphoneIcon, SquarePlayIcon, UsersRoundIcon, XIcon } from "lucide-react"

import {
  LIBRARY_COLOUR_DOT,
  SOURCE_DOT,
  SOURCE_LABEL,
  type ImportSource,
  type LibraryColour,
  type NoteSource,
} from "@/lib/note/library/notes"
import { cn } from "@/lib/utils"

/** The dot beside a library's name, in the colour picked for it. */
export function LibraryDot({ colour, className }: { colour: LibraryColour; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", LIBRARY_COLOUR_DOT[colour], className)} />
}

/**
 * Where a note came from, as the Source column draws it: a coloured dot and
 * the name, "Note" with a grey dot for one written by hand (Tyler, 20 Oct
 * 2026). The name is always written, so the colour is never the only sign.
 */
export function SourceMark({ source, className }: { source: NoteSource; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", SOURCE_DOT[source])} />
      <span className="truncate">{SOURCE_LABEL[source]}</span>
    </span>
  )
}

/** The Instagram mark, the same path the shell's public footer draws; lucide has no brand marks. */
const INSTAGRAM_PATH =
  "M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3"

/** The icon beside each source on the Import menu, as Tyler's picture draws them. */
export function SourceIcon({ source, className }: { source: ImportSource; className?: string }) {
  const iconClass = cn("size-4 shrink-0", className)
  switch (source) {
    case "youtube_long":
      return <SquarePlayIcon className={iconClass} aria-hidden />
    case "youtube_short":
      return <SmartphoneIcon className={iconClass} aria-hidden />
    case "instagram":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d={INSTAGRAM_PATH} />
        </svg>
      )
    case "tiktok":
      return <MusicIcon className={iconClass} aria-hidden />
    case "x":
      return <XIcon className={iconClass} aria-hidden />
    case "threads":
      return <AtSignIcon className={iconClass} aria-hidden />
    case "linkedin":
      return <BriefcaseBusinessIcon className={iconClass} aria-hidden />
    case "facebook":
      return <UsersRoundIcon className={iconClass} aria-hidden />
    case "reddit":
      return <MessagesSquareIcon className={iconClass} aria-hidden />
  }
}
